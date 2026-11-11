// ImageKit-backed storage for production uploads.
import { ENV } from "./_core/env";

function getImageKitConfig() {
  const endpoint = ENV.imageKitUrlEndpoint.replace(/\/+$/, "");
  const privateKey = ENV.imageKitPrivateKey;
  if (!endpoint || !privateKey) throw new Error("ImageKit storage config missing: set IMAGEKIT_URL_ENDPOINT and IMAGEKIT_PRIVATE_KEY");
  return { endpoint, privateKey };
}

function normalizeKey(relKey: string): string { return relKey.replace(/^\/+/, ""); }

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
  const { privateKey } = getImageKitConfig();
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
  return { key, url: key.startsWith("https://") ? key : `${ENV.imageKitUrlEndpoint.replace(/\/+$/, "")}/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return key.startsWith("https://") ? key : `${ENV.imageKitUrlEndpoint.replace(/\/+$/, "")}/${key}`;
}
