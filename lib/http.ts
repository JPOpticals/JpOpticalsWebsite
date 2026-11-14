import { NextResponse } from "next/server";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Something went wrong. Please try again.";
  console.error("[api]", error);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export function parseJsonBody<T>(value: unknown): T {
  if (value && typeof value === "object") return value as T;
  throw new HttpError(400, "Invalid request body");
}
