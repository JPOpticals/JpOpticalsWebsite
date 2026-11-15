import { isSupabaseConfigured } from "./env";
import { getCatalog } from "./catalog";
import { getAdminClient } from "./supabase/admin";

export type CustomizerFrame = {
  id: string;
  productId: number | null;
  productUrl: string | null;
  name: string;
  style: string;
  frameType: string;
  material: string | null;
  color: string | null;
  colorCode: string | null;
  imageUrl: string | null;
  lensMaskUrl: string | null;
  imageAlt: string | null;
  metadata: Record<string, unknown> | null;
  price: number;
  currency: string;
  description: string | null;
};

export type CustomizerLens = {
  id: string;
  name: string;
  lensType: string;
  style: string;
  color: string;
  colorCode: string;
  tintOpacity: number;
  imageUrl: string | null;
  imageAlt: string | null;
  price: number;
  currency: string;
  description: string | null;
};

export type CustomizerResponse = {
  generatedAt: string;
  source: "supabase" | "static" | "empty";
  frames: CustomizerFrame[];
  lenses: CustomizerLens[];
  compatibility: Record<string, string[]>;
};

type CatalogProduct = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  image?: unknown;
  priceValue?: unknown;
  price?: unknown;
  type?: unknown;
  shape?: unknown;
  material?: unknown;
  color?: unknown;
  colorCode?: unknown;
  description?: unknown;
};

type FrameRow = {
  id: string;
  product_id: number | null;
  name: string;
  style: string;
  frame_type: string;
  material: string | null;
  color: string | null;
  color_code: string | null;
  image_url: string | null;
  lens_mask_url: string | null;
  image_alt: string | null;
  metadata: Record<string, unknown> | null;
  price: number | string | null;
  currency: string;
  description: string | null;
};

type LensRow = {
  id: string;
  name: string;
  lens_type: string;
  style: string;
  color: string;
  color_code: string;
  tint_opacity: number | string;
  image_url: string | null;
  image_alt: string | null;
  price: number | string | null;
  currency: string;
  description: string | null;
};

type CompatibilityRow = {
  frame_id: string;
  lens_id: string;
};

const DEFAULT_LENSES: CustomizerLens[] = [
  {
    id: "lens-clear",
    name: "Clear optical",
    lensType: "Clear",
    style: "Classic",
    color: "Clear",
    colorCode: "#e8eef1",
    tintOpacity: 0.18,
    imageUrl: null,
    imageAlt: null,
    price: 0,
    currency: "USD",
    description: "Everyday clear lenses with a subtle natural reflection.",
  },
  {
    id: "lens-blue-light",
    name: "Blue light filter",
    lensType: "Blue-light",
    style: "Performance",
    color: "Ice blue",
    colorCode: "#9ed5e7",
    tintOpacity: 0.28,
    imageUrl: null,
    imageAlt: null,
    price: 65,
    currency: "USD",
    description: "A light blue filter for screen-heavy days.",
  },
  {
    id: "lens-smoke",
    name: "Smoke grey",
    lensType: "Tinted",
    style: "Solid tint",
    color: "Smoke",
    colorCode: "#6e777b",
    tintOpacity: 0.58,
    imageUrl: null,
    imageAlt: null,
    price: 85,
    currency: "USD",
    description: "A soft grey tint with a clean, neutral finish.",
  },
  {
    id: "lens-amber",
    name: "Warm amber",
    lensType: "Tinted",
    style: "Solid tint",
    color: "Amber",
    colorCode: "#c28b55",
    tintOpacity: 0.52,
    imageUrl: null,
    imageAlt: null,
    price: 85,
    currency: "USD",
    description: "A warm amber lens for a richer, vintage look.",
  },
  {
    id: "lens-olive",
    name: "Polarized olive",
    lensType: "Polarized",
    style: "Performance",
    color: "Olive",
    colorCode: "#65715d",
    tintOpacity: 0.64,
    imageUrl: null,
    imageAlt: null,
    price: 120,
    currency: "USD",
    description: "Polarized protection with an olive-green cast.",
  },
  {
    id: "lens-photochromic",
    name: "Photochromic",
    lensType: "Photochromic",
    style: "Adaptive",
    color: "Graphite",
    colorCode: "#53616b",
    tintOpacity: 0.48,
    imageUrl: null,
    imageAlt: null,
    price: 145,
    currency: "USD",
    description: "Adaptive lenses that deepen in sunlight.",
  },
];

export function invalidateCustomizerCache() {
  // The live projections intentionally read current Supabase state on each request.
}

const numberValue = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const productMap = (products: unknown[]) => {
  const map = new Map<number, CatalogProduct>();
  for (const product of products as CatalogProduct[]) {
    const id = Number(product.id);
    if (Number.isInteger(id)) map.set(id, product);
  }
  return map;
};

function staticFrames(products: unknown[]): CustomizerFrame[] {
  return (products as CatalogProduct[])
    .filter((product) => /optical|sunglasses/i.test(String(product.type ?? "")))
    .map((product, index) => {
      const productId = Number(product.id ?? String(product.url ?? "").match(/\/product\/(\d+)/)?.[1]);
      const frameType = /^optical$/i.test(String(product.type)) ? "Optical" : "Sunglasses";
      const parsedPrice = Number(String(product.price ?? "").replace(/[^0-9.-]/g, ""));
      return {
        id: `product-${productId}`,
        productId,
        productUrl: String(product.url ?? `/product/${productId}`),
        name: String(product.name ?? "JP frame"),
        style: String(product.shape ?? "Classic"),
        frameType,
        material: product.material ? String(product.material) : null,
        color: product.color ? String(product.color) : null,
        colorCode: product.colorCode ? String(product.colorCode) : null,
        imageUrl: product.image ? String(product.image) : null,
        lensMaskUrl: null,
        imageAlt: String(product.name ?? "JP frame"),
        metadata: null,
        price: numberValue(product.priceValue, Number.isFinite(parsedPrice) ? parsedPrice : 0),
        currency: "USD",
        description: product.description ? String(product.description) : null,
      };
    })
    .filter((frame) => Number.isInteger(frame.productId) && frame.productId > 0)
    .map((frame, index) => ({ ...frame, sortOrder: index })) as CustomizerFrame[];
}

function staticCustomizer(catalog: { products: unknown[] }): CustomizerResponse {
  return {
    generatedAt: new Date().toISOString(),
    source: catalog.products.length ? "static" : "empty",
    frames: staticFrames(catalog.products),
    lenses: DEFAULT_LENSES,
    compatibility: {},
  };
}

async function supabaseCustomizer(): Promise<CustomizerResponse> {
  const catalog = await getCatalog();
  const admin = getAdminClient();
  const [framesResult, lensesResult, compatibilityResult] = await Promise.all([
    admin
      .from("customizer_frames")
      .select(
        "id,product_id,name,style,frame_type,material,color,color_code,image_url,lens_mask_url,image_alt,metadata,price,currency,description",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("customizer_lenses")
      .select(
        "id,name,lens_type,style,color,color_code,tint_opacity,image_url,image_alt,price,currency,description",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("customizer_frame_lenses")
      .select("frame_id,lens_id")
      .eq("is_active", true),
  ]);

  const error = framesResult.error || lensesResult.error || compatibilityResult.error;
  if (error) throw error;

  const products = productMap(catalog.products);
  const fallback = staticCustomizer(catalog);
  const frames = ((framesResult.data ?? []) as FrameRow[]).map((row) => {
    const product = row.product_id ? products.get(row.product_id) : undefined;
    return {
      id: row.id,
      productId: row.product_id,
      productUrl: product?.url ? String(product.url) : row.product_id ? `/product/${row.product_id}` : null,
      name: row.name,
      style: row.style,
      frameType: row.frame_type,
      material: row.material,
      color: row.color,
      colorCode: row.color_code,
      imageUrl: row.image_url || (product?.image ? String(product.image) : null),
      lensMaskUrl: row.lens_mask_url,
      imageAlt: row.image_alt || row.name,
      metadata: row.metadata,
      price: numberValue(row.price),
      currency: row.currency || "USD",
      description: row.description,
    };
  });
  const lenses = ((lensesResult.data ?? []) as LensRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    lensType: row.lens_type,
    style: row.style,
    color: row.color,
    colorCode: row.color_code,
    tintOpacity: numberValue(row.tint_opacity, 0.2),
    imageUrl: row.image_url,
    imageAlt: row.image_alt || row.name,
    price: numberValue(row.price),
    currency: row.currency || "USD",
    description: row.description,
  }));

  const compatibility: Record<string, string[]> = {};
  for (const row of (compatibilityResult.data ?? []) as CompatibilityRow[]) {
    compatibility[row.frame_id] = [...(compatibility[row.frame_id] ?? []), row.lens_id];
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "supabase",
    frames: frames.length ? frames : fallback.frames,
    lenses: lenses.length ? lenses : DEFAULT_LENSES,
    compatibility,
  };
}

export async function getCustomizer(): Promise<CustomizerResponse> {
  const catalog = await getCatalog();
  let data: CustomizerResponse;
  if (isSupabaseConfigured) {
    try {
      data = await supabaseCustomizer();
    } catch (error) {
      console.error("[customizer] falling back to static options", error);
      data = staticCustomizer(catalog);
    }
  } else {
    data = staticCustomizer(catalog);
  }

  return data;
}
