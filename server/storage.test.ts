import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveImageKitDownloadUrl,
  storageDeleteFile,
  storageFetch,
  storageGetSignedUrl,
  storagePromotePrivateImage,
  storagePut,
  storageSignPrivateUrl,
} from "./storage";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureImageKit(endpoint = "https://ik.imagekit.io/xwqxnxqle") {
  vi.stubEnv("IMAGEKIT_URL_ENDPOINT", endpoint);
  vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "test-only-imagekit-key");
}

describe("ImageKit download URL validation", () => {
  it("resolves safe relative and absolute URLs inside this account path", async () => {
    configureImageKit();
    const expected = "https://ik.imagekit.io/xwqxnxqle/wallpapers/one.webp";
    expect(resolveImageKitDownloadUrl("wallpapers/one.webp")).toBe(expected);
    await expect(storageGetSignedUrl(expected)).resolves.toBe(expected);
  });

  it("resolves same-account delivery URLs without the private upload key", () => {
    configureImageKit();
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "");
    expect(resolveImageKitDownloadUrl("wallpapers/one.webp"))
      .toBe("https://ik.imagekit.io/xwqxnxqle/wallpapers/one.webp");
  });

  it("preserves bounded query strings on same-account ImageKit URLs", () => {
    configureImageKit();
    expect(resolveImageKitDownloadUrl("https://ik.imagekit.io/xwqxnxqle/wallpapers/one.webp?tr=w-200"))
      .toBe("https://ik.imagekit.io/xwqxnxqle/wallpapers/one.webp?tr=w-200");
  });

  it("rejects other hosts, other accounts, credentials, queries, and traversal", () => {
    configureImageKit();
    for (const key of [
      "https://evil.example/wallpapers/one.webp",
      "https://ik.imagekit.io/another-account/wallpapers/one.webp",
      "https://user@ik.imagekit.io/xwqxnxqle/wallpapers/one.webp",
      "http://ik.imagekit.io/xwqxnxqle/wallpapers/one.webp",
      "../private/file.webp",
      "wallpapers/%2e%2e/private.webp",
      "//evil.example/file.webp",
      "file:///etc/passwd",
    ]) {
      expect(() => resolveImageKitDownloadUrl(key)).toThrow();
    }
  });

  it("rejects an ImageKit host endpoint without an account path", () => {
    configureImageKit("https://ik.imagekit.io/");
    expect(() => resolveImageKitDownloadUrl("other-account/file.webp")).toThrow();
  });

  it("requests upstream images without following redirects and with a timeout", async () => {
    configureImageKit();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);
    await storageFetch("wallpapers/one.webp");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://ik.imagekit.io/xwqxnxqle/wallpapers/one.webp");
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });
});

describe("private ImageKit community staging", () => {
  it("signs only same-account private paths with the documented expiry-bound HMAC", () => {
    configureImageKit();
    const now = 1_800_000_000_000;
    const signed = new URL(storageSignPrivateUrl("/community-pending/a.webp", 600, now));
    const expiry = String(Math.floor(now / 1000) + 600);
    const expected = createHmac("sha1", "test-only-imagekit-key").update(`community-pending/a.webp${expiry}`).digest("hex");
    expect(signed.origin + signed.pathname).toBe("https://ik.imagekit.io/xwqxnxqle/community-pending/a.webp");
    expect(signed.searchParams.get("ik-t")).toBe(expiry);
    expect(signed.searchParams.get("ik-s")).toBe(expected);
    expect(() => storageSignPrivateUrl("https://evil.example/a.webp", 300, now)).toThrow();
    expect(() => storageSignPrivateUrl("community-pending/a.webp?x=1", 300, now)).toThrow();
  });

  it("sets private upload flag and validates ImageKit's returned account path", async () => {
    configureImageKit();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      fileId: "file-123", filePath: "/community-pending/file.webp", url: "https://ik.imagekit.io/xwqxnxqle/community-pending/file.webp",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await storagePut("community-pending/file.webp", Buffer.from([1, 2]), "image/webp", { isPrivateFile: true });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("isPrivateFile")).toBe("true");
    expect(body.get("tags")).toBe("pixel-wallpaper,community-pending");
    expect(result.fileId).toBe("file-123");
    expect(result.key).toBe("community-pending/file.webp");
    expect(() => resolveImageKitDownloadUrl("https://evil.example/file.webp")).toThrow();
  });

  it("promotes a staged asset into a distinct public object and does not overwrite private delivery", async () => {
    configureImageKit();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([82, 73, 70, 70]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        fileId: "public-456", filePath: "/wallpapers/published.webp", url: "https://ik.imagekit.io/xwqxnxqle/wallpapers/published.webp",
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await storagePromotePrivateImage("community-pending/private.webp");
    const signedStageUrl = new URL(fetchMock.mock.calls[0][0]);
    const uploadBody = fetchMock.mock.calls[1][1].body as FormData;
    expect(signedStageUrl.pathname).toBe("/xwqxnxqle/community-pending/private.webp");
    expect(signedStageUrl.searchParams.has("ik-s")).toBe(true);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    expect(uploadBody.get("isPrivateFile")).toBe("false");
    expect(result.fileId).toBe("public-456");
    expect(result.key).toBe("wallpapers/published.webp");
  });

  it("deletes files only through the ImageKit file-management API with server credentials", async () => {
    configureImageKit();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await storageDeleteFile("file-123");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.imagekit.io/v1/files/file-123");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    await expect(storageDeleteFile("../bad")).rejects.toThrow();
  });
});
