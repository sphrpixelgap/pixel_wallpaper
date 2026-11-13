import { describe, expect, it } from "vitest";
import { getResponsiveImageSource } from "./imagekit";

describe("responsive first-party ImageKit image sources", () => {
  const source = "https://ik.imagekit.io/xwqxnxqle/wallpapers/sample.webp";

  it("builds width-specific same-origin WebP media variants", () => {
    const result = getResponsiveImageSource(source, [320, 640, 960], { quality: 80, maxWidth: 960 });
    expect(result.src).toBe("/media/wallpapers/sample.webp?w=640&q=80");
    expect(result.srcSet).toBe([
      "/media/wallpapers/sample.webp?w=320&q=80 320w",
      "/media/wallpapers/sample.webp?w=640&q=80 640w",
      "/media/wallpapers/sample.webp?w=960&q=80 960w",
    ].join(", "));
  });

  it("caps to an approved transform bucket no larger than the intrinsic width", () => {
    const result = getResponsiveImageSource(source, [320, 640, 960, 1280], { maxWidth: 500, quality: 84 });
    expect(result.srcSet).toBe([
      "/media/wallpapers/sample.webp?w=320&q=84 320w",
      "/media/wallpapers/sample.webp?w=480&q=84 480w",
    ].join(", "));
    expect(result.src).toBe("/media/wallpapers/sample.webp?w=480&q=84");
  });

  it("does not upscale a narrow source to the next desktop-sized bucket", () => {
    const result = getResponsiveImageSource(source, [160, 320], { maxWidth: 120 });
    expect(result.srcSet).toBe("/media/wallpapers/sample.webp?w=96&q=80 96w");
    expect(result.src).toBe("/media/wallpapers/sample.webp?w=96&q=80");
  });

  it("uses the first-party media route for logos uploaded to the allowed settings folder", () => {
    const logo = getResponsiveImageSource("https://ik.imagekit.io/xwqxnxqle/site-settings/logo.webp", [160, 320], { maxWidth: 320 });
    expect(logo.srcSet).toBe("/media/site-settings/logo.webp?w=160&q=80 160w, /media/site-settings/logo.webp?w=320&q=80 320w");
  });

  it("maps the known legacy logo to a local WebP asset", () => {
    const legacyLogo = "https://files.manuscdn.com/user_upload_by_module/session_file/310519664055778542/BvOcnZWtyFfXPqMt.png";
    expect(getResponsiveImageSource(legacyLogo, [160, 320])).toEqual({ src: "/site-logo.webp" });
  });

  it("leaves unsupported hosts, accounts, and folders unchanged", () => {
    const inputs = [
      "https://example.com/sample.webp",
      "https://ik.imagekit.io/another-account/wallpapers/sample.webp",
      "https://ik.imagekit.io/xwqxnxqle/community-pending/sample.webp",
      "not a URL",
    ];
    for (const url of inputs) expect(getResponsiveImageSource(url, [320, 640])).toEqual({ src: url });
  });

  it("maps a legacy query-based ImageKit transform to a clean first-party variant", () => {
    expect(getResponsiveImageSource(`${source}?tr=w-200`, [320]).src).toBe("/media/wallpapers/sample.webp?w=320&q=80");
  });
});
