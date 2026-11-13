import { collections, getCollection } from "../shared/collections";
import { getImageKitMediaUrl } from "../shared/imagekit-media";
import { DEFAULT_SITE_SETTINGS } from "../shared/site-settings";
import { getDb, getSiteSettings, getWallpaperById, listGames, listWallpapers, listWallpapersPage } from "./db";
import { getPublicImageUrl, SITE_ORIGIN } from "./seo";

type SeoRobots = "index, follow" | "noindex, follow";
export type SeoPage = {
  status: number;
  title: string;
  description: string;
  canonical?: string;
  robots: SeoRobots;
  ogType: "website" | "article";
  ogImage: string;
  ogImageAlt: string;
  body: string;
  redirect?: string;
};

const SITE_NAME = "پیکسل والپیپر";
const LOGO_IMAGE = new URL(DEFAULT_SITE_SETTINGS.logoUrl, SITE_ORIGIN).toString();

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function shorten(value: string, max: number) {
  const chars = Array.from(value.trim().replace(/\s+/g, " "));
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : chars.join("");
}

function description(value: string, fallback: string) {
  let text = shorten(value || fallback, 154);
  if (Array.from(text).length < 50) text = shorten(`${text} مشاهده و دانلود در پیکسل والپیپر.`, 154);
  return text;
}

function canonical(path: string) {
  return new URL(path, SITE_ORIGIN).toString();
}

function page(input: Partial<SeoPage> & Pick<SeoPage, "title" | "description" | "body">): SeoPage {
  return {
    status: input.status ?? 200,
    title: shorten(input.title, 60),
    description: description(input.description, "دانلود والپیپرهای گیمینگ باکیفیت برای دسکتاپ، موبایل و اولتراواید در پیکسل والپیپر."),
    canonical: input.canonical,
    robots: input.robots ?? "index, follow",
    ogType: input.ogType ?? "website",
    ogImage: input.ogImage ?? LOGO_IMAGE,
    ogImageAlt: input.ogImageAlt ?? "پیکسل والپیپر؛ والپیپرهای گیمینگ",
    body: input.body,
    redirect: input.redirect,
  };
}

function main(content: string) {
  return `<main class="page-wrap seo-fallback-content">${content}</main>`;
}

function safeWallpaperImage(value: string | null | undefined) {
  return getPublicImageUrl(value);
}

function safeWallpaperMedia(value: string | null | undefined) {
  const image = safeWallpaperImage(value);
  return image ? getImageKitMediaUrl(image, 640, 80) ?? image : undefined;
}

function wallpaperCard(wallpaper: {
  id: number; title: string; category: string; gameTitle: string | null; description: string | null;
  resolution: string; imageUrl: string; thumbnailUrl: string | null;
}, index: number) {
  const href = `/wallpapers/${wallpaper.id}`;
  const image = safeWallpaperMedia(wallpaper.thumbnailUrl) ?? safeWallpaperMedia(wallpaper.imageUrl);
  const summary = wallpaper.description?.trim() || [wallpaper.gameTitle, wallpaper.category, wallpaper.resolution].filter(Boolean).join(" · ");
  return `<article class="wallpaper-card seo-wallpaper-card"><a class="wallpaper-image-link" href="${href}" aria-label="مشاهدهٔ ${escapeHtml(wallpaper.title)}">${image ? `<img class="wallpaper-image" src="${escapeHtml(image)}" alt="${escapeHtml(wallpaper.title)}" loading="${index === 0 ? "eager" : "lazy"}"${index === 0 ? ' fetchpriority="high"' : ""} decoding="async">` : `<span class="seo-no-image">پیش‌نمایش تصویر</span>`}</a><div class="wallpaper-card-info"><div><span class="category-label">${escapeHtml(wallpaper.gameTitle || wallpaper.category)}</span><a class="wallpaper-title" href="${href}">${escapeHtml(wallpaper.title)}</a><p class="seo-card-description">${escapeHtml(shorten(summary, 180))}</p></div></div></article>`;
}

type FeaturedPreview = { url: string; alt: string; markup: string };
let featuredPreviewCache: { expiresAt: number; value: FeaturedPreview } | undefined;
const HOME_PAGE_CACHE_MS = 60_000;
let homePageCache: { expiresAt: number; value: SeoPage } | undefined;
let homePagePending: Promise<SeoPage> | undefined;
async function getFeaturedPreview(): Promise<FeaturedPreview> {
  if (featuredPreviewCache && featuredPreviewCache.expiresAt > Date.now()) return featuredPreviewCache.value;
  let value: FeaturedPreview = {
    url: LOGO_IMAGE,
    alt: "پیکسل والپیپر؛ والپیپرهای گیمینگ",
    markup: `<figure class="seo-featured-image"><img src="/site-logo.webp" alt="پیکسل والپیپر؛ والپیپرهای گیمینگ" loading="lazy" decoding="async"><figcaption>پیکسل والپیپر</figcaption></figure>`,
  };
  try {
    const [wallpaper] = await listWallpapers({ sort: "popular", limit: 1 });
    const image = wallpaper && (safeWallpaperImage(wallpaper.imageUrl) ?? safeWallpaperImage(wallpaper.thumbnailUrl));
    const mediaImage = wallpaper && (safeWallpaperMedia(wallpaper.imageUrl) ?? safeWallpaperMedia(wallpaper.thumbnailUrl));
    if (wallpaper && image && mediaImage) {
      const alt = wallpaper.title || "والپیپر گیمینگ";
      value = {
        url: image,
        alt,
        markup: `<figure class="seo-featured-image"><a href="/wallpapers/${wallpaper.id}"><img src="${escapeHtml(mediaImage)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"></a><figcaption><a href="/wallpapers/${wallpaper.id}">${escapeHtml(alt)}</a></figcaption></figure>`,
      };
    }
  } catch (error) {
    console.error("[SEO] Featured image lookup failed", error instanceof Error ? error.name : "UnknownError");
  }
  featuredPreviewCache = { expiresAt: Date.now() + 60_000, value };
  return value;
}

function slugifyGame(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function isNoIndexQuery(params: URLSearchParams) {
  return [...params.keys()].some(key => key !== "") || params.size > 0;
}

function notFound() {
  return page({
    status: 404,
    title: `صفحه پیدا نشد | ${SITE_NAME}`,
    description: "این صفحه یا والپیپر در دسترس نیست. از صفحهٔ اصلی، بازی‌ها و مجموعه‌های پیکسل والپیپر دیدن کنید.",
    robots: "noindex, follow",
    body: main(`<header class="page-header"><h1>این صفحه پیدا نشد</h1><p>ممکن است نشانی اشتباه باشد یا والپیپر از گنجینه برداشته شده باشد.</p><p><a class="button-primary" href="/">بازگشت به صفحهٔ اصلی</a> <a class="button-secondary" href="/collections">دیدن مجموعه‌ها</a></p></header>`),
  });
}

function gameListMarkup(games: Awaited<ReturnType<typeof listGames>>) {
  const entries = games.filter(item => item.gameTitle);
  if (!entries.length) return "";
  return `<section class="seo-link-section"><h2>صفحهٔ والپیپر بازی‌ها</h2><ul>${entries.map(item => `<li><a href="/games/${encodeURIComponent(slugifyGame(item.gameTitle!))}">${escapeHtml(item.gameTitle!)}؛ ${Number(item.wallpaperCount).toLocaleString("fa-IR")} والپیپر</a></li>`).join("")}</ul></section>`;
}

function collectionListMarkup() {
  return `<section class="seo-link-section"><h2>مجموعه‌های آمادهٔ والپیپر</h2><ul>${collections.map(item => `<li><a href="/collections/${item.slug}">${escapeHtml(item.title)}</a> — ${escapeHtml(item.description)}</li>`).join("")}</ul></section>`;
}

export function isSeoDocumentRequest(method: string, pathname: string) {
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname.startsWith("/api/") || pathname.startsWith("/manus-storage/") || pathname === "/sitemap.xml" || pathname === "/robots.txt") return false;
  if (pathname.startsWith("/@vite/") || pathname.startsWith("/@id/") || pathname.startsWith("/node_modules/")) return false;
  if (/\.[^/]+$/.test(pathname)) return false;
  return true;
}

export async function renderSeoPage(requestUrl: string): Promise<SeoPage> {
  const parsed = new URL(requestUrl, SITE_ORIGIN);
  let pathname: string;
  try { pathname = decodeURIComponent(parsed.pathname); } catch { return notFound(); }
  const noindexQuery = isNoIndexQuery(parsed.searchParams);

  if (pathname === "/admin") return page({
    status: 302, title: `ورود مدیر | ${SITE_NAME}`, description: "ورود امن مدیران پیکسل والپیپر.",
    robots: "noindex, follow", body: "", redirect: "/admin/admin",
  });

  if (pathname === "/favorites" || pathname === "/request/track" || pathname === "/admin/admin") {
    const privatePage = pathname === "/favorites" ? "علاقه‌مندی‌های شما" : pathname === "/request/track" ? "پیگیری درخواست والپیپر" : "پنل مدیریت";
    return page({
      title: `${privatePage} | ${SITE_NAME}`,
      description: `${privatePage} در پیکسل والپیپر.`,
      canonical: canonical(pathname), robots: "noindex, follow",
      body: main(`<header class="page-header"><h1>${escapeHtml(privatePage)}</h1><p>برای مشاهده و استفاده از این بخش، برنامهٔ سایت را باز کنید.</p><p><a href="/">بازگشت به والپیپرهای گیمینگ</a></p></header>`),
    });
  }

  if (pathname === "/404") return notFound();

  if (pathname === "/submit-wallpaper") {
    return page({
      title: `ارسال والپیپر توسط کاربران | ${SITE_NAME}`,
      description: "والپیپر خود را بدون نیاز به حساب کاربری ارسال کنید؛ فایل ابتدا خصوصی بررسی می‌شود و فقط با تایید مدیر در سایت منتشر خواهد شد.",
      canonical: canonical("/submit-wallpaper"), robots: noindexQuery ? "noindex, follow" : "index, follow",
      body: main(`<header class="page-header"><span class="eyebrow">مشارکت در گنجینه</span><h1>ارسال والپیپر برای بررسی</h1><p>تصویر و اطلاعاتش را بفرست؛ فایل تا زمان بررسی مدیر خصوصی می‌ماند و فقط پس از تأیید منتشر می‌شود. برای ارسال حساب کاربری، ایمیل یا شماره تماس لازم نیست.</p><p><a class="button-primary" href="/">مرور والپیپرهای منتشرشده</a> <a class="button-secondary" href="/request">درخواست والپیپر</a></p></header>`),
    });
  }

  if (pathname === "/request") {
    const preview = await getFeaturedPreview();
    return page({
      title: `درخواست والپیپر گیمینگ | ${SITE_NAME}`,
      description: "درخواست والپیپر بازی محبوبت را بفرست؛ پیش از ثبت، والپیپرهای مشابه گنجینه را بررسی کن.",
      canonical: canonical("/request"), robots: noindexQuery ? "noindex, follow" : "index, follow",
      ogImage: preview.url, ogImageAlt: preview.alt,
      body: main(`<header class="page-header"><span class="eyebrow">درخواست از گنجینه</span><h1>درخواست والپیپر گیمینگ</h1><p>اگر تصویر دلخواهت را پیدا نکردی، نام بازی، نوع تصویر و کیفیت موردنظرت را ثبت کن. پیش از ثبت، والپیپرهای مشابه سایت نمایش داده می‌شوند تا درخواست تکراری نفرستی.</p><p><a class="button-primary" href="/">جست‌وجو در والپیپرهای موجود</a> <a class="button-secondary" href="/collections">مرور مجموعه‌های آماده</a></p></header>${preview.markup}`),
    });
  }

  if (pathname === "/") {
    const cacheable = !noindexQuery;
    if (cacheable && homePageCache && homePageCache.expiresAt > Date.now()) return homePageCache.value;
    if (cacheable && homePagePending) return homePagePending;
    const renderHomePage = async (): Promise<SeoPage> => {
      try {
        const connectedDb = await getDb();
        if (!connectedDb) throw new Error("Database is unavailable");
        const [settings, wallpapers, games] = await Promise.all([
          getSiteSettings(),
          listWallpapers({ q: parsed.searchParams.get("q")?.slice(0, 120) || undefined, sort: "newest", limit: 12 }),
          listGames(),
        ]);
        const heading = `${settings.heroTitle} ${settings.heroAccentTitle}`.trim();
        const image = wallpapers[0] ? safeWallpaperImage(wallpapers[0].thumbnailUrl) ?? safeWallpaperImage(wallpapers[0].imageUrl) : undefined;
        const body = main(`<header class="page-header"><span class="eyebrow">${escapeHtml(settings.heroEyebrow)}</span><h1>${escapeHtml(shorten(heading, 80))}</h1><p>${escapeHtml(settings.heroSubtitle)}</p><p><a class="button-primary" href="#seo-wallpapers">مرور والپیپرهای گیمینگ</a> <a class="button-secondary" href="/request">درخواست والپیپر</a></p></header>${gameListMarkup(games)}<section id="seo-wallpapers" class="seo-link-section"><h2>والپیپرهای گیمینگ تازه</h2><p>تصاویر تازهٔ گنجینه را برای دسکتاپ و موبایل ببین و نسخهٔ مناسب را از صفحهٔ هر والپیپر دانلود کن.</p>${wallpapers.length ? `<div class="wallpaper-grid">${wallpapers.map(wallpaperCard).join("")}</div>` : "<p>والپیپر تازه‌ای در دسترس نیست؛ بعداً دوباره سر بزن.</p>"}</section>${collectionListMarkup()}`);
        return page({
          title: settings.seoTitle || DEFAULT_SITE_SETTINGS.seoTitle,
          description: settings.seoDescription || DEFAULT_SITE_SETTINGS.seoDescription,
          canonical: canonical("/"), robots: noindexQuery ? "noindex, follow" : "index, follow",
          ogImage: image ?? settings.logoUrl ?? LOGO_IMAGE, ogImageAlt: "والپیپرهای تازهٔ گیمینگ در پیکسل والپیپر", body,
        });
      } catch (error) {
        console.error("[SEO] Home page rendering failed", error instanceof Error ? error.name : "UnknownError");
        return page({ status: 503, title: DEFAULT_SITE_SETTINGS.seoTitle, description: DEFAULT_SITE_SETTINGS.seoDescription, robots: "noindex, follow", body: main(`<header class="page-header"><h1>پیکسل والپیپر</h1><p>دریافت محتوای گنجینه موقتاً ممکن نیست. کمی بعد دوباره تلاش کنید.</p></header>`) });
      }
    };
    if (!cacheable) return renderHomePage();
    homePagePending = renderHomePage();
    try {
      const rendered = await homePagePending;
      if (rendered.status === 200) homePageCache = { expiresAt: Date.now() + HOME_PAGE_CACHE_MS, value: rendered };
      return rendered;
    } finally {
      homePagePending = undefined;
    }
  }

  const wallpaperMatch = /^\/wallpapers\/(\d+)$/.exec(pathname);
  if (wallpaperMatch) {
    const id = Number(wallpaperMatch[1]);
    if (!Number.isSafeInteger(id) || id < 1) return notFound();
    try {
      const wallpaper = await getWallpaperById(id);
      if (!wallpaper) return notFound();
      const image = safeWallpaperImage(wallpaper.imageUrl) ?? safeWallpaperImage(wallpaper.thumbnailUrl);
      const mediaImage = safeWallpaperMedia(wallpaper.imageUrl) ?? safeWallpaperMedia(wallpaper.thumbnailUrl);
      const title = `${wallpaper.title} | دانلود والپیپر گیمینگ`;
      const summary = wallpaper.description?.trim() || `والپیپر ${wallpaper.title}${wallpaper.gameTitle ? ` از بازی ${wallpaper.gameTitle}` : ` در دستهٔ ${wallpaper.category}`} با وضوح ${wallpaper.resolution}؛ مناسب برای دسکتاپ، موبایل یا نمایشگر اولتراواید.`;
      const gameLink = wallpaper.gameTitle ? `<p><a href="/games/${encodeURIComponent(slugifyGame(wallpaper.gameTitle))}">دیدن همهٔ والپیپرهای ${escapeHtml(wallpaper.gameTitle)}</a></p>` : "";
      const details = [wallpaper.gameTitle, wallpaper.category, wallpaper.resolution, wallpaper.width && wallpaper.height ? `${wallpaper.width} × ${wallpaper.height}` : ""].filter(Boolean).join(" · ");
      return page({
        title, description: summary, canonical: canonical(`/wallpapers/${id}`), robots: noindexQuery ? "noindex, follow" : "index, follow",
        ogType: "article", ogImage: image ?? LOGO_IMAGE, ogImageAlt: wallpaper.title,
        body: main(`<div class="page-header"><a href="/">بازگشت به گنجینه</a></div><article class="detail-layout seo-detail"><div>${mediaImage ? `<img class="detail-image" src="${escapeHtml(mediaImage)}" alt="${escapeHtml(wallpaper.title)}" fetchpriority="high" decoding="async">` : ""}</div><div class="detail-panel"><span class="category-label">${escapeHtml(wallpaper.category)}</span><h1>${escapeHtml(shorten(wallpaper.title, 80))}</h1><p>${escapeHtml(summary)}</p><p class="seo-detail-specs">${escapeHtml(details)}</p><p><a class="button-primary" href="/api/wallpapers/${id}/download">دانلود والپیپر ${escapeHtml(wallpaper.resolution)}</a></p>${gameLink}<p><a href="/collections">مرور مجموعه‌های آماده</a></p></div></article>`),
      });
    } catch (error) {
      console.error("[SEO] Wallpaper rendering failed", error instanceof Error ? error.name : "UnknownError");
      return page({ status: 503, title: `والپیپر | ${SITE_NAME}`, description: "دریافت اطلاعات والپیپر موقتاً ممکن نیست؛ لطفاً دوباره تلاش کنید.", robots: "noindex, follow", body: main(`<header class="page-header"><h1>دریافت والپیپر موقتاً ممکن نیست</h1><p><a href="/">بازگشت به پیکسل والپیپر</a></p></header>`) });
    }
  }

  if (pathname === "/collections") {
    const preview = await getFeaturedPreview();
    const body = main(`<header class="page-header"><span class="eyebrow">انتخاب‌های ویژه</span><h1>مجموعه‌های آمادهٔ والپیپر گیمینگ</h1><p>والپیپرها را بر اساس سبک، دستگاه، وضوح و رنگ پیدا کن.</p></header><section class="seo-link-section"><ul>${collections.map(item => `<li><a href="/collections/${item.slug}">${escapeHtml(item.title)}</a> — ${escapeHtml(item.description)}</li>`).join("")}</ul></section>${preview.markup}`);
    return page({ title: `مجموعه‌های والپیپر گیمینگ | ${SITE_NAME}`, description: "مجموعه‌های آمادهٔ اکشن، ماجراجویی، سایبرپانک، موبایل، 4K و اولتراواید را در پیکسل والپیپر مرور کنید.", canonical: canonical("/collections"), robots: noindexQuery ? "noindex, follow" : "index, follow", ogImage: preview.url, ogImageAlt: preview.alt, body });
  }

  const collectionMatch = /^\/collections\/([^/]+)$/.exec(pathname);
  if (collectionMatch) {
    const collection = getCollection(collectionMatch[1]);
    if (!collection) return notFound();
    try {
      const result = await listWallpapersPage(collection.filters, 1, 12);
      const body = main(`<header class="page-header"><a href="/collections">همهٔ مجموعه‌ها</a><h1>${escapeHtml(collection.title)}</h1><p>${escapeHtml(collection.description)} ${Number(result.total).toLocaleString("fa-IR")} والپیپر در این مجموعه.</p></header><section class="seo-link-section"><h2>والپیپرهای ${escapeHtml(collection.title)}</h2>${result.items.length ? `<div class="wallpaper-grid">${result.items.map(wallpaperCard).join("")}</div>` : "<p>در حال حاضر والپیپری با این ویژگی در گنجینه نیست.</p>"}<p><a href="/">دیدن همهٔ والپیپرها</a></p></section>`);
      return page({ title: `${collection.title} | مجموعهٔ والپیپر`, description: `${collection.description} ${Number(result.total).toLocaleString("fa-IR")} والپیپر گیمینگ در پیکسل والپیپر.`, canonical: canonical(`/collections/${collection.slug}`), robots: noindexQuery ? "noindex, follow" : "index, follow", body });
    } catch (error) {
      console.error("[SEO] Collection rendering failed", error instanceof Error ? error.name : "UnknownError");
      return page({ status: 503, title: collection.title, description: collection.description, robots: "noindex, follow", body: main(`<header class="page-header"><h1>${escapeHtml(collection.title)}</h1><p>دریافت والپیپرهای این مجموعه موقتاً ممکن نیست.</p></header>`) });
    }
  }

  const gameMatch = /^\/games\/([^/]+)$/.exec(pathname);
  if (gameMatch) {
    try {
      const slug = gameMatch[1];
      const games = await listGames();
      const game = games.find(item => item.gameTitle && slugifyGame(item.gameTitle) === slug);
      if (!game?.gameTitle) return notFound();
      const wallpapers = await listWallpapers({ gameTitle: game.gameTitle, sort: "popular", limit: 24 });
      const title = `والپیپرهای ${game.gameTitle} | دانلود پس‌زمینهٔ بازی`;
      const summary = `${Number(game.wallpaperCount).toLocaleString("fa-IR")} والپیپر ${game.gameTitle} برای دسکتاپ و موبایل؛ تصاویر بازی را با کیفیت‌های موجود در پیکسل والپیپر دانلود کنید.`;
      return page({
        title, description: summary, canonical: canonical(`/games/${encodeURIComponent(slug)}`), robots: noindexQuery ? "noindex, follow" : "index, follow",
        ogImage: wallpapers[0] ? safeWallpaperImage(wallpapers[0].thumbnailUrl) ?? safeWallpaperImage(wallpapers[0].imageUrl) ?? LOGO_IMAGE : LOGO_IMAGE,
        ogImageAlt: `والپیپرهای ${game.gameTitle}`,
        body: main(`<header class="page-header"><span class="eyebrow">مجموعهٔ بازی</span><h1>${escapeHtml(shorten(`والپیپرهای ${game.gameTitle} برای دسکتاپ و موبایل`, 80))}</h1><p>${Number(game.wallpaperCount).toLocaleString("fa-IR")} والپیپر از ${escapeHtml(game.gameTitle)}؛ برای دیدن جزئیات، وضوح و دانلود هر تصویر وارد صفحهٔ آن شو.</p></header><section class="seo-link-section"><h2>تصاویر ${escapeHtml(game.gameTitle)}</h2>${wallpapers.length ? `<div class="wallpaper-grid">${wallpapers.map(wallpaperCard).join("")}</div>` : "<p>والپیپری برای این بازی در دسترس نیست.</p>"}<p><a href="/collections">کشف مجموعه‌های آماده</a></p></section>`),
      });
    } catch (error) {
      console.error("[SEO] Game rendering failed", error instanceof Error ? error.name : "UnknownError");
      return page({ status: 503, title: `والپیپر بازی | ${SITE_NAME}`, description: "دریافت اطلاعات بازی موقتاً ممکن نیست؛ لطفاً دوباره تلاش کنید.", robots: "noindex, follow", body: main(`<header class="page-header"><h1>دریافت والپیپرهای بازی موقتاً ممکن نیست</h1><p><a href="/">بازگشت به صفحهٔ اصلی</a></p></header>`) });
    }
  }

  return notFound();
}

export function injectSeoPage(template: string, result: SeoPage) {
  const canonicalTag = result.canonical ? `<link rel="canonical" href="${escapeHtml(result.canonical)}" />` : "";
  const ogUrlTag = result.canonical ? `<meta property="og:url" content="${escapeHtml(result.canonical)}" />` : "";
  const replacements: Record<string, string> = {
    "__SEO_TITLE__": escapeHtml(result.title),
    "__SEO_DESCRIPTION__": escapeHtml(result.description),
    "__SEO_ROBOTS__": result.robots,
    "__SEO_CANONICAL_TAG__": canonicalTag,
    "__SEO_OG_TYPE__": result.ogType,
    "__SEO_OG_TITLE__": escapeHtml(result.title),
    "__SEO_OG_DESCRIPTION__": escapeHtml(result.description),
    "__SEO_OG_URL_TAG__": ogUrlTag,
    "__SEO_OG_IMAGE__": escapeHtml(result.ogImage),
    "__SEO_OG_IMAGE_ALT__": escapeHtml(result.ogImageAlt),
    "__SEO_TWITTER_TITLE__": escapeHtml(result.title),
    "__SEO_TWITTER_DESCRIPTION__": escapeHtml(result.description),
    "__SEO_TWITTER_IMAGE__": escapeHtml(result.ogImage),
    "__SEO_BODY__": result.body,
  };
  let output = template;
  for (const [token, value] of Object.entries(replacements)) output = output.replaceAll(token, value);
  return output;
}
