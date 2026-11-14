import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "../../../lib/env";
import { getAdminClient } from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return new Response('event: unavailable\ndata: {"reason":"supabase"}\n\n', {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let busy = false;
      let lastId = 0;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      request.signal.addEventListener("abort", close);

      try {
        const { data } = await getAdminClient()
          .from("site_events")
          .select("id")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastId = Number(data?.id ?? 0);
      } catch {
        // If the table is missing, keep the connection alive for the next deploy.
      }

      send(`event: ready\ndata: {"lastId":${lastId}}\n\n`);

      const poll = async () => {
        if (closed || busy) return;
        busy = true;
        try {
          const { data, error } = await getAdminClient()
            .from("site_events")
            .select("id,topic,action,created_at")
            .gt("id", lastId)
            .order("id", { ascending: true })
            .limit(50);
          if (error || !data?.length) return;
          for (const row of data) {
            lastId = Math.max(lastId, Number(row.id));
            send(
              `event: change\ndata: ${JSON.stringify({
                id: row.id,
                topic: row.topic,
                action: row.action,
                at: row.created_at,
              })}\n\n`,
            );
          }
        } catch {
          // Transient database error; the next tick retries.
        } finally {
          busy = false;
        }
      };

      timer = setInterval(() => void poll(), 3000);
      heartbeat = setInterval(() => send(": ping\n\n"), 15000);
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
