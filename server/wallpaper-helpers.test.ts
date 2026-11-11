import { describe, expect, it } from "vitest";
import { deviceForDimensions, formatBytes, ratioLabel, resolutionForDimensions, slugifyGame } from "../client/src/lib/wallpaper";

describe("wallpaper metadata helpers", () => {
  it("reduces aspect ratios", () => {
    expect(ratioLabel(3840, 2160)).toBe("16:9");
    expect(ratioLabel(1080, 1920)).toBe("9:16");
    expect(ratioLabel(null, 0)).toBe("نامشخص");
  });
  it("classifies wallpaper device targets from dimensions", () => {
    expect(deviceForDimensions(1080, 1920)).toBe("mobile");
    expect(deviceForDimensions(1920, 1080)).toBe("desktop");
    expect(deviceForDimensions(3440, 1440)).toBe("ultrawide");
  });
  it("preserves exact dimensions and known resolution labels", () => {
    expect(resolutionForDimensions(3840, 2160)).toBe("4K 3840×2160");
    expect(resolutionForDimensions(2560, 1080)).toBe("2560×1080");
  });
  it("makes stable game slugs and readable file sizes", () => {
    expect(slugifyGame("Cyberpunk 2077")).toBe("cyberpunk-2077");
    expect(formatBytes(1024 * 1024)).toBe("1.0 مگابایت");
    expect(formatBytes(0)).toBe("نامشخص");
  });
});
