import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const MIRROR = path.join(ROOT, "public", "mirror");
const SEED_DIR = path.join(ROOT, "supabase", "seed");
const CONTENT = JSON.parse(
  fs.readFileSync(path.join(SEED_DIR, "content.json"), "utf8"),
);

const decode = (value = "") =>
  String(value)
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, code) =>
      String.fromCodePoint(parseInt(code, hex ? 16 : 10)),
    )
    .replace(/&(amp|quot|apos|lt|gt|nbsp|rsquo|lsquo|ldquo|rdquo|ndash|mdash);/gi, (_, name) => {
      const entities = {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
        nbsp: " ",
        rsquo: "\u2019",
        lsquo: "\u2018",
        ldquo: "\u201c",
        rdquo: "\u201d",
        ndash: "\u2013",
        mdash: "\u2014",
      };
      return entities[name.toLowerCase()] ?? _;
    });

const text = (value = "") =>
  decode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const blockText = (value = "") =>
  decode(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

const attr = (tag, name) =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? "";

const slugify = (value) =>
  decode(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uuidFrom = (key) => {
  const hash = crypto.createHash("md5").update(key).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

const q = (value) =>
  value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`;
const num = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const json = (value) => `${q(JSON.stringify(value ?? {}))}::jsonb`;
const bool = (value) => (value ? "true" : "false");

const readLabel = (block, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = block.match(new RegExp(`\\n${escaped}\\n([^\\n]+)`));
  if (line) return line[1].trim();
  const inline = block.match(new RegExp(`${escaped}:?\\s*\\n?([^\\n]+)`));
  return inline ? inline[1].trim() : "";
};

function productFromHtml(file) {
  const id = Number(file.match(/product-(\d+)\.html/)?.[1]);
  const html = fs.readFileSync(path.join(MIRROR, file), "utf8");
  const block = blockText(html);
  const ogTitle = text(html.match(/property="og:title" content="([^"]*)"/)?.[1] ?? "");
  const ogDescription = text(
    html.match(/property="og:description" content="([^"]*)"/)?.[1] ?? "",
  );
  const ogImage = html.match(/property="og:image" content="([^"]*)"/)?.[1] ?? "";
  const name = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") || ogTitle.replace(/\s*\|\s*JP\s*$/i, "");

  const detailsStart = block.indexOf("Product details");
  const detailsBlock = detailsStart >= 0 ? block.slice(detailsStart + "Product details".length) : block;
  const brandEnd = detailsBlock.search(/\nBrand\n/);
  const description = (
    brandEnd > 0 ? detailsBlock.slice(0, brandEnd) : ogDescription
  ).replace(/\s+/g, " ").trim();

  const brand =
    readLabel(detailsBlock, "Brand") ||
    text(html.match(/href="\/collection\/\d+"[^>]*>([^<]{1,80})</)?.[1] ?? "") ||
    name.split(" ")[0];

  const collectionId = Number(html.match(/href="\/collection\/(\d+)"/)?.[1]) || null;
  const priceText =
    text(html.match(/<span[^>]*class="[^"]*text-\[19px\][^"]*"[^>]*>([^<]+)<\/span>/)?.[1] ?? "") ||
    "";
  const color = (block.match(/Color:\s*\n?\s*([^\n]+)/i)?.[1] ?? "").trim();
  const frameType = readLabel(detailsBlock, "Frame type") || "Eyewear";

  const images = [];
  const seen = new Set();
  const addImage = (url, kind) => {
    if (!url || seen.has(url) || !url.startsWith("/")) return;
    seen.add(url);
    images.push({ url, kind });
  };
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const tagText = tag[0];
    const className = attr(tagText, "class");
    if (!/\bp-10\b|\bp-6\b/.test(className)) continue;
    addImage(attr(tagText, "src"), "gallery");
  }
  if (ogImage) addImage(ogImage, "og");
  if (!images.length) addImage("/mirror-assets/placeholder.svg", "fallback");
  const primary =
    images.find((image) => image.url === ogImage)?.url || images[0]?.url || null;

  const details = {
    brand: brand || null,
    model: readLabel(detailsBlock, "Model") || null,
    colorCode: readLabel(detailsBlock, "Color code") || null,
    shape: readLabel(detailsBlock, "Shape") || null,
    frameType: frameType || null,
    gender: readLabel(detailsBlock, "Gender") || null,
    material: readLabel(detailsBlock, "Material") || null,
    size: readLabel(detailsBlock, "Size") || null,
    color: color || null,
  };

  const categoryId = /^optical$/i.test(frameType)
    ? "optical"
    : /sunglasses/i.test(frameType)
      ? "sunglasses"
      : null;

  return {
    id,
    slug: slugify(`${name}-${id}`),
    name,
    brand,
    collectionId,
    categoryId,
    subcategoryId: categoryId ? `${categoryId}:transitions` : null,
    model: details.model,
    frameType,
    gender: details.gender,
    shape: details.shape,
    material: details.material,
    color: details.color,
    colorCode: details.colorCode,
    size: details.size,
    price: num(priceText),
    currency: "USD",
    shortDescription: ogDescription || null,
    description: description || ogDescription || null,
    details,
    path: `/product/${id}`,
    status: "active",
    isFeatured: false,
    isTransitions: true,
    images,
    primaryImage: primary,
    ogImage,
    ogTitle,
  };
}

function collectionFromHtml(file) {
  const id = Number(file.match(/collection-(\d+)\.html/)?.[1]);
  const html = fs.readFileSync(path.join(MIRROR, file), "utf8");
  const name =
    text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") ||
    text(html.match(/property="og:title" content="([^"]*)"/)?.[1] ?? "").replace(
      /\s*\|\s*JP\s*$/i,
      "",
    );
  return {
    id,
    name: name || `Collection ${id}`,
    slug: slugify(name || `collection-${id}`),
    description:
      text(html.match(/property="og:description" content="([^"]*)"/)?.[1] ?? "") || null,
    heroImage: html.match(/property="og:image" content="([^"]*)"/)?.[1] ?? null,
  };
}

function faqFromHtml() {
  const html = fs.readFileSync(path.join(MIRROR, "help-faq.html"), "utf8");
  const faqs = [];
  const pattern =
    /<button[^>]*class="[^"]*flex justify-between items-center[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/button><div[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
  let index = 0;
  for (const match of html.matchAll(pattern)) {
    const question = text(match[1]);
    const answer = text(match[2]);
    if (!question || !answer || /^subscribe$/i.test(question)) continue;
    let category = "general";
    if (/deliver|shipping|delivery|outside/i.test(question)) category = "shipping";
    else if (/prescription|order|custom lenses|lens/i.test(question)) category = "lenses";
    else if (/return|exchange|refund/i.test(question)) category = "returns";
    else if (/care|clean|store/i.test(question)) category = "care";
    else if (/authentic|brand-name/i.test(question)) category = "authenticity";
    faqs.push({
      id: uuidFrom(`faq:${slugify(question)}`),
      category,
      question,
      answer,
      sortOrder: index++,
    });
  }
  return faqs;
}

function reviewsFromHomepage() {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const reviews = [];
  for (const match of html.matchAll(/<article data-card="true"[\s\S]*?<\/article>/gi)) {
    const card = match[0];
    const rating = Number(card.match(/aria-label="(\d) out of 5 stars"/)?.[1] ?? 5);
    const paragraphs = [...card.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((item) =>
      text(item[1]),
    );
    const body = paragraphs[0];
    const author = paragraphs[1];
    if (!body || !author) continue;
    reviews.push({
      id: uuidFrom(`review:${author}:${body.slice(0, 60)}`),
      authorName: author,
      rating,
      body,
      relativeDate: paragraphs[2] ?? null,
      source: "google",
    });
  }
  return reviews;
}

function variantsFromSite(products) {
  const productIds = new Set(products.map((product) => product.id));
  const hashes = [
    fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFileSync(path.join(ROOT, "public", "jp-ui.js"), "utf8"),
    ...fs
      .readdirSync(MIRROR)
      .filter((name) => name.endsWith(".html"))
      .map((name) => fs.readFileSync(path.join(MIRROR, name), "utf8")),
  ].join("\n");

  const variants = new Map();
  for (const match of hashes.matchAll(/\/product\/(\d+)[^"'\s<>]*?[?&]variant_id=(\d+)/g)) {
    const productId = Number(match[1]);
    const variantId = Number(match[2]);
    if (!productIds.has(productId) || variants.has(variantId)) continue;
    variants.set(variantId, {
      id: variantId,
      productId,
      color: null,
      colorCode: null,
      size: null,
      stock: 0,
    });
  }
  return [...variants.values()];
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "mirror-manifest.json"), "utf8"));
const searchIndex = JSON.parse(
  fs.readFileSync(path.join(ROOT, "public", "search-index.json"), "utf8"),
);

const categories = (searchIndex.categories || []).map((category, index) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  href: category.href,
  description: category.description ?? null,
  sortOrder: index,
}));

const subcategories = (searchIndex.categories || []).flatMap((category) =>
  (category.subcategories || []).map((subcategory, index) => ({
    id: `${category.id}:${subcategory.id}`,
    categoryId: category.id,
    name: subcategory.name,
    slug: subcategory.slug,
    href: subcategory.href,
    description: subcategory.description ?? null,
    sortOrder: index,
  })),
);

const productFiles = fs
  .readdirSync(MIRROR)
  .filter((file) => /^product-\d+\.html$/.test(file))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const products = productFiles.map(productFromHtml).filter((product) => product.id);
const searchOrder = new Map(
  (searchIndex.products || []).map((product, index) => [product.url, index]),
);
for (const product of products) {
  product.sortOrder = searchOrder.get(product.path) ?? product.id;
}

const collectionFiles = fs
  .readdirSync(MIRROR)
  .filter((file) => /^collection-\d+\.html$/.test(file))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const collectionSlugs = new Set();
const collections = collectionFiles.map(collectionFromHtml).map((collection) => {
  let slug = collection.slug || `collection-${collection.id}`;
  if (collectionSlugs.has(slug)) slug = `${slug}-${collection.id}`;
  collectionSlugs.add(slug);
  return { ...collection, slug };
});

const faqs = faqFromHtml();
const reviews = reviewsFromHomepage();
const variants = variantsFromSite(products);

const statements = [];
const push = (statement) => statements.push(statement);
const insertRows = (table, columns, rows, conflictTarget) => {
  if (!rows.length) return;
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    push(
      `insert into public.${table} (${columns.join(", ")}) values\n` +
        chunk.map((row) => `  (${row.join(", ")})`).join(",\n") +
        `\non conflict (${conflictTarget}) do nothing;`,
    );
  }
};

push("-- Generated by scripts/generate-supabase-seed.mjs. Do not edit by hand.");
push("-- Re-generate with: npm run supabase:seed");
push("begin;");
push("set search_path = public;");

insertRows(
  "categories",
  ["id", "name", "slug", "href", "description", "sort_order"],
  categories.map((category) => [
    q(category.id),
    q(category.name),
    q(category.slug),
    q(category.href),
    q(category.description),
    num(category.sortOrder) ?? 0,
  ]),
  "id",
);

insertRows(
  "subcategories",
  ["id", "category_id", "name", "slug", "href", "description", "sort_order"],
  subcategories.map((subcategory) => [
    q(subcategory.id),
    q(subcategory.categoryId),
    q(subcategory.name),
    q(subcategory.slug),
    q(subcategory.href),
    q(subcategory.description),
    num(subcategory.sortOrder) ?? 0,
  ]),
  "id",
);

insertRows(
  "collections",
  ["id", "name", "slug", "description", "hero_image_url"],
  collections.map((collection) => [
    collection.id,
    q(collection.name),
    q(collection.slug),
    q(collection.description),
    q(collection.heroImage),
  ]),
  "id",
);

insertRows(
  "products",
  [
    "id",
    "slug",
    "name",
    "brand",
    "collection_id",
    "category_id",
    "subcategory_id",
    "model",
    "frame_type",
    "gender",
    "shape",
    "material",
    "color",
    "color_code",
    "size",
    "price",
    "currency",
    "short_description",
    "description",
    "details",
    "path",
    "status",
    "is_featured",
    "is_transitions",
    "sort_order",
  ],
  products.map((product) => [
    product.id,
    q(product.slug),
    q(product.name),
    q(product.brand),
    product.collectionId ?? "null",
    q(product.categoryId),
    q(product.subcategoryId),
    q(product.model),
    q(product.frameType),
    q(product.gender),
    q(product.shape),
    q(product.material),
    q(product.color),
    q(product.colorCode),
    q(product.size),
    product.price ?? "0",
    q(product.currency),
    q(product.shortDescription),
    q(product.description),
    json(product.details),
    q(product.path),
    q(product.status),
    bool(product.isFeatured),
    bool(product.isTransitions),
    product.sortOrder ?? product.id,
  ]),
  "id",
);
push(
  `update public.products as p set sort_order = v.sort_order from (values ${products
    .map((product) => `(${product.id}, ${product.sortOrder ?? product.id})`)
    .join(", ")}) as v(id, sort_order) where p.id = v.id and p.sort_order is distinct from v.sort_order;`,
);

const imageRows = [];
const primaryUpdates = [];
for (const product of products) {
  product.images.forEach((image, index) => {
    imageRows.push([
      q(uuidFrom(`image:${product.id}:${image.url}`)),
      product.id,
      q(image.url),
      q(product.name),
      q("legacy"),
      "false",
      index,
      json({ source: "mirror", kind: image.kind }),
    ]);
  });
  if (product.primaryImage) {
    primaryUpdates.push(
      `update public.product_images set is_primary = true where product_id = ${product.id} and url = ${q(product.primaryImage)} and not exists (select 1 from public.product_images where product_id = ${product.id} and is_primary = true);`,
    );
  }
}
insertRows(
  "product_images",
  ["id", "product_id", "url", "alt", "provider", "is_primary", "sort_order", "metadata"],
  imageRows,
  "product_id, url",
);
statements.push(...primaryUpdates);

insertRows(
  "product_variants",
  ["id", "product_id", "stock", "is_active"],
  variants.map((variant) => [variant.id, variant.productId, variant.stock, "true"]),
  "id",
);

insertRows(
  "hero_slides",
  [
    "id",
    "name",
    "subtitle",
    "cta_label",
    "cta_href",
    "desktop_image_url",
    "mobile_image_url",
    "video_url",
    "duration_ms",
    "sort_order",
    "is_active",
  ],
  (CONTENT.heroSlides || []).map((slide, index) => [
    q(uuidFrom(`hero:${index}:${slide.name}`)),
    q(slide.name),
    q(slide.subtitle),
    q(slide.ctaLabel),
    q(slide.ctaHref),
    q(slide.desktopImageUrl),
    q(slide.mobileImageUrl),
    q(slide.videoUrl),
    num(slide.durationMs) ?? 8000,
    index,
    "true",
  ]),
  "id",
);

insertRows(
  "editorial_looks",
  [
    "id",
    "kind",
    "brand",
    "name",
    "price",
    "image_url",
    "product_image_url",
    "video_url",
    "cover_url",
    "href",
    "instagram_url",
    "alt",
    "aspect_ratio",
    "sort_order",
    "is_active",
  ],
  [
    ...(CONTENT.looks || []).map((look, index) => [
      q(uuidFrom(`look:${index}:${look.name}`)),
      q("look"),
      q(look.brand),
      q(look.name),
      look.price ?? "null",
      q(look.imageUrl),
      q(look.productImageUrl),
      q(null),
      q(null),
      q(look.href),
      q(null),
      q(look.alt),
      q(look.aspectRatio),
      index,
      "true",
    ]),
    ...(CONTENT.reels || []).map((reel, index) => [
      q(uuidFrom(`reel:${index}:${reel.name}`)),
      q("reel"),
      q(reel.brand),
      q(reel.name),
      reel.price ?? "null",
      q(null),
      q(reel.productImageUrl),
      q(reel.videoUrl),
      q(reel.coverUrl),
      q(reel.href),
      q(reel.instagramUrl),
      q(reel.alt),
      q(null),
      index,
      "true",
    ]),
  ],
  "id",
);

insertRows(
  "announcements",
  ["id", "message", "link_label", "link_href", "placement", "sort_order", "is_active"],
  (CONTENT.announcements || []).map((announcement, index) => [
    q(uuidFrom(`announcement:${index}:${announcement.message}`)),
    q(announcement.message),
    q(announcement.linkLabel),
    q(announcement.linkHref),
    q(announcement.placement || "homepage"),
    index,
    "true",
  ]),
  "id",
);

const delivery = CONTENT.deliverySettings || {};
push(
  `insert into public.delivery_settings (
    id, standard_label, standard_days_min, standard_days_max, standard_price,
    express_label, express_days_min, express_days_max, express_price,
    free_shipping_threshold, ships_to, tax_note, returns_note
  ) values (
    1, ${q(delivery.standardLabel)}, ${num(delivery.standardDaysMin) ?? 3}, ${num(delivery.standardDaysMax) ?? 5}, ${num(delivery.standardPrice) ?? 0},
    ${q(delivery.expressLabel)}, ${num(delivery.expressDaysMin) ?? 1}, ${num(delivery.expressDaysMax) ?? 1}, ${num(delivery.expressPrice) ?? 0},
    ${delivery.freeShippingThreshold ?? "null"}, ${q(`{${(delivery.shipsTo || ["US"]).join(",")}}`)}::text[], ${q(delivery.taxNote)}, ${q(delivery.returnsNote)}
  ) on conflict (id) do nothing;`,
);

insertRows(
  "faqs",
  ["id", "category", "question", "answer", "sort_order", "is_active"],
  faqs.map((faq) => [
    q(faq.id),
    q(faq.category),
    q(faq.question),
    q(faq.answer),
    faq.sortOrder,
    "true",
  ]),
  "id",
);

insertRows(
  "reviews",
  [
    "id",
    "author_name",
    "rating",
    "body",
    "source",
    "status",
    "is_verified",
    "reviewed_at",
    "metadata",
  ],
  reviews.map((review) => [
    q(review.id),
    q(review.authorName),
    review.rating,
    q(review.body),
    q(review.source),
    q("approved"),
    "false",
    "now()",
    json({ relativeDate: review.relativeDate, importedFrom: "homepage" }),
  ]),
  "id",
);

push("commit;");
push("");
push(
  `-- Summary: ${products.length} products, ${collections.length} collections, ${imageRows.length} images, ${variants.length} variants, ${faqs.length} FAQs, ${reviews.length} reviews.`,
);

fs.mkdirSync(SEED_DIR, { recursive: true });
fs.writeFileSync(path.join(SEED_DIR, "seed.sql"), statements.join("\n"), "utf8");
fs.writeFileSync(
  path.join(SEED_DIR, "catalog.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      categories,
      subcategories,
      collections,
      products,
      variants,
      faqs,
      reviews,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(
  `Seeded data: ${products.length} products, ${collections.length} collections, ${imageRows.length} images, ${variants.length} variants, ${faqs.length} FAQs, ${reviews.length} reviews.`,
);
console.log(`Wrote ${path.join("supabase", "seed", "seed.sql")}`);
