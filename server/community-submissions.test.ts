import { describe, expect, it } from "vitest";
import {
  communityWallpaperSubmissionBucketHash,
  parseCommunityWallpaperSubmissionHeader,
  resolutionForWallpaperDimensions,
  targetDeviceForWallpaperDimensions,
} from "./community-submissions";

const validSubmission = {
  title: "والپیپر شبانه",
  category: "اکشن",
  gameTitle: "Elden Ring",
  tags: "dark, fantasy",
  description: "فضای شبانه",
  sourceUrl: "https://artist.example/work/1",
  rightsAccepted: true,
  website: "",
};

describe("community wallpaper submissions", () => {
  it("accepts bounded metadata only when the user confirms publishing rights", () => {
    expect(parseCommunityWallpaperSubmissionHeader(JSON.stringify(validSubmission))?.title).toBe("والپیپر شبانه");
    expect(parseCommunityWallpaperSubmissionHeader(JSON.stringify({ ...validSubmission, rightsAccepted: false }))).toBeNull();
    expect(parseCommunityWallpaperSubmissionHeader(JSON.stringify({ ...validSubmission, title: "x" }))).toBeNull();
    expect(parseCommunityWallpaperSubmissionHeader(JSON.stringify({ ...validSubmission, sourceUrl: "https://user:pass@artist.example/a" }))).toBeNull();
  });

  it("rejects malformed and oversized metadata headers", () => {
    expect(parseCommunityWallpaperSubmissionHeader(undefined)).toBeNull();
    expect(parseCommunityWallpaperSubmissionHeader("{" )).toBeNull();
    expect(parseCommunityWallpaperSubmissionHeader("x".repeat(8193))).toBeNull();
  });

  it("uses a domain-separated HMAC bucket and classifies aspect ratios", () => {
    const first = communityWallpaperSubmissionBucketHash("203.0.113.8", "test-secret");
    expect(first).toHaveLength(64);
    expect(first).not.toBe(communityWallpaperSubmissionBucketHash("203.0.113.9", "test-secret"));
    expect(first).not.toBe(communityWallpaperSubmissionBucketHash("203.0.113.8", "another-secret"));
    expect(targetDeviceForWallpaperDimensions(1080, 1920)).toBe("mobile");
    expect(targetDeviceForWallpaperDimensions(5120, 1440)).toBe("ultrawide");
    expect(resolutionForWallpaperDimensions(3840, 2160)).toBe("4K 3840×2160");
    expect(resolutionForWallpaperDimensions(2560, 1600)).toBe("سفارشی");
  });
});
