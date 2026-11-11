import { describe, expect, it } from "vitest";
import { exportFavoritesJson, parseFavoritesJson } from "../client/src/lib/wallpaper";
import { expandWallpaperSearchTerms, normalizeWallpaperTitleForDuplicateReview } from "./db";

describe("curated wallpaper search aliases", () => {
  it("normalizes Persian spacing and expands a known alias to its canonical game name", () => {
    const terms = expandWallpaperSearchTerms("  فورت نایت  ");
    expect(terms).toContain("fortnite");
    expect(terms).toContain("فورت نایت");
  });

  it("normalizes Arabic yeh/kaf and zero-width non-joiners", () => {
    expect(expandWallpaperSearchTerms("الدن‌ رینگ")).toContain("elden ring");
  });

  it("keeps unknown queries as a normalized single search term", () => {
    expect(expandWallpaperSearchTerms("  بازی تازه  ")).toEqual(["بازی تازه"]);
  });

  it("normalizes Persian wallpaper-number suffixes for cautious duplicate review", () => {
    expect(normalizeWallpaperTitleForDuplicateReview("Until Dawn — والپیپر ۱۰")).toBe("until dawn");
    expect(normalizeWallpaperTitleForDuplicateReview("Until Dawn — والپیپر ۲")).toBe("until dawn");
  });
});

describe("portable favorites JSON", () => {
  it("exports only unique positive safe integer IDs and reads the versioned payload", () => {
    const payload = exportFavoritesJson([12, 12, -3, 0, Number.MAX_SAFE_INTEGER + 1, 44]);
    expect(parseFavoritesJson(payload)).toEqual([12, 44]);
  });

  it("discards invalid and repeated imported IDs", () => {
    const payload = JSON.stringify({ format: "pixel-wallpaper-favorites", version: 1, favorites: [5, 5, "6", 0, -8, 9.5, 7] });
    expect(parseFavoritesJson(payload)).toEqual([5, 7]);
  });

  it("rejects malformed, unsupported and empty favorite files", () => {
    expect(() => parseFavoritesJson("{" )).toThrow("JSON");
    expect(() => parseFavoritesJson(JSON.stringify({ format: "other", version: 1, favorites: [1] }))).toThrow("قالب");
    expect(() => parseFavoritesJson(JSON.stringify({ format: "pixel-wallpaper-favorites", version: 1, favorites: ["bad", 0] }))).toThrow("شناسه");
  });
});
