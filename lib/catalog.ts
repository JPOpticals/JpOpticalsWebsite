import fs from "node:fs";
import path from "node:path";
import { isSupabaseConfigured } from "./env";
import { getAdminClient } from "./supabase/admin";

type CatalogImageRow = {
  product_id: number;
  url: string;
  thumbnail_url: string | null;
  alt: string | null;
  is_primary: boolean;
  sort_order: number;
};

type CatalogProductRow = {
  id: number;
  name: string;
  brand: string;
  collection_id: number | null;
  category_id: string | null;
  subcategory_id: string | null;
  model: string | null;
  frame_type: string;
  gender: string | null;
  shape: string | null;
  material: string | null;
  color: string | null;
  color_code: string | null;
  size: string | null;
  price: number | null;
  currency: string;
  short_description: string | null;
  description: string | null;
  path: string;
  is_transitions: boolean;
  sort_order: number;
};

type CatalogCollectionRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  hero_image_url: string | null;
};

type CatalogCategoryRow = {
  id: string;
  name: string;
  slug: string;
  href: string;
  description: string | null;
};

type CatalogSubcategoryRow = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  href: string;
  description: string | null;
};

let cache: { data: CatalogResponse; expiresAt: number } | null = null;

export type CatalogResponse = {
  generatedAt: string;
  source: "supabase" | "static" | "empty";
  categories: unknown[];
  products: unknown[];
  collections: unknown[];
};

export function invalidateCatalogCache() {
  cache = null;
}

const formatMoney = (value: number | null, currency = "USD") => {
  if (value === null || value === undefined) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
};

function staticCatalog(): CatalogResponse {
  try {
    const file = path.join(process.cwd(), "public", "search-index.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as Omit<
      CatalogResponse,
      "source"
    >;
    return { ...data, source: "static" };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: "empty",
      categories: [],
      products: [],
      collections: [],
    };
  }
}

async function supabaseCatalog(): Promise<CatalogResponse> {
  const admin = getAdminClient();
  const [categoriesResult, subcategoriesResult, collectionsResult, productsResult, imagesResult] =
    await Promise.all([
      admin
        .from("categories")
        .select("id,name,slug,href,description")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("subcategories")
        .select("id,category_id,name,slug,href,description")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("collections")
        .select("id,name,slug,description,hero_image_url")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      admin
        .from("products")
        .select(
          "id,name,brand,collection_id,category_id,subcategory_id,model,frame_type,gender,shape,material,color,color_code,size,price,currency,short_description,description,path,is_transitions,sort_order",
        )
        .eq("status", "active")
        .order("sort_order", { ascending: true }),
      admin
        .from("product_images")
        .select("product_id,url,thumbnail_url,alt,is_primary,sort_order")
        .order("sort_order", { ascending: true }),
    ]);

  const error =
    categoriesResult.error ||
    subcategoriesResult.error ||
    collectionsResult.error ||
    productsResult.error ||
    imagesResult.error;
  if (error) throw error;

  const imagesByProduct = new Map<number, CatalogImageRow[]>();
  for (const image of (imagesResult.data ?? []) as CatalogImageRow[]) {
    const list = imagesByProduct.get(image.product_id) ?? [];
    list.push(image);
    imagesByProduct.set(image.product_id, list);
  }

  const subcategoriesByCategory = new Map<string, CatalogSubcategoryRow[]>();
  for (const subcategory of (subcategoriesResult.data ?? []) as CatalogSubcategoryRow[]) {
    const list = subcategoriesByCategory.get(subcategory.category_id) ?? [];
    list.push(subcategory);
    subcategoriesByCategory.set(subcategory.category_id, list);
  }

  const categories = ((categoriesResult.data ?? []) as CatalogCategoryRow[]).map(
    (category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      href: category.href,
      description: category.description,
      subcategories: (subcategoriesByCategory.get(category.id) ?? []).map(
        (subcategory) => ({
          id: subcategory.id.startsWith(`${category.id}:`)
            ? subcategory.id.slice(category.id.length + 1)
            : subcategory.id,
          name: subcategory.name,
          slug: subcategory.slug,
          href: subcategory.href,
          description: subcategory.description,
        }),
      ),
    }),
  );

  const collections = ((collectionsResult.data ?? []) as CatalogCollectionRow[]).map(
    (collection) => ({
      id: collection.id,
      name: collection.name,
      brand: "Collection",
      type: "Brand",
      price: "",
      image: collection.hero_image_url || "/mirror-assets/placeholder.svg",
      url: `/collection/${collection.id}`,
      description: collection.description,
      search: `${collection.name} ${collection.description ?? ""} collection brand`.toLowerCase(),
    }),
  );

  const products = ((productsResult.data ?? []) as CatalogProductRow[]).map((product) => {
    const images = imagesByProduct.get(product.id) ?? [];
    const primary = images.find((image) => image.is_primary) ?? images[0];
    const type = /^optical$/i.test(product.frame_type)
      ? "Optical"
      : /sunglasses/i.test(product.frame_type)
        ? "Sunglasses"
        : product.frame_type || "Eyewear";

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      type,
      gender: product.gender,
      shape: product.shape,
      material: product.material,
      color: product.color,
      colorCode: product.color_code,
      size: product.size,
      model: product.model,
      collectionId: product.collection_id,
      price: formatMoney(product.price, product.currency),
      priceValue: Number(product.price ?? 0),
      image: primary?.url || "/mirror-assets/placeholder.svg",
      images: images.map((image) => ({
        url: image.url,
        thumbnail: image.thumbnail_url,
        alt: image.alt,
        isPrimary: image.is_primary,
      })),
      url: product.path,
      categoryIds: product.category_id ? [product.category_id] : [],
      subcategoryIds: product.is_transitions ? ["transitions"] : [],
      shortDescription: product.short_description,
      description: product.description,
      search: [
        product.name,
        product.brand,
        product.model,
        product.short_description,
        product.description,
        product.frame_type,
        product.gender,
        product.shape,
        product.material,
        "transitions photochromic",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "supabase",
    categories,
    products,
    collections,
  };
}

export async function getCatalog(): Promise<CatalogResponse> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  let data: CatalogResponse;
  if (isSupabaseConfigured) {
    try {
      data = await supabaseCatalog();
    } catch (error) {
      console.error("[catalog] falling back to static index", error);
      data = staticCatalog();
    }
  } else {
    data = staticCatalog();
  }

  cache = { data, expiresAt: Date.now() + 60_000 };
  return data;
}
