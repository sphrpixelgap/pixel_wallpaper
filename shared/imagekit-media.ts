export const IMAGEKIT_PREVIEW_WIDTHS = [16, 32, 64, 96, 128, 160, 320, 480, 640, 720, 960, 1280, 1600, 1920, 2560, 3200, 3840] as const;
export const IMAGEKIT_PREVIEW_QUALITIES = [80, 84] as const;

const IMAGEKIT_HOST = "ik.imagekit.io";
const IMAGEKIT_ACCOUNT_ID = "xwqxnxqle";
const ALLOWED_ASSET_PREFIXES = ["wallpapers/", "site-settings/"] as const;

/** Map a public asset from this ImageKit account to a first-party, bucketed media URL. */
export function getImageKitMediaUrl(source: string, width: number, quality: number): string | undefined {
  if (!IMAGEKIT_PREVIEW_WIDTHS.includes(width as typeof IMAGEKIT_PREVIEW_WIDTHS[number]) ||
      !IMAGEKIT_PREVIEW_QUALITIES.includes(quality as typeof IMAGEKIT_PREVIEW_QUALITIES[number])) return undefined;

  try {
    const url = new URL(source);
    const accountPrefix = `/${IMAGEKIT_ACCOUNT_ID}/`;
    if (url.protocol !== "https:" || url.hostname !== IMAGEKIT_HOST || url.port || url.username || url.password || url.hash ||
        [...url.searchParams.keys()].some(key => key !== "tr") || !url.pathname.startsWith(accountPrefix)) return undefined;

    const assetPath = url.pathname.slice(accountPrefix.length);
    const decodedPath = decodeURIComponent(assetPath);
    const segments = decodedPath.split("/");
    if (!assetPath || segments.some(segment => !segment || segment === "." || segment === ".." || segment.startsWith("tr:")) ||
        decodedPath.includes("\\") || /[\u0000-\u001f\u007f]/.test(decodedPath) ||
        !ALLOWED_ASSET_PREFIXES.some(prefix => decodedPath.startsWith(prefix))) return undefined;

    return `/media/${assetPath}?w=${width}&q=${quality}`;
  } catch {
    return undefined;
  }
}
