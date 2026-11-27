import fs from "node:fs";
import path from "node:path";

const files = [
  "public/index.html",
  ...fs
    .readdirSync("public/mirror")
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join("public/mirror", name)),
];

const styleTag = '<link rel="stylesheet" href="/jp-ui.css">';
const scriptTag = '<script defer src="/jp-ui.js"></script>';
const navLinkClass =
  'relative flex items-center whitespace-nowrap text-[12px] uppercase tracking-[0.13em] transition-opacity duration-400 ease-out opacity-100';
const navUnderline =
  '<span class="absolute inset-x-0 bottom-0 h-[2px] origin-center bg-current transition-transform duration-500 ease-luxe scale-x-0"></span>';
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
const seedContent = JSON.parse(fs.readFileSync('supabase/seed/content.json', 'utf8'));

const staticHomepageAnnouncement = () => {
  const items = Array.isArray(seedContent.announcements)
    ? seedContent.announcements.filter(
        (item) => item.placement === 'homepage' && String(item.message || '').trim(),
      )
    : [];
  const rows = items
    .map((item) => {
      const href = String(item.linkHref || '').trim();
      const link = href.startsWith('/') && item.linkLabel
        ? `<a href="${escapeHtml(href)}">${escapeHtml(item.linkLabel)}</a>`
        : '';
      return `<div class="jp-announcement"><span>${escapeHtml(item.message)}</span>${link}</div>`;
    })
    .join('');
  return `<aside data-jp-announcements="homepage" class="jp-announcements jp-announcements--homepage${rows ? '' : ' jp-announcements--pending'}"${rows ? '' : ' aria-hidden="true" aria-busy="true"'}>${rows}</aside>`;
};

const staticHomepageNavigation = () => {
  const category = (label, href) => `<div class="jp-nav-item"><a class="${navLinkClass}" href="${href}" data-jp-category-menu="true" aria-haspopup="true" aria-expanded="false">${label}${navUnderline}</a><div class="jp-nav-menu"><a href="${href}">All ${label.toLowerCase()}</a><a href="${href}&amp;lens=Transitions">Transitions (Photochromic)</a></div></div>`;
  const simple = (label, href, className = navLinkClass, extra = '') => `<a class="${className}" href="${href}"${extra}>${label}${navUnderline}</a>`;
  return `<nav class="hidden items-stretch gap-5 lg:flex xl:gap-8 jp-nav-relocated">${category('Sunglasses', '/shop?type_frame=Sunglasses')}${category('Optical', '/shop?type_frame=Optical')}${simple('Customize', '/customize', navLinkClass, ' data-jp-customizer-nav="true"')}${simple('Help', '/help/faq')}${simple('About', '/about-us', `${navLinkClass} group`)}</nav>`;
};

const normalizeHomepageMarkup = (html) => {
  const navStart = html.indexOf('<nav class="hidden items-stretch');
  const navEnd = html.indexOf('</nav>', navStart);
  if (navStart < 0 || navEnd < navStart) return html;

  html = `${html.slice(0, navStart)}${staticHomepageNavigation()}${html.slice(navEnd + '</nav>'.length)}`;
  html = html.replace(/(<a\b[^>]*href="\/"[^>]*)(>JP<\/a>)/g, (match, opening, closing) => {
    if (!opening.includes('font-display')) return match;
    const size = opening.includes('lg:hidden') ? '24px' : '30px';
    const withoutStyle = opening.replace(/\sstyle="[^"]*"/, '');
    return `${withoutStyle} style="font-size: ${size};"${closing}`;
  });

  const bodyStart = html.indexOf('<body');
  const heroEnd = html.indexOf('</section>', bodyStart);
  if (bodyStart >= 0 && heroEnd > bodyStart && !html.includes('data-jp-announcements="homepage"')) {
    const insertion = staticHomepageAnnouncement();
    html = `${html.slice(0, heroEnd + '</section>'.length)}${insertion}${html.slice(heroEnd + '</section>'.length)}`;
  }
  return html;
};

const aboutHeroSection =
  '<main><section class="relative w-full h-[62vh] min-h-[420px] bg-[#0e0e0e] overflow-hidden flex items-center justify-center">';
const aboutHeroMedia =
  '<picture class="jp-about-hero-media"><source media="(max-width: 767px)" srcset="/mirror-assets/about-hero-cartier-mobile.webp"><img src="/mirror-assets/about-hero-cartier.webp" alt="Model wearing Cartier eyewear in a warm editorial portrait" fetchpriority="high" decoding="async"></picture><div class="jp-about-hero-scrim"></div>';
let changed = 0;

for (const file of files) {
  let html = fs.readFileSync(file, "utf8");
  const original = html;

  if (file === 'public/index.html') html = normalizeHomepageMarkup(html);

  if (
    file.endsWith("about-us.html") &&
    html.includes(aboutHeroSection) &&
    !html.includes("jp-about-hero-media")
  ) {
    html = html.replace(aboutHeroSection, aboutHeroSection + aboutHeroMedia);
  }

  html = html
    .replace(/\s*<link[^>]+href="\/jp-ui\.css"[^>]*>/g, "")
    .replace(/\s*<script[^>]+src="\/jp-ui\.js"[^>]*><\/script>/g, "");

  html = html.replace(
    /\b(src|href|poster)="(media|site-assets)\//g,
    '$1="/$2/',
  );

  const socialLinks = {
    Facebook: "https://www.facebook.com/jp.shop",
    X: "https://x.com/jp",
    Instagram: "https://www.instagram.com/jp_shop/",
    YouTube: "https://www.youtube.com/@jp",
    TikTok: "https://www.tiktok.com/@jp",
  };
  html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attrs, content) => {
    const label = attrs.match(/aria-label="([^"]+)"/i)?.[1];
    if (label && socialLinks[label] && !/\bhref="/i.test(attrs)) {
      return `<a href="${socialLinks[label]}"${attrs}>${content}</a>`;
    }
    if (/Powered by DevInsidercode/i.test(content) && !/\bhref="/i.test(attrs)) {
      return `<a href="https://devinsidercode.com/"${attrs}>${content}</a>`;
    }
    return match;
  });

  const headEnd = html.indexOf("</head>");
  if (headEnd === -1) {
    console.warn(`skipped (no </head>): ${file}`);
    continue;
  }

  html =
    html.slice(0, headEnd) +
    styleTag +
    scriptTag +
    html.slice(headEnd);

  if (html !== original) {
    fs.writeFileSync(file, html, "utf8");
    changed += 1;
  }
}

console.log(`enhanced ${changed} of ${files.length} pages`);
