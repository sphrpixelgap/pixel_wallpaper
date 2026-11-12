// ImageKit-backed storage for production uploads.
import { ENV } from "./_core/env";

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

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
  const { privateKey } = getImageKitUploadConfig();
  const key = normalizeKey(relKey);
  const fileName = key.split("/").pop() || `upload-${crypto.randomUUID()}`;
  const folder = key.includes("/") ? `/${key.slice(0, key.lastIndexOf("/"))}` : "/";
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("fileName", fileName);
  form.append("folder", folder);
  form.append("useUniqueFileName", "true");
  form.append("tags", "pixel-wallpaper");
  const auth = Buffer.from(`${privateKey}:`).toString("base64");
  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", headers: { Authorization: `Basic ${auth}` }, body: form });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`ImageKit upload failed (${response.status}): ${message}`);
  }
  const result = await response.json() as { url?: string };
  if (!result.url) throw new Error("ImageKit returned no public URL");
  return { key: result.url, url: result.url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: key.startsWith("https://") ? key : `${getImageKitEndpoint()}/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return resolveImageKitDownloadUrl(relKey);
}

export async function storageFetch(relKey: string): Promise<Response> {
  const url = await storageGetSignedUrl(relKey);
  return fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
}
