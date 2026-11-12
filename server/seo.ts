import { collections } from "../shared/collections";

const DEFAULT_SITE_ORIGIN = "https://xfthxfth.dpdns.org";
const DEFAULT_IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/xwqxnxqle";

function resolveSiteOrigin() {
  const raw = process.env.SITE_ORIGIN?.trim() || DEFAULT_SITE_ORIGIN;
  const url = new URL(raw);
  const isLocalHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !isLocalHttp) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SITE_ORIGIN must be an HTTPS origin without a path, query, or fragment.");
  }
  return url.origin;
}

export const SITE_ORIGIN = resolveSiteOrigin();
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
const IMAGE_NAMESPACE = "http://www.google.com/schemas/sitemap-image/1.1";

export type SitemapWallpaper = {
  id: number;
  title?: string | null;
  gameTitle: string | null;
  updatedAt: Date | string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
};

type SitemapLocation = { path: string; lastmod?: string; imageUrl?: string; imageTitle?: string };

function escapeXml(value: string) {
  const validXmlValue = Array.from(value).filter(character => {
    const codePoint = character.codePointAt(0)!;
    return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
  }).join("");
  return validXmlValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function getImageKitEndpoint() {
  try {
    const endpoint = new URL(process.env.IMAGEKIT_URL_ENDPOINT?.trim() || DEFAULT_IMAGEKIT_URL_ENDPOINT);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return undefined;
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, "") || "/";
    if (endpoint.hostname === "ik.imagekit.io" && endpoint.pathname === "/") return undefined;
    return endpoint;
  } catch {
    return undefined;
  }
}

export function getPublicImageUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.username || url.password || url.search || url.hash || url.pathname.split("/").includes("..")) return undefined;

    const isSiteStorage = url.origin === SITE_ORIGIN && url.pathname.startsWith("/manus-storage/");
    const imageKitEndpoint = getImageKitEndpoint();
    const endpointPath = imageKitEndpoint?.pathname.replace(/\/+$/, "") || "";
    const isImageKitStorage = Boolean(
      imageKitEndpoint && url.origin === imageKitEndpoint.origin &&
      (!endpointPath || url.pathname === endpointPath || url.pathname.startsWith(`${endpointPath}/`))
    );
    return isSiteStorage || isImageKitStorage ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function slugifyGame(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function toLastmod(value: Date | string | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function buildSitemapXml(wallpapers: readonly SitemapWallpaper[]) {
  const locations = new Map<string, SitemapLocation>();
  const add = ({ path, lastmod, imageUrl, imageTitle }: SitemapLocation) => {
    const location = escapeXml(new URL(path, SITE_ORIGIN).toString());
    const previous = locations.get(location);
    locations.set(location, {
      path,
      lastmod: lastmod ?? previous?.lastmod,
      imageUrl: imageUrl ?? previous?.imageUrl,
      imageTitle: imageTitle ?? previous?.imageTitle,
    });
  };

  add({ path: "/" });
  add({ path: "/request" });
  add({ path: "/submit-wallpaper" });
  add({ path: "/collections" });
  for (const collection of collections) add({ path: `/collections/${collection.slug}` });
  const games = new Set<string>();
  for (const wallpaper of wallpapers) {
    if (!Number.isSafeInteger(wallpaper.id) || wallpaper.id < 1) continue;
    const imageUrl = getPublicImageUrl(wallpaper.imageUrl) ?? getPublicImageUrl(wallpaper.thumbnailUrl);
    add({ path: `/wallpapers/${wallpaper.id}`, lastmod: toLastmod(wallpaper.updatedAt), imageUrl, imageTitle: wallpaper.title ?? undefined });
    const title = wallpaper.gameTitle?.trim();
    if (title) {
      const slug = slugifyGame(title);
      if (slug) games.add(slug);
    }
  }
  for (const slug of games) add({ path: `/games/${encodeURIComponent(slug)}` });

  const entries = [...locations.entries()].sort(([left], [right]) => left.localeCompare(right));
  const urlRows = entries.map(([location, entry]) => {
    const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
    const image = entry.imageUrl
      ? `<image:image><image:loc>${escapeXml(entry.imageUrl)}</image:loc>${entry.imageTitle ? `<image:title>${escapeXml(entry.imageTitle)}</image:title>` : ""}</image:image>`
      : "";
    return `  <url><loc>${location}</loc>${lastmod}${image}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}" xmlns:image="${IMAGE_NAMESPACE}">\n${urlRows.join("\n")}\n</urlset>\n`;
}

export function buildRobotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/*",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}
