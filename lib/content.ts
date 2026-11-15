import fs from "node:fs";
import path from "node:path";
import { isSupabaseConfigured } from "./env";
import { getAdminClient } from "./supabase/admin";

export type SiteContent = {
  generatedAt: string;
  source: "supabase" | "seed" | "empty";
  heroSlides: unknown[];
  looks: unknown[];
  reels: unknown[];
  announcements: unknown[];
  delivery: unknown;
  faqs: unknown[];
  reviews: unknown[];
  popularSearches: string[];
};

export function invalidateContentCache() {
  // The live content projection intentionally reads current Supabase state on each request.
}

const formatMoney = (value: number | null) => {
  if (value === null || value === undefined) return "";
  return `$${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

function seedContent(): SiteContent {
  try {
    const file = path.join(process.cwd(), "supabase", "seed", "content.json");
    const seed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      generatedAt: new Date().toISOString(),
      source: "seed",
      heroSlides: (seed.heroSlides ?? []).map((slide: Record<string, unknown>) => ({
        name: slide.name,
        subtitle: slide.subtitle,
        cta: slide.ctaLabel,
        href: slide.ctaHref,
        desktop: slide.desktopImageUrl,
        mobile: slide.mobileImageUrl,
        video: slide.videoUrl,
        duration: slide.durationMs,
      })),
      looks: (seed.looks ?? []).map((look: Record<string, unknown>) => ({
        brand: look.brand,
        name: look.name,
        price: formatMoney(look.price as number),
        image: look.imageUrl,
        productImage: look.productImageUrl,
        href: look.href,
        alt: look.alt,
        aspect: look.aspectRatio,
      })),
      reels: (seed.reels ?? []).map((reel: Record<string, unknown>) => ({
        brand: reel.brand,
        name: reel.name,
        price: formatMoney(reel.price as number),
        video: reel.videoUrl,
        cover: reel.coverUrl,
        productImage: reel.productImageUrl,
        href: reel.href,
        instagram: reel.instagramUrl,
        alt: reel.alt,
      })),
      announcements: seed.announcements ?? [],
      delivery: seed.deliverySettings ?? null,
      faqs: [],
      reviews: [],
      popularSearches: ["Sunglasses", "Optical", "Transitions (Photochromic)", "Cartier"],
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: "empty",
      heroSlides: [],
      looks: [],
      reels: [],
      announcements: [],
      delivery: null,
      faqs: [],
      reviews: [],
      popularSearches: [],
    };
  }
}

async function supabaseContent(): Promise<SiteContent> {
  const admin = getAdminClient();
  const [heroResult, editorialResult, announcementsResult, deliveryResult, faqsResult, reviewsResult] =
    await Promise.all([
      admin
        .from("hero_slides")
        .select(
          "id,name,subtitle,cta_label,cta_href,desktop_image_url,mobile_image_url,video_url,duration_ms",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("editorial_looks")
        .select(
          "id,kind,brand,name,price,image_url,product_image_url,video_url,cover_url,href,instagram_url,alt,aspect_ratio",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("announcements")
        .select("id,message,link_label,link_href,placement")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("delivery_settings")
        .select(
          "standard_label,standard_days_min,standard_days_max,standard_price,express_label,express_days_min,express_days_max,express_price,free_shipping_threshold,ships_to,tax_note,returns_note",
        )
        .eq("id", 1)
        .maybeSingle(),
      admin
        .from("faqs")
        .select("id,category,question,answer")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("reviews")
        .select("id,author_name,rating,body,reviewed_at,metadata")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(24),
    ]);

  const error =
    heroResult.error ||
    editorialResult.error ||
    announcementsResult.error ||
    deliveryResult.error ||
    faqsResult.error ||
    reviewsResult.error;
  if (error) throw error;

  const heroSlides = (heroResult.data ?? []).map((slide) => ({
    name: slide.name,
    subtitle: slide.subtitle,
    cta: slide.cta_label,
    href: slide.cta_href,
    desktop: slide.desktop_image_url,
    mobile: slide.mobile_image_url,
    video: slide.video_url,
    duration: slide.duration_ms,
  }));

  const editorial = editorialResult.data ?? [];
  const looks = editorial
    .filter((look) => look.kind === "look")
    .map((look) => ({
      brand: look.brand,
      name: look.name,
      price: formatMoney(look.price),
      image: look.image_url,
      productImage: look.product_image_url,
      href: look.href,
      alt: look.alt,
      aspect: look.aspect_ratio,
    }));
  const reels = editorial
    .filter((look) => look.kind === "reel")
    .map((reel) => ({
      brand: reel.brand,
      name: reel.name,
      price: formatMoney(reel.price),
      video: reel.video_url,
      cover: reel.cover_url,
      productImage: reel.product_image_url,
      href: reel.href,
      instagram: reel.instagram_url,
      alt: reel.alt,
    }));

  const delivery = deliveryResult.data
    ? {
        standardLabel: deliveryResult.data.standard_label,
        standardDaysMin: deliveryResult.data.standard_days_min,
        standardDaysMax: deliveryResult.data.standard_days_max,
        standardPrice: deliveryResult.data.standard_price,
        expressLabel: deliveryResult.data.express_label,
        expressDaysMin: deliveryResult.data.express_days_min,
        expressDaysMax: deliveryResult.data.express_days_max,
        expressPrice: deliveryResult.data.express_price,
        freeShippingThreshold: deliveryResult.data.free_shipping_threshold,
        shipsTo: deliveryResult.data.ships_to,
        taxNote: deliveryResult.data.tax_note,
        returnsNote: deliveryResult.data.returns_note,
      }
    : null;

  const faqs = (faqsResult.data ?? []).map((faq) => ({
    id: faq.id,
    category: faq.category,
    question: faq.question,
    answer: faq.answer,
  }));

  const reviews = (reviewsResult.data ?? []).map((review) => ({
    id: review.id,
    authorName: review.author_name,
    rating: review.rating,
    body: review.body,
    relativeDate:
      (review.metadata as Record<string, unknown> | null)?.relativeDate ?? null,
    source: "google",
  }));

  return {
    generatedAt: new Date().toISOString(),
    source: "supabase",
    heroSlides,
    looks,
    reels,
    announcements: (announcementsResult.data ?? []).map((announcement) => ({
      message: announcement.message,
      linkLabel: announcement.link_label,
      linkHref: announcement.link_href,
      placement: announcement.placement,
    })),
    delivery,
    faqs,
    reviews,
    popularSearches: ["Sunglasses", "Optical", "Transitions (Photochromic)", "Cartier"],
  };
}

export async function getSiteContent(): Promise<SiteContent> {
  let data: SiteContent;
  if (isSupabaseConfigured) {
    try {
      data = await supabaseContent();
    } catch (error) {
      console.error("[content] falling back to seed content", error);
      data = seedContent();
    }
  } else {
    data = seedContent();
  }

  return data;
}
