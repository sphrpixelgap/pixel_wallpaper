import { collections } from "../shared/collections";

export const SITE_ORIGIN = "https://pixelwp-kngtqsrq.manus.space";
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
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

export function getPublicImageUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.origin !== SITE_ORIGIN || !url.pathname.startsWith("/manus-storage/") || url.search || url.hash || url.pathname.split("/").includes("..")) return undefined;
    return url.toString();
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
