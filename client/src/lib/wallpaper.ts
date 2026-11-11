import { useEffect, useState } from "react";

export const categories = ["اکشن", "ماجراجویی", "فانتزی", "سایبرپانک", "RPG", "FPS", "استراتژی", "سایر"];
export const moods = ["دارک", "نئونی", "فانتزی", "سینمایی", "آرامش‌بخش", "حماسی", "سایر"];
export const colors = [
  { label: "بنفش", value: "purple" }, { label: "آبی", value: "blue" }, { label: "قرمز", value: "red" },
  { label: "سبز", value: "green" }, { label: "نارنجی", value: "orange" }, { label: "تک‌رنگ", value: "mono" },
];
export const devices = [
  { label: "دسکتاپ", value: "desktop" }, { label: "موبایل", value: "mobile" }, { label: "اولتراواید", value: "ultrawide" },
];
export const resolutions = [
  { label: "4K · 3840×2160", value: "4K 3840×2160", width: 3840, height: 2160 },
  { label: "QHD · 2560×1440", value: "QHD 2560×1440", width: 2560, height: 1440 },
  { label: "Full HD · 1920×1080", value: "Full HD 1920×1080", width: 1920, height: 1080 },
  { label: "Ultrawide · 3440×1440", value: "Ultrawide 3440×1440", width: 3440, height: 1440 },
  { label: "سفارشی", value: "سفارشی", width: null, height: null },
];

export function ratioLabel(width?: number | null, height?: number | null) {
  if (!width || !height) return "نامشخص";
  const divisor = (a: number, b: number): number => b ? divisor(b, a % b) : a;
  const gcd = divisor(width, height);
  return `${width / gcd}:${height / gcd}`;
}

export function deviceForDimensions(width: number, height: number): "desktop" | "mobile" | "ultrawide" {
  const ratio = width / height;
  return ratio > 2.05 ? "ultrawide" : ratio < 0.82 ? "mobile" : "desktop";
}

export function resolutionForDimensions(width: number, height: number) {
  const common = resolutions.find(item => item.width === width && item.height === height);
  return common?.value ?? `${width}×${height}`;
}

export function slugifyGame(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

export function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "نامشخص";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
}

const STORAGE_KEY = "pixel-wallpaper-favorites";
const COLLECTIONS_KEY = "pixel-wallpaper-favorite-collections";
const CHANGE_EVENT = "pixelwp:favorites-changed";
const FAVORITES_FORMAT = "pixel-wallpaper-favorites";
const MAX_FAVORITES = 1000;
const MAX_COLLECTIONS = 31;
export type FavoriteCollection = { id: number; name: string; favoriteIds: number[] };
export type FavoriteExport = { favorites: number[]; collections: FavoriteCollection[] };
const validIds = (ids: unknown): number[] => Array.isArray(ids)
  ? [...new Set(ids.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))].slice(0, MAX_FAVORITES)
  : [];
const sanitizeCollections = (input: unknown): FavoriteCollection[] => {
  if (!Array.isArray(input)) return [];
  const result: FavoriteCollection[] = [];
  const seen = new Set<number>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const value = item as { id?: unknown; name?: unknown; favoriteIds?: unknown };
    if (typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id <= 0 || seen.has(value.id) || typeof value.name !== "string") continue;
    const name = value.name.trim().slice(0, 32);
    if (!name) continue;
    seen.add(value.id);
    result.push({ id: value.id, name, favoriteIds: validIds(value.favoriteIds) });
    if (result.length >= MAX_COLLECTIONS) break;
  }
  return result;
};
export function exportFavoritesJson(ids: number[], collections: FavoriteCollection[] = []) {
  return JSON.stringify({ format: FAVORITES_FORMAT, version: 1, exportedAt: new Date().toISOString(), favorites: validIds(ids), collections: sanitizeCollections(collections) }, null, 2);
}
export function parseFavoritesData(text: string): FavoriteExport {
  if (text.length > 1_000_000) throw new Error("حجم فایل بیشتر از حد مجاز است.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("فایل انتخاب‌شده JSON معتبر نیست."); }
  if (!parsed || typeof parsed !== "object" || (parsed as { format?: unknown }).format !== FAVORITES_FORMAT || ![1, 2].includes((parsed as { version?: number }).version ?? 0) || !Array.isArray((parsed as { favorites?: unknown }).favorites)) {
    throw new Error("قالب فایل علاقه‌مندی با این سایت سازگار نیست.");
  }
  const object = parsed as { favorites: unknown[]; collections?: unknown };
  const favorites = validIds(object.favorites);
  if (!favorites.length) throw new Error("فایل شناسهٔ علاقه‌مندیِ معتبری ندارد.");
  return { favorites, collections: sanitizeCollections(object.collections).map(group => ({ ...group, favoriteIds: group.favoriteIds.filter(id => favorites.includes(id)) })) };
}
export function parseFavoritesJson(text: string) { return parseFavoritesData(text).favorites; }
export function readFavorites(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const ids = validIds(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(ids)) localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    return ids;
  } catch { return []; }
}
export function writeFavorites(ids: number[]) {
  const favorites = validIds(ids);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  const groups = readFavoriteCollections();
  const favoriteSet = new Set(favorites);
  const synchronized = [{ id: 1, name: "علاقه‌مندی‌های من", favoriteIds: favorites }, ...groups.filter(group => group.id !== 1).map(group => ({ ...group, favoriteIds: group.favoriteIds.filter(id => favoriteSet.has(id)) }))];
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(synchronized));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}
export function readFavoriteCollections(): FavoriteCollection[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    const parsed = raw === null ? [] : JSON.parse(raw);
    const customGroups = sanitizeCollections(parsed).filter(group => group.id !== 1);
    const groups = [{ id: 1, name: "علاقه‌مندی‌های من", favoriteIds: readFavorites() }, ...customGroups];
    if (JSON.stringify(parsed) !== JSON.stringify(groups)) localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(groups));
    return groups;
  } catch { return [{ id: 1, name: "علاقه‌مندی‌های من", favoriteIds: readFavorites() }]; }
}
export function writeFavoriteCollections(collections: FavoriteCollection[]) {
  const favoriteSet = new Set(readFavorites());
  const customGroups = sanitizeCollections(collections).filter(group => group.id !== 1).map(group => ({ ...group, favoriteIds: group.favoriteIds.filter(id => favoriteSet.has(id)) }));
  const groups = [{ id: 1, name: "علاقه‌مندی‌های من", favoriteIds: [...favoriteSet] }, ...customGroups];
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(groups));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}
export function toggleFavorite(id: number) {
  const current = readFavorites();
  writeFavorites(current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
}
export function useFavorites() {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    const sync = () => setIds(readFavorites());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(CHANGE_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return ids;
}
