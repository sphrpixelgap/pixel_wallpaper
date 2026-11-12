import { z } from "zod";
import { hashClientAddress } from "./request-rate-limit";

export const COMMUNITY_WALLPAPER_SUBMISSION_LIMIT = 3;
export const COMMUNITY_WALLPAPER_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

function isSafeHttpsUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export const communityWallpaperSubmissionSchema = z.object({
  title: z.string().trim().min(2).max(180),
  category: z.string().trim().min(2).max(80),
  gameTitle: z.string().trim().max(160).optional().default(""),
  tags: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(1200).optional().default(""),
  sourceUrl: z.string().trim().max(1024).optional().default("").refine(isSafeHttpsUrl, "پیوند منبع باید HTTPS و بدون اطلاعات ورود باشد."),
  rightsAccepted: z.literal(true),
  website: z.string().max(200).optional().default(""),
}).strict();

export type CommunityWallpaperSubmissionInput = z.infer<typeof communityWallpaperSubmissionSchema>;

export function parseCommunityWallpaperSubmissionHeader(value: string | undefined) {
  if (!value || value.length > 8192) return null;
  try {
    const result = communityWallpaperSubmissionSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function communityWallpaperSubmissionBucketHash(address: string, secret: string) {
  if (!secret) throw new Error("A stable server secret is required for community upload rate limits.");
  return hashClientAddress(`community-wallpaper-submission:${address}`, secret);
}

export function resolutionForWallpaperDimensions(width: number, height: number) {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const presets: Array<[number, number, string]> = [
    [3840, 2160, "4K 3840×2160"],
    [3440, 1440, "Ultrawide 3440×1440"],
    [2560, 1440, "QHD 2560×1440"],
    [1920, 1080, "Full HD 1920×1080"],
  ];
  return presets.find(([presetLong, presetShort]) => long === presetLong && short === presetShort)?.[2] ?? "سفارشی";
}

export function targetDeviceForWallpaperDimensions(width: number, height: number): "desktop" | "mobile" | "ultrawide" {
  const ratio = width / height;
  if (ratio <= 0.8) return "mobile";
  if (ratio >= 2.1) return "ultrawide";
  return "desktop";
}
