import { describe, expect, it } from "vitest";
import { getResponsiveImageSource } from "./imagekit";

describe("responsive ImageKit image sources", () => {
  const source = "https://ik.imagekit.io/xwqxnxqle/wallpapers/sample.webp";

  it("builds width-specific modern-format variants for public account assets", () => {
    const result = getResponsiveImageSource(source, [320, 640, 960], { quality: 80, maxWidth: 960 });
    expect(result.src).toBe("https://ik.imagekit.io/xwqxnxqle/tr:w-640,q-80,f-auto/wallpapers/sample.webp");
    expect(result.srcSet).toBe([
      "https://ik.imagekit.io/xwqxnxqle/tr:w-320,q-80,f-auto/wallpapers/sample.webp 320w",
      "https://ik.imagekit.io/xwqxnxqle/tr:w-640,q-80,f-auto/wallpapers/sample.webp 640w",
      "https://ik.imagekit.io/xwqxnxqle/tr:w-960,q-80,f-auto/wallpapers/sample.webp 960w",
    ].join(", "));
  });

  it("does not request a transformed width above the intrinsic source width", () => {
    const result = getResponsiveImageSource(source, [320, 640, 960, 1280], { maxWidth: 500, quality: 84 });
    expect(result.srcSet).toBe([
      "https://ik.imagekit.io/xwqxnxqle/tr:w-320,q-84,f-auto/wallpapers/sample.webp 320w",
      "https://ik.imagekit.io/xwqxnxqle/tr:w-500,q-84,f-auto/wallpapers/sample.webp 500w",
    ].join(", "));
    expect(result.src).toContain("tr:w-500,q-84,f-auto");
  });

  it("leaves other endpoints, query-based URLs, and invalid sources unchanged", () => {
    const otherAccount = "https://ik.imagekit.io/another-account/wallpapers/sample.webp";
    const queryUrl = `${source}?tr=w-200`;
    for (const url of ["https://example.com/sample.webp", otherAccount, queryUrl, "not a URL"]) {
      expect(getResponsiveImageSource(url, [320, 640])).toEqual({ src: url });
    }
  });
});
