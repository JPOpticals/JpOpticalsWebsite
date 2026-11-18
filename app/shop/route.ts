import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getCatalog } from "../../lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type ShopProduct = {
  id?: number | string;
  name?: unknown;
  image?: string | null;
  price?: unknown;
  url?: string | null;
  type?: string | null;
  gender?: string | null;
  sortOrder?: number | string | null;
  subcategoryIds?: unknown[];
  transitions?: unknown;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[character];
  });

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();

const hasTransitions = (product: ShopProduct) =>
  Array.isArray(product.subcategoryIds)
    ? product.subcategoryIds.includes("transitions")
    : product.transitions === true;

const shellFor = (params: URLSearchParams) => {
  const type = lower(params.get("type_frame"));
  const gender = lower(params.get("gender"));
  if (type === "sunglasses") return "shop-type-frame-sunglasses.html";
  if (type === "optical") return "shop-type-frame-optical.html";
  if (gender === "male") return "shop-gender-male.html";
  if (gender === "female") return "shop-gender-female.html";
  return "shop.html";
};

const filterProducts = (products: ShopProduct[], params: URLSearchParams) => {
  const type = lower(params.get("type_frame"));
  const lens = lower(params.get("lens"));
  const gender = lower(params.get("gender"));
  const genderAvailable = products.some((product) => lower(product.gender));
  const wantedGenders =
    gender === "male"
      ? ["male", "unisex"]
      : gender === "female"
        ? ["female", "unisex"]
        : gender
          ? [gender]
          : [];

  return products.filter((product) => {
    if (type && lower(product.type) !== type) return false;
    if (lens === "transitions" && !hasTransitions(product)) return false;
    if (
      genderAvailable &&
      wantedGenders.length &&
      !wantedGenders.includes(lower(product.gender))
    ) {
      return false;
    }
    return true;
  });
};

const sortProducts = (products: ShopProduct[]) =>
  products
    .map((product, index) => {
      const raw = product.sortOrder;
      const sortOrder =
        raw !== null && raw !== undefined && Number.isFinite(Number(raw))
          ? Number(raw)
          : index;
      return { product, index, sortOrder };
    })
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.product);

const cardMarkup = (product: ShopProduct) => {
  const name = escapeHtml(product.name || "Product");
  const image = escapeHtml(product.image || "/mirror-assets/placeholder.svg");
  const price = escapeHtml(product.price || "");
  const url = escapeHtml(product.url || "/shop");
  const id = escapeHtml(
    product.id ?? String(product.url || "").match(/\/product\/(\d+)/)?.[1] ?? "",
  );
  return `<a class="group block bg-[#f0efed] font-nav" data-jp-product-id="${id}" href="${url}">
      <div class="relative aspect-square overflow-hidden">
        <img src="${image}" sizes="(min-width: 640px) 33vw, 50vw" alt="${name}" loading="lazy" decoding="async" class="h-full w-full object-contain p-2 mix-blend-multiply sm:p-5">
        <button aria-label="Add ${name} to bag" class="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center bg-white text-black transition-all duration-400 ease-luxe hover:bg-black hover:text-white lg:translate-y-full lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></button>
      </div>
      <div class="px-4 pb-7 pt-2">
        <p class="text-center uppercase leading-relaxed tracking-[0.12em] text-black text-[13px]">${name}</p>
        <p class="mt-2.5 text-center text-[13px]"><span class="text-neutral-500">${price}</span></p>
      </div>
    </a>`;
};

const paginationMarkup = (
  page: number,
  totalPages: number,
  params: URLSearchParams,
) => {
  const hrefFor = (target: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(target));
    return `/shop?${escapeHtml(next.toString())}`;
  };
  const chevronLeft =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="m15 18-6-6 6-6"></path></svg>';
  const chevronRight =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="m9 18 6-6-6-6"></path></svg>';
  const baseClass =
    "flex h-9 w-9 items-center justify-center text-neutral-500 transition-colors duration-300 hover:text-black no-underline";
  const disabledClass = `${baseClass} pointer-events-none opacity-30`;
  const prev =
    page > 1
      ? `<a class="${baseClass}" aria-label="Previous page" href="${hrefFor(page - 1)}">${chevronLeft}</a>`
      : `<button disabled aria-label="Previous page" class="${disabledClass}">${chevronLeft}</button>`;

  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const ordered = Array.from(pages)
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((a, b) => a - b);
  let last = 0;
  const numbers = ordered
    .map((number) => {
      const gap = number - last > 1 && last > 0;
      last = number;
      const ellipsis = gap
        ? '<span class="px-1 text-[13px] text-neutral-400">…</span>'
        : "";
      const className =
        number === page
          ? "h-9 min-w-9 px-2 text-[13px] border-b border-black text-black no-underline"
          : "h-9 min-w-9 px-2 text-[13px] transition-colors duration-300 text-neutral-500 hover:text-black no-underline";
      const current = number === page ? ' aria-current="page"' : "";
      return `${ellipsis}<a class="${className}"${current} href="${hrefFor(number)}">${number}</a>`;
    })
    .join("");

  const next =
    page < totalPages
      ? `<a class="${baseClass}" aria-label="Next page" href="${hrefFor(page + 1)}">${chevronRight}</a>`
      : `<button disabled aria-label="Next page" class="${disabledClass}">${chevronRight}</button>`;

  return `${prev}${numbers}${next}`;
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const shell = await readFile(
    path.join(process.cwd(), "public", "mirror", shellFor(params)),
    "utf8",
  );

  let html = shell;
  let catalogProducts: ShopProduct[] = [];
  try {
    const data = await getCatalog();
    catalogProducts = (data.products ?? []) as ShopProduct[];
  } catch (error) {
    console.error("[shop] could not load catalog", error);
  }

  try {
    const products = sortProducts(filterProducts(catalogProducts, params));
    const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
    const requested = Number.parseInt(params.get("page") || "1", 10);
    const page = Math.min(
      Math.max(Number.isFinite(requested) ? requested : 1, 1),
      totalPages,
    );
    const visible = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    html = html.replace(
      /(<p class="flex flex-1 items-center justify-center py-4[^"]*"[^>]*>)[\s\S]*?(<\/p>)/,
      `$1${products.length} products$2`,
    );

    const mainStart = html.indexOf("<main");
    const gridStart = html.indexOf('<div class="grid', mainStart);
    const gridOpenEnd = html.indexOf(">", gridStart) + 1;
    const navStart = html.indexOf('<nav class="mt-16', gridOpenEnd);
    const gridClose = html.lastIndexOf("</div>", navStart);
    if (gridStart >= 0 && gridOpenEnd > 0 && navStart > gridOpenEnd && gridClose > gridOpenEnd) {
      const openTag = html.slice(gridStart, gridOpenEnd);
      const markedOpen = `${openTag.slice(0, -1)} data-jp-shop-ssr="true" data-jp-page="${page}">`;
      const cards =
        visible.length > 0
          ? visible.map(cardMarkup).join("")
          : '<p class="col-span-full py-16 text-center font-nav text-[13px] uppercase tracking-[0.12em] text-neutral-500">No products found</p>';
      html = `${html.slice(0, gridStart)}${markedOpen}${cards}${html.slice(gridClose)}`;
    }

    const renderedNavStart = html.indexOf('<nav class="mt-16', html.indexOf("<main"));
    const navOpenEnd = html.indexOf(">", renderedNavStart) + 1;
    const navClose = html.indexOf("</nav>", navOpenEnd);
    if (renderedNavStart >= 0 && navOpenEnd > 0 && navClose > navOpenEnd) {
      html = `${html.slice(0, navOpenEnd)}${paginationMarkup(page, totalPages, params)}${html.slice(navClose)}`;
    }
  } catch (error) {
    console.error("[shop] could not render catalog", error);
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
