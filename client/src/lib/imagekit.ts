import { getImageKitMediaUrl, IMAGEKIT_PREVIEW_WIDTHS } from "@shared/imagekit-media";

const MAX_IMAGE_WIDTH = 3840;
const LEGACY_SITE_LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519664055778542/BvOcnZWtyFfXPqMt.png";
const LOCAL_SITE_LOGO_URL = "/site-logo.webp";

type ResponsiveImageSourceOptions = {
  quality?: number;
  maxWidth?: number;
};

function normalizedSource(source: string) {
  return source === LEGACY_SITE_LOGO_URL ? LOCAL_SITE_LOGO_URL : source;
}

function transformUrl(source: string, width: number, quality: number) {
  return getImageKitMediaUrl(source, width, quality) ?? normalizedSource(source);
}

/** Build first-party src/srcSet URLs for display. Full-resolution downloads use the download endpoint. */
export function getResponsiveImageSource(
  source: string,
  requestedWidths: number[],
  options: ResponsiveImageSourceOptions = {},
): { src: string; srcSet?: string } {
  const normalized = normalizedSource(source);
  if (!getImageKitMediaUrl(normalized, IMAGEKIT_PREVIEW_WIDTHS[0], 80)) return { src: normalized };

  const maxWidthValue = options.maxWidth ?? MAX_IMAGE_WIDTH;
  const maxWidth = Number.isFinite(maxWidthValue)
    ? Math.max(1, Math.min(MAX_IMAGE_WIDTH, Math.round(maxWidthValue)))
    : MAX_IMAGE_WIDTH;
  const widths = [...new Set(requestedWidths
    .filter(width => Number.isFinite(width) && width > 0)
    .map(width => {
      const desiredWidth = Math.min(maxWidth, MAX_IMAGE_WIDTH, Math.max(1, Math.round(width)));
      const available = IMAGEKIT_PREVIEW_WIDTHS.filter(candidate => candidate <= desiredWidth && candidate <= maxWidth);
      return available.length ? available[available.length - 1] : IMAGEKIT_PREVIEW_WIDTHS[0];
    }))].sort((a, b) => a - b);
  if (!widths.length) return { src: normalized };

  const quality = options.quality === 84 ? 84 : 80;
  const fallbackWidth = widths[Math.floor(widths.length / 2)];
  const srcSet = widths.map(width => `${transformUrl(source, width, quality)} ${width}w`).join(", ");
  return { src: transformUrl(source, fallbackWidth, quality), srcSet };
}
