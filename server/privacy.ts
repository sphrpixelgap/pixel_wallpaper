export function redactContactInfo(value: string | null): string | null {
  if (value === null) return null;
  const westernDigits = value.replace(/[۰-۹٠-٩]/g, digit => {
    const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    const index = persianDigits.indexOf(digit);
    return String(index >= 0 ? index : arabicDigits.indexOf(digit));
  });
  return westernDigits
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[contact removed]")
    .replace(/\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s<>()]+|\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi, "[link removed]")
    .replace(/(?<![\p{L}\p{N}_@.-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,}(?::\d{1,5})?(?:[/?#][^\s<>()]*)?/giu, "[link removed]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#][^\s<>()]*)?/g, "[link removed]")
    .replace(/(?:\+?\d[\s().-]?){7,15}/g, match =>
      (match.match(/\d/g)?.length ?? 0) >= 8 ? "[contact removed]" : match,
    );
}

export function redactWallpaperIssueDetails(value: string | null): string | null {
  return redactContactInfo(value)
    ?.replaceAll("[contact removed]", "[اطلاعات تماس حذف شد]")
    .replaceAll("[link removed]", "[پیوند حذف شد]")
    .slice(0, 800) ?? null;
}
