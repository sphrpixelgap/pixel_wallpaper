import { describe, expect, it } from "vitest";
import {
  buildGeminiGenerateContentBody,
  extractGeminiGenerateContentText,
  getRequestDuplicatePolicy,
  parseGeminiDuplicateMatches,
} from "./request-duplicate-check";

describe("Gemini duplicate response validation", () => {
  it("builds the current REST JSON-format request and sends text metadata only", () => {
    const body = buildGeminiGenerateContentBody({
      gameTitle: "XCOM 2",
      wantedContent: "A specific soldier portrait",
      targetDevice: "desktop",
      resolution: "1920x1080",
      details: "Purple lighting. Email gamer@example.com, phone ۰۹۱۲۱۲۳۴۵۶۷, link https://example.com/image.webp, bare pixelwp.example.com/path?ref=1, ftp://uploads.example.net/a.webp, //mirror.example.org/x, دامنهٔ مقصد.ایران/مسیر.",
    }, [{
      id: 42,
      title: "XCOM 2 — Soldier portrait",
      gameTitle: "XCOM 2",
      category: "Action",
      tags: "soldier, purple",
      mood: "dark",
      resolution: "1920x1080",
      targetDevice: "desktop",
      description: "Contact catalog@example.com or 09121234567. See https://example.com/wallpaper.webp.",
    }]);

    expect(body.generationConfig.responseFormat.text.mimeType).toBe("APPLICATION_JSON");
    expect(body.generationConfig.responseFormat.text.schema).toMatchObject({
      type: "object",
      required: ["matches"],
    });
    const promptData = JSON.parse(body.contents[0].parts[0].text);
    expect(promptData.candidates[0].id).toBe(42);
    expect(promptData.request.resolution).toBe("1920x1080");
    expect(promptData.request.details).toContain("[contact removed]");
    expect(promptData.request.details).toContain("[link removed]");
    expect(JSON.stringify(promptData)).not.toContain("gamer@example.com");
    expect(JSON.stringify(promptData)).not.toContain("catalog@example.com");
    expect(JSON.stringify(promptData)).not.toContain("09121234567");
    expect(JSON.stringify(promptData)).not.toContain("https://");
    expect(JSON.stringify(promptData)).not.toContain("pixelwp.example.com");
    expect(JSON.stringify(promptData)).not.toContain("uploads.example.net");
    expect(JSON.stringify(promptData)).not.toContain("mirror.example.org");
    expect(JSON.stringify(promptData)).not.toContain("مقصد.ایران");
    expect(JSON.stringify(body)).not.toContain("thumbnailUrl");
    expect(JSON.stringify(body)).not.toContain("imageUrl");
  });

  it("keeps only supplied candidate IDs, valid strengths and unique matches", () => {
    const result = parseGeminiDuplicateMatches(JSON.stringify({
      matches: [
        { id: 12, strength: "strong" },
        { id: 999, strength: "strong" },
        { id: 12, strength: "possible" },
        { id: 14, strength: "possible" },
        { id: 15, strength: "invalid" },
      ],
    }), new Set([12, 14]));

    expect(result).toEqual([
      { id: 12, strength: "strong" },
      { id: 14, strength: "possible" },
    ]);
  });

  it("never returns more than five valid matches", () => {
    const allowed = new Set([1, 2, 3, 4, 5, 6, 7]);
    const result = parseGeminiDuplicateMatches(JSON.stringify({
      matches: [...allowed].map(id => ({ id, strength: "possible" })),
    }), allowed);

    expect(result).toHaveLength(5);
  });

  it("distinguishes an empty valid result from malformed output", () => {
    expect(parseGeminiDuplicateMatches('{"matches":[]}', new Set())).toEqual([]);
    expect(parseGeminiDuplicateMatches("not json", new Set())).toBeNull();
    expect(parseGeminiDuplicateMatches('{"items":[]}', new Set())).toBeNull();
  });

  it("extracts visible generateContent text and rejects incomplete generations", () => {
    expect(extractGeminiGenerateContentText({
      candidates: [{ finishReason: "STOP", content: { parts: [
        { text: "internal reasoning", thought: true },
        { text: '{"matches":[]}' },
      ] } }],
    })).toBe('{"matches":[]}');

    expect(extractGeminiGenerateContentText({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"matches":' }] } }],
    })).toBeNull();
  });

  it("blocks only strong matches and fails open with a warning when the AI is unavailable", () => {
    expect(getRequestDuplicatePolicy("strong")).toEqual({ blocked: true, warning: null });
    expect(getRequestDuplicatePolicy("possible")).toEqual({ blocked: false, warning: "possible" });
    expect(getRequestDuplicatePolicy("unavailable")).toEqual({ blocked: false, warning: "unavailable" });
    expect(getRequestDuplicatePolicy("clear")).toEqual({ blocked: false, warning: null });
  });
});
