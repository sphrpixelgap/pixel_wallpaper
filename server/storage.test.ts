import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveImageKitDownloadUrl, storageFetch, storageGetSignedUrl } from "./storage";

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
