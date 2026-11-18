import fs from "node:fs";
import path from "node:path";
import { isSupabaseConfigured } from "./env";
import { getAdminClient } from "./supabase/admin";

type CatalogImageRow = {
  product_id: number;
  variant_id: number | null;
  url: string;
  thumbnail_url: string | null;
  alt: string | null;
  is_primary: boolean;
  sort_order: number;
};

type CatalogVariantRow = {
  id: number;
  product_id: number;
  sku: string | null;
  shape: string | null;
  design: string | null;
  color: string | null;
  color_code: string | null;
  size: string | null;
  stock: number | null;
  price_override: number | null;
  image_url: string | null;
  image_alt: string | null;
  is_active: boolean;
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

export type CatalogResponse = {
  generatedAt: string;
  source: "supabase" | "static" | "empty";
  categories: unknown[];
  products: unknown[];
  collections: unknown[];
};

export function invalidateCatalogCache() {
  // The live catalog intentionally reads current Supabase state on each request.
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

const splitShape = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { shape: "", design: "" };
  const match = raw.match(/^(.*?)\s+(Full Frame|Half Rimless|Rimless)$/i);
  if (match) return { shape: match[1].trim(), design: match[2] };
  if (/^rimless$/i.test(raw)) return { shape: "Rimless", design: "Rimless" };
  return { shape: raw, design: "Full Frame" };
};

const ensureProductVariants = (product: Record<string, any>) => {
  const variants = Array.isArray(product.variants)
    ? product.variants.filter((variant: any) => variant && variant.isActive !== false)
    : [];
  if (variants.length) return { ...product, variants };

  const split = splitShape(product.shape);
  const priceValue = Number(product.priceValue ?? product.price ?? 0);
  return {
    ...product,
    variants: [
      {
        id: null,
        sku: product.model || String(product.id ?? ""),
        shape: split.shape || product.shape || null,
        design: split.design || null,
        color: product.color || null,
        colorCode: product.colorCode || null,
        size: product.size || null,
        stock: null,
        priceValue,
        price: product.price || formatMoney(priceValue, product.currency),
        currency: product.currency || "USD",
        image: product.image || null,
        imageAlt: product.name,
        images: Array.isArray(product.images) ? product.images : [],
        isActive: true,
        synthetic: true,
      },
    ],
  };
};

function staticCatalog(): CatalogResponse {
  try {
    const searchFile = path.join(process.cwd(), "public", "search-index.json");
    const seedFile = path.join(process.cwd(), "supabase", "seed", "catalog.json");
    const search = JSON.parse(fs.readFileSync(searchFile, "utf8")) as Omit<
      CatalogResponse,
      "source"
    >;
    const seed = JSON.parse(fs.readFileSync(seedFile, "utf8")) as Record<string, any>;
    const variantRows = Array.isArray(seed.variants) ? seed.variants : [];
    const variantsByProduct = new Map<number, Record<string, any>[]>();
    for (const variant of variantRows) {
      const productId = Number(variant?.productId);
      if (!Number.isInteger(productId)) continue;
      const rows = variantsByProduct.get(productId) ?? [];
      rows.push(variant);
      variantsByProduct.set(productId, rows);
    }

    const products = Array.isArray(seed.products)
      ? seed.products.map((raw: Record<string, any>) => {
          const productId = Number(raw.id);
          const rawImages = Array.isArray(raw.images) ? raw.images : [];
          const images = rawImages
            .map((image: Record<string, any>, index: number) => ({
              url: image.url,
              thumbnail: image.thumbnail ?? null,
              alt: image.alt ?? raw.name,
              isPrimary: image.url === raw.primaryImage || index === 0,
              variantId: image.variantId ?? null,
            }))
            .filter((image: Record<string, any>) => image.url);
          const primary =
            images.find((image: Record<string, any>) => image.url === raw.primaryImage) ??
            images[0];
          const imagesByVariant = new Map<number, Record<string, any>[]>();
          for (const image of images) {
            const variantId = Number(image.variantId);
            if (!Number.isInteger(variantId) || variantId <= 0) continue;
            const rows = imagesByVariant.get(variantId) ?? [];
            rows.push(image);
            imagesByVariant.set(variantId, rows);
          }
          const frameType = String(raw.frameType ?? "Eyewear");
          const type = /^optical$/i.test(frameType)
            ? "Optical"
            : /sunglasses/i.test(frameType)
              ? "Sunglasses"
              : frameType;
          const variants = (variantsByProduct.get(productId) ?? []).map(
            (variant: Record<string, any>) => {
              const priceValue = Number(variant.priceOverride ?? raw.price ?? 0);
              return {
                id: variant.id,
                sku: variant.sku ?? raw.model ?? String(productId),
                shape: variant.shape ?? splitShape(raw.shape).shape,
                design: variant.design ?? splitShape(raw.shape).design,
                color: variant.color ?? raw.color,
                colorCode: variant.colorCode ?? raw.colorCode,
                size: variant.size ?? raw.size,
                stock: variant.stock ?? null,
                priceValue,
                price: formatMoney(priceValue, raw.currency),
                currency: raw.currency || "USD",
                image: variant.imageUrl || primary?.url || null,
                imageAlt: variant.imageAlt || raw.name,
                images: (imagesByVariant.get(Number(variant.id)) ?? []).map(
                  (image: Record<string, any>) => ({
                    url: image.url,
                    thumbnail: image.thumbnail ?? null,
                    alt: image.alt ?? raw.name,
                    isPrimary: Boolean(image.isPrimary),
                  }),
                ),
                isActive: true,
              };
            },
          );

          return {
            id: productId,
            name: raw.name,
            brand: raw.brand,
            type,
            gender: raw.gender,
            shape: raw.shape,
            material: raw.material,
            color: raw.color,
            colorCode: raw.colorCode,
            size: raw.size,
            model: raw.model,
            collectionId: raw.collectionId,
            sortOrder: raw.sortOrder,
            price: formatMoney(raw.price, raw.currency),
            priceValue: Number(raw.price ?? 0),
            image: primary?.url || "/mirror-assets/placeholder.svg",
            images,
            variants,
            url: raw.path || `/product/${productId}`,
            categoryIds: raw.categoryId ? [raw.categoryId] : [],
            subcategoryIds: raw.isTransitions ? ["transitions"] : [],
            shortDescription: raw.shortDescription ?? null,
            description: raw.description ?? null,
            search: [
              raw.name,
              raw.brand,
              raw.model,
              raw.shortDescription,
              raw.description,
              frameType,
              raw.gender,
              raw.shape,
              raw.material,
              "transitions photochromic",
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
          };
        })
      : search.products;

    return {
      ...search,
      products,
      source: "static",
    };
  } catch {
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
}

async function supabaseCatalog(): Promise<CatalogResponse> {
  const admin = getAdminClient();
  const [
    categoriesResult,
    subcategoriesResult,
    collectionsResult,
    productsResult,
    imagesResult,
    variantsResult,
  ] = await Promise.all([
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
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .order("id", { ascending: true }),
      admin
        .from("product_images")
        .select("product_id,variant_id,url,thumbnail_url,alt,is_primary,sort_order")
        .order("sort_order", { ascending: true }),
      admin
        .from("product_variants")
        .select(
          "id,product_id,sku,shape,design,color,color_code,size,stock,price_override,image_url,image_alt,is_active,sort_order",
        )
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
    ]);

  const error =
    categoriesResult.error ||
    subcategoriesResult.error ||
    collectionsResult.error ||
    productsResult.error ||
    imagesResult.error ||
    variantsResult.error;
  if (error) throw error;

  const imagesByProduct = new Map<number, CatalogImageRow[]>();
  const variantImagesById = new Map<number, CatalogImageRow[]>();
  for (const image of (imagesResult.data ?? []) as CatalogImageRow[]) {
    const list = imagesByProduct.get(image.product_id) ?? [];
    list.push(image);
    imagesByProduct.set(image.product_id, list);
    if (image.variant_id) {
      const variantList = variantImagesById.get(image.variant_id) ?? [];
      variantList.push(image);
      variantImagesById.set(image.variant_id, variantList);
    }
  }

  const variantsByProduct = new Map<number, CatalogVariantRow[]>();
  for (const variant of (variantsResult.data ?? []) as CatalogVariantRow[]) {
    const list = variantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
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
    const variants = (variantsByProduct.get(product.id) ?? [])
      .filter((variant) => variant.is_active)
      .map((variant) => {
        const variantImages = variantImagesById.get(variant.id) ?? [];
        const variantPrimary =
          variantImages.find((image) => image.is_primary) ?? variantImages[0];
        const split = splitShape(variant.shape);
        const priceValue = Number(variant.price_override ?? product.price ?? 0);
        return {
          id: variant.id,
          sku: variant.sku,
          shape: split.shape || variant.shape,
          design: variant.design || split.design,
          color: variant.color || product.color,
          colorCode: variant.color_code || product.color_code,
          size: variant.size || product.size,
          stock: variant.stock,
          price: formatMoney(priceValue, product.currency),
          priceValue,
          currency: product.currency,
          image: variant.image_url || variantPrimary?.url || primary?.url || null,
          imageAlt: variant.image_alt || product.name,
          images: variantImages.map((image) => ({
            url: image.url,
            thumbnail: image.thumbnail_url,
            alt: image.alt,
            isPrimary: image.is_primary,
          })),
          isActive: true,
        };
      });

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
      sortOrder: product.sort_order,
      price: formatMoney(product.price, product.currency),
      priceValue: Number(product.price ?? 0),
      image: primary?.url || "/mirror-assets/placeholder.svg",
      images: images.map((image) => ({
        url: image.url,
        thumbnail: image.thumbnail_url,
        alt: image.alt,
        isPrimary: image.is_primary,
        variantId: image.variant_id,
      })),
      variants,
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

  return {
    ...data,
    products: (data.products as Record<string, any>[])
      .filter((product) => product && typeof product === "object")
      .map(ensureProductVariants),
  };
}
