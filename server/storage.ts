// ImageKit-backed storage for production uploads.
import { createHmac, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import { IMAGEKIT_PREVIEW_QUALITIES, IMAGEKIT_PREVIEW_WIDTHS } from "../shared/imagekit-media";

const MAX_STORED_IMAGE_BYTES = 12 * 1024 * 1024;
type StoragePutOptions = { isPrivateFile?: boolean };
export type StoragePutResult = { key: string; url: string; fileId?: string; filePath?: string };

function getImageKitEndpoint() {
  const endpoint = ENV.imageKitUrlEndpoint.replace(/\/+$/, "");
  if (!endpoint) throw new Error("ImageKit storage config missing: set IMAGEKIT_URL_ENDPOINT");
  return endpoint;
}

function getImageKitUploadConfig() {
  const endpoint = getImageKitEndpoint();
  const privateKey = ENV.imageKitPrivateKey;
  if (!privateKey) throw new Error("ImageKit upload config missing: set IMAGEKIT_PRIVATE_KEY");
  return { endpoint, privateKey };
}

function normalizeKey(relKey: string): string { return relKey.replace(/^\/+/, ""); }

function isSafePath(pathname: string) {
  try {
    const decoded = decodeURIComponent(pathname);
    return !decoded.split("/").some(segment => segment === "." || segment === "..") &&
      !decoded.includes("\\") && !/[\u0000-\u001f\u007f]/.test(decoded);
  } catch {
    return false;
  }
}

function getValidatedImageKitEndpoint() {
  const url = new URL(getImageKitEndpoint());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !isSafePath(url.pathname)) {
    throw new Error("ImageKit endpoint must be a safe HTTPS URL.");
  }
  if (url.hostname === "ik.imagekit.io" && url.pathname === "/") {
    throw new Error("The ImageKit delivery endpoint must include its account path.");
  }
  return url;
}

/** Resolve a stored key only inside the configured public ImageKit endpoint. */
export function resolveImageKitDownloadUrl(relKey: string): string {
  const raw = relKey.trim();
  if (!raw || raw.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(raw) || raw.includes("#")) {
    throw new Error("Invalid image storage key.");
  }

  const endpoint = getValidatedImageKitEndpoint();
  let target: URL;
  if (/^https:\/\//i.test(raw)) {
    target = new URL(raw);
  } else {
    if (raw.startsWith("//") || raw.includes("?") || /^[a-z][a-z\d+.-]*:/i.test(raw)) throw new Error("Only ImageKit keys are supported.");
    const relativeKey = normalizeKey(raw);
    if (!relativeKey || !isSafePath(relativeKey)) throw new Error("Invalid image storage key.");
    const basePath = endpoint.pathname.replace(/\/+$/, "");
    target = new URL(`${basePath}/${relativeKey}`, endpoint.origin);
  }

  const basePath = endpoint.pathname.replace(/\/+$/, "");
  const insideAccountPath = basePath
    ? target.pathname === basePath || target.pathname.startsWith(`${basePath}/`)
    : endpoint.hostname !== "ik.imagekit.io";
  if (target.protocol !== "https:" || target.username || target.password || target.search.length > 1024 || target.hash ||
      target.origin !== endpoint.origin || !insideAccountPath || !isSafePath(target.pathname)) {
    throw new Error("The stored image URL is outside the configured ImageKit endpoint.");
  }
  return target.toString();
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  options: StoragePutOptions = {},
): Promise<StoragePutResult> {
  const { privateKey } = getImageKitUploadConfig();
  const key = normalizeKey(relKey);
  if (!key || !isSafePath(key)) throw new Error("Invalid image storage key.");
  const fileName = key.split("/").pop() || `upload-${randomUUID()}`;
  const folder = key.includes("/") ? `/${key.slice(0, key.lastIndexOf("/"))}` : "/";
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("fileName", fileName);
  form.append("folder", folder);
  form.append("useUniqueFileName", "true");
  form.append("isPrivateFile", options.isPrivateFile ? "true" : "false");
  form.append("tags", options.isPrivateFile ? "pixel-wallpaper,community-pending" : "pixel-wallpaper");
  const auth = Buffer.from(`${privateKey}:`).toString("base64");
  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", headers: { Authorization: `Basic ${auth}` }, body: form, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`ImageKit upload failed (${response.status}): ${message.slice(0, 500)}`);
  }
  const result = await response.json() as { url?: string; fileId?: string; filePath?: string };
  if (!result.url) throw new Error("ImageKit returned no file URL");
  const url = resolveImageKitDownloadUrl(result.url);
  const filePath = result.filePath ? normalizeKey(result.filePath) : undefined;
  if (filePath) resolveImageKitDownloadUrl(filePath);
  return { key: filePath || url, url, fileId: result.fileId, filePath };
}

/** Create a short-lived signed delivery URL for a file marked private in ImageKit. */
export function storageSignPrivateUrl(relKey: string, expiresInSeconds = 600, now = Date.now()): string {
  const { privateKey } = getImageKitUploadConfig();
  const url = resolveImageKitDownloadUrl(relKey);
  const parsed = new URL(url);
  if (parsed.search) throw new Error("A private ImageKit URL cannot contain a pre-existing query string.");
  const endpoint = getValidatedImageKitEndpoint();
  const prefix = `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, "")}/`;
  if (!url.startsWith(prefix)) throw new Error("The stored image URL is outside the configured ImageKit endpoint.");
  const relativePath = url.slice(prefix.length);
  if (!relativePath) throw new Error("Invalid private ImageKit file path.");
  const safeLifetime = Math.min(Math.max(Math.floor(expiresInSeconds), 30), 3600);
  const expiry = Math.floor(now / 1000) + safeLifetime;
  const signature = createHmac("sha1", privateKey).update(`${relativePath}${expiry}`).digest("hex");
  parsed.searchParams.set("ik-t", String(expiry));
  parsed.searchParams.set("ik-s", signature);
  return parsed.toString();
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: key.startsWith("https://") ? key : `${getImageKitEndpoint()}/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return resolveImageKitDownloadUrl(relKey);
}

/** Build a deterministic WebP preview URL only for public wallpaper and site-logo assets. */
export function storageGetPreviewUrl(relKey: string, width: number, quality: number): string {
  if (!IMAGEKIT_PREVIEW_WIDTHS.includes(width as typeof IMAGEKIT_PREVIEW_WIDTHS[number]) ||
      !IMAGEKIT_PREVIEW_QUALITIES.includes(quality as typeof IMAGEKIT_PREVIEW_QUALITIES[number])) {
    throw new Error("Unsupported ImageKit preview transformation.");
  }
  const url = new URL(resolveImageKitDownloadUrl(relKey));
  const endpoint = getValidatedImageKitEndpoint();
  const endpointPath = endpoint.pathname.replace(/\/+$/, "");
  const basePath = endpointPath ? `${endpointPath}/` : "/";
  if (!url.pathname.startsWith(basePath)) throw new Error("The stored image URL is outside the configured ImageKit endpoint.");
  const assetPath = url.pathname.slice(basePath.length);
  const decodedPath = decodeURIComponent(assetPath);
  const segments = decodedPath.split("/");
  if (!assetPath || segments.some(segment => !segment || segment === "." || segment === ".." || segment.startsWith("tr:")) ||
      decodedPath.includes("\\") || /[\u0000-\u001f\u007f]/.test(decodedPath) ||
      !["wallpapers/", "site-settings/"].some(prefix => decodedPath.startsWith(prefix))) {
    throw new Error("Only public wallpaper and site-logo assets may be transformed.");
  }
  url.pathname = `${endpointPath}/tr:w-${width},q-${quality},f-webp/${assetPath}`;
  url.search = "";
  return url.toString();
}

export async function storageFetchPreview(relKey: string, width: number, quality: number): Promise<Response> {
  const url = storageGetPreviewUrl(relKey, width, quality);
  return fetch(url, { headers: { Accept: "image/webp" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
}

export async function storageFetch(relKey: string): Promise<Response> {
  const url = await storageGetSignedUrl(relKey);
  return fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
}

export async function storageFetchPrivate(relKey: string): Promise<Response> {
  const url = storageSignPrivateUrl(relKey, 300);
  return fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
}

/** Copy a staged private image to a new public object without changing the staged asset's privacy. */
export async function storagePromotePrivateImage(relKey: string): Promise<StoragePutResult> {
  const response = await storageFetchPrivate(relKey);
  if (!response.ok) throw new Error(`Private ImageKit file could not be read (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_STORED_IMAGE_BYTES) throw new Error("Stored image exceeds the promotion size limit.");
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > MAX_STORED_IMAGE_BYTES) throw new Error("Stored image is empty or exceeds the promotion size limit.");
  return storagePut(`wallpapers/${randomUUID()}.webp`, data, "image/webp");
}

export async function storageDeleteFile(fileId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(fileId)) throw new Error("Invalid ImageKit file ID.");
  const { privateKey } = getImageKitUploadConfig();
  const auth = Buffer.from(`${privateKey}:`).toString("base64");
  const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${auth}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && response.status !== 404) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`ImageKit delete failed (${response.status}): ${message.slice(0, 300)}`);
  }
}
