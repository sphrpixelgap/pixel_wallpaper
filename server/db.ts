import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { AdminAccount, InsertAdminAccount, InsertUser, InsertWallpaper, InsertWallpaperVariant, InsertWallpaperRequest, User, adminAccounts, adminActivityLogs, adminAuthLimits, adminSessions, clientRequestLimits, users, wallpaperCategories, wallpaperIssueReports, wallpaperLikes, wallpaperRequests, wallpaperVariants, wallpapers, siteSettings, communityWallpaperSubmissions, imageKitCleanupJobs } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { redactWallpaperIssueDetails } from "./privacy";
import { DEFAULT_SITE_SETTINGS, type SiteSettingsValues } from "../shared/site-settings";
import { FULL_ADMIN_PERMISSIONS, NO_ADMIN_PERMISSIONS, type AdminPermissions } from "../shared/admin-permissions";
import {
  CLIENT_RATE_LIMIT_RETENTION_MS,
  getRequestCreationThrottleStatus,
  planFixedWindowAttempt,
  REQUEST_CHECK_LOCK_TTL_MS,
  REQUEST_LOOKUP_LIMIT,
  REQUEST_LOOKUP_WINDOW_MS,
  WALLPAPER_LIKE_LIMIT,
  WALLPAPER_LIKE_WINDOW_MS,
  WALLPAPER_REPORT_LIMIT,
  WALLPAPER_REPORT_WINDOW_MS,
  WALLPAPER_VIEW_LIMIT,
  WALLPAPER_VIEW_WINDOW_MS,
} from "./request-rate-limit";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
async function includeCommunitySubmissionMetadata<T extends { id: number }>(database: Database, items: T[]) {
  if (!items.length) return items.map(item => ({ ...item, communitySubmission: null }));
  const rows = await database.select().from(communityWallpaperSubmissions)
    .where(inArray(communityWallpaperSubmissions.wallpaperId, items.map(item => item.id)));
  const byWallpaperId = new Map(rows.map(row => [row.wallpaperId, row]));
  return items.map(item => ({ ...item, communitySubmission: byWallpaperId.get(item.id) ?? null }));
}

export async function enqueueImageKitCleanup(fileIds: string[], now = new Date()) {
  const uniqueIds = [...new Set(fileIds)];
  if (!uniqueIds.length) return;
  if (uniqueIds.some(fileId => !/^[A-Za-z0-9_-]{1,128}$/.test(fileId))) throw new Error("Invalid ImageKit cleanup file ID.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(imageKitCleanupJobs).values(uniqueIds.map(fileId => ({ fileId, nextAttemptAt: now })))
    .onDuplicateKeyUpdate({ set: { nextAttemptAt: now } });
}

export async function listDueImageKitCleanupJobs(now = new Date(), limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(imageKitCleanupJobs).where(lte(imageKitCleanupJobs.nextAttemptAt, now))
    .orderBy(asc(imageKitCleanupJobs.nextAttemptAt)).limit(Math.min(Math.max(Math.floor(limit), 1), 50));
}

export async function completeImageKitCleanupJob(fileId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(imageKitCleanupJobs).where(eq(imageKitCleanupJobs.fileId, fileId));
}

export async function retryImageKitCleanupJob(fileId: string, nextAttemptAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(imageKitCleanupJobs).set({ attempts: sql`${imageKitCleanupJobs.attempts} + 1`, nextAttemptAt })
    .where(eq(imageKitCleanupJobs.fileId, fileId));
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    values[field] = value ?? null;
    updateSet[field] = value ?? null;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) values.role = user.role;
  if (user.openId === ENV.ownerOpenId && ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export type WallpaperFilters = {
  q?: string; category?: string; resolution?: string; gameTitle?: string;
  targetDevice?: string; mood?: string; dominantColor?: string;
  sort?: "newest" | "popular" | "resolution" | "aspect" | "size"; limit?: number;
};

const COMMON_RESOLUTIONS = ["4K 3840×2160", "QHD 2560×1440", "Full HD 1920×1080", "Ultrawide 3440×1440"];
const SEARCH_ALIAS_GROUPS = [
  ["Elden Ring", "الدن رینگ", "الدنرینگ", "الدن‌ رینگ"],
  ["Fortnite", "فورتنایت", "فورت نایت"],
  ["Minecraft", "ماینکرفت", "ماین کرافت"],
  ["God of War", "گاد آو وار", "گاد اف وار"],
  ["Assassin's Creed", "اساسینز کرید", "اساسینزکرید"],
  ["Grand Theft Auto V", "GTA V", "GTA 5", "جی تی ای ۵", "جی تی ای وی"],
  ["Call of Duty", "کال آو دیوتی", "کالاف دیوتی", "ندای وظیفه"],
  ["Cyberpunk 2077", "سایبرپانک ۲۰۷۷", "سایبرپانک 2077"],
  ["The Witcher 3", "ویچر ۳", "ویچر 3"],
  ["Red Dead Redemption 2", "رد دد ردمپشن ۲", "رد دد ۲"],
  ["Spider-Man", "اسپایدرمن", "اسپایدر من"],
  ["Until Dawn", "آنتیل داون", "آنتیل‌داون"],
];
function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\u064B-\u065F]/g, "").replace(/[\u200c\u200f]/g, " ").replace(/\s+/g, " ").trim();
}
export function expandWallpaperSearchTerms(query: string) {
  const normalized = normalizeSearch(query);
  const group = SEARCH_ALIAS_GROUPS.find(values => values.some(value => normalizeSearch(value) === normalized));
  return [...new Set([normalized, ...(group ?? []).map(normalizeSearch)])].filter(Boolean);
}
export function normalizeWallpaperTitleForDuplicateReview(value: string) {
  return normalizeSearch(value).replace(/(?:wallpaper|والپیپر)\s*[0-9۰-۹٠-٩]+/gi, "").replace(/\s*[-–—]\s*$/, "").replace(/\s+/g, " ").trim();
}

function wallpaperWhere(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, filters: WallpaperFilters = {}) {
  const clauses = [eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published")];
  if (filters.category) clauses.push(eq(wallpapers.category, filters.category));
  if (filters.resolution === "سفارشی") clauses.push(or(
    notInArray(wallpapers.resolution, COMMON_RESOLUTIONS),
    inArray(wallpapers.id, db.select({ wallpaperId: wallpaperVariants.wallpaperId }).from(wallpaperVariants).where(notInArray(wallpaperVariants.resolution, COMMON_RESOLUTIONS))),
  )!);
  else if (filters.resolution) clauses.push(or(
    eq(wallpapers.resolution, filters.resolution),
    inArray(wallpapers.id, db.select({ wallpaperId: wallpaperVariants.wallpaperId }).from(wallpaperVariants).where(eq(wallpaperVariants.resolution, filters.resolution))),
  )!);
  if (filters.gameTitle) clauses.push(eq(wallpapers.gameTitle, filters.gameTitle));
  if (filters.targetDevice) clauses.push(or(
    eq(wallpapers.targetDevice, filters.targetDevice),
    inArray(wallpapers.id, db.select({ wallpaperId: wallpaperVariants.wallpaperId }).from(wallpaperVariants).where(eq(wallpaperVariants.targetDevice, filters.targetDevice))),
  )!);
  if (filters.mood) clauses.push(eq(wallpapers.mood, filters.mood));
  if (filters.dominantColor) clauses.push(eq(wallpapers.dominantColor, filters.dominantColor));
  if (filters.q?.trim()) {
    const terms = expandWallpaperSearchTerms(filters.q).map(term => `%${term.replace(/[\\%_]/g, "\\$&")}%`);
    clauses.push(or(...terms.map(needle => or(
      like(sql`LOWER(${wallpapers.title})`, needle), like(sql`LOWER(${wallpapers.category})`, needle),
      like(sql`LOWER(${wallpapers.description})`, needle), like(sql`LOWER(${wallpapers.gameTitle})`, needle),
      like(sql`LOWER(${wallpapers.tags})`, needle),
    )!))!);
  }
  return and(...clauses);
}

export async function listWallpapers(filters: WallpaperFilters = {}) {
  const db = await getDb();
  if (!db) return [];
  const ordering = filters.sort === "popular" ? [desc(wallpapers.viewCount), desc(wallpapers.downloadCount), desc(wallpapers.createdAt), desc(wallpapers.id)] as const
    : filters.sort === "resolution" ? [desc(sql`coalesce(${wallpapers.width}, 0) * coalesce(${wallpapers.height}, 0)`), desc(wallpapers.createdAt)] as const
    : filters.sort === "aspect" ? [desc(sql`coalesce(${wallpapers.width}, 0) / nullif(${wallpapers.height}, 0)`), desc(wallpapers.createdAt)] as const
    : filters.sort === "size" ? [desc(wallpapers.fileSize), desc(wallpapers.createdAt)] as const
    : [desc(wallpapers.createdAt)] as const;
  return db.select().from(wallpapers).where(wallpaperWhere(db, filters)).orderBy(...ordering).limit(Math.min(Math.max(filters.limit ?? 120, 1), 120));
}

export async function listWallpapersPage(filters: WallpaperFilters, page: number, pageSize = 24) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page, pageSize };
  const where = wallpaperWhere(db, filters);
  const ordering = filters.sort === "popular" ? [desc(wallpapers.viewCount), desc(wallpapers.downloadCount), desc(wallpapers.createdAt), desc(wallpapers.id)] as const
    : filters.sort === "resolution" ? [desc(sql`coalesce(${wallpapers.width}, 0) * coalesce(${wallpapers.height}, 0)`), desc(wallpapers.createdAt), desc(wallpapers.id)] as const
    : filters.sort === "aspect" ? [desc(sql`coalesce(${wallpapers.width}, 0) / nullif(${wallpapers.height}, 0)`), desc(wallpapers.createdAt), desc(wallpapers.id)] as const
    : filters.sort === "size" ? [desc(wallpapers.fileSize), desc(wallpapers.createdAt), desc(wallpapers.id)] as const
    : [desc(wallpapers.createdAt), desc(wallpapers.id)] as const;
  const [items, totals] = await Promise.all([
    db.select().from(wallpapers).where(where).orderBy(...ordering).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(wallpapers).where(where),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0), page, pageSize };
}

export async function getRandomWallpaper() {
  const db = await getDb();
  if (!db) return null;
  const publicWhere = and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"));
  const totals = await db.select({ total: count() }).from(wallpapers).where(publicWhere);
  const total = Number(totals[0]?.total ?? 0);
  if (!total) return null;
  const offset = Math.floor(Math.random() * total);
  return (await db.select().from(wallpapers).where(publicWhere).orderBy(asc(wallpapers.id)).limit(1).offset(offset))[0] ?? null;
}

export async function getDailyWallpaper(day: string) {
  const db = await getDb();
  if (!db) return null;
  const publicWhere = and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"));
  const totals = await db.select({ total: count() }).from(wallpapers).where(publicWhere);
  const total = Number(totals[0]?.total ?? 0);
  if (!total) return null;
  let hash = 2166136261;
  for (const char of day) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const offset = (hash >>> 0) % total;
  return (await db.select().from(wallpapers).where(publicWhere).orderBy(asc(wallpapers.id)).limit(1).offset(offset))[0] ?? null;
}

export async function listWallpapersByIds(ids: number[]) {
  const db = await getDb();
  const uniqueIds = [...new Set(ids)].slice(0, 1000);
  if (!db || !uniqueIds.length) return [];
  return db.select().from(wallpapers).where(and(inArray(wallpapers.id, uniqueIds), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published")));
}

export async function listAdminWallpapers() {
  const db = await getDb();
  if (!db) return [];
  const [items, variantRows] = await Promise.all([
    db.select().from(wallpapers).orderBy(desc(wallpapers.createdAt)),
    db.select({ id: wallpaperVariants.id, wallpaperId: wallpaperVariants.wallpaperId, imageKey: wallpaperVariants.imageKey, resolution: wallpaperVariants.resolution, targetDevice: wallpaperVariants.targetDevice, width: wallpaperVariants.width, height: wallpaperVariants.height, fileSize: wallpaperVariants.fileSize }).from(wallpaperVariants),
  ]);
  const primaryKeys = new Map(items.map(item => [item.id, item.imageKey]));
  const extras = new Map<number, { id: number; resolution: string; targetDevice: string; width: number; height: number; fileSize: number | null }[]>();
  for (const variant of variantRows) if (primaryKeys.get(variant.wallpaperId) !== variant.imageKey) {
    const list = extras.get(variant.wallpaperId) ?? [];
    list.push({ id: variant.id, resolution: variant.resolution, targetDevice: variant.targetDevice, width: variant.width, height: variant.height, fileSize: variant.fileSize });
    extras.set(variant.wallpaperId, list);
  }
  const enriched = await includeCommunitySubmissionMetadata(db, items);
  return enriched.map(item => { const extraVariants = extras.get(item.id) ?? []; return { ...item, extraVariants, extraVariantCount: extraVariants.length }; });
}

export async function listAdminWallpapersPage(input: { page: number; pageSize: number; q?: string; category?: string; state?: "all" | "active" | "archived" | "pending" | "draft" | "published" }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, activeCount: 0 };
  const clauses: SQL[] = [];
  if (input.q?.trim()) {
    const needle = `%${input.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push(or(like(wallpapers.title, needle), like(wallpapers.gameTitle, needle), like(wallpapers.tags, needle))!);
  }
  if (input.category) clauses.push(eq(wallpapers.category, input.category));
  if (input.state === "active" || input.state === "published") clauses.push(and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"))!);
  if (input.state === "archived") clauses.push(eq(wallpapers.isArchived, 1));
  if (input.state === "pending") clauses.push(and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "pending"))!);
  if (input.state === "draft") clauses.push(and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "draft"))!);
  const where = clauses.length ? and(...clauses) : undefined;
  const [items, totals, activeTotals] = await Promise.all([
    db.select().from(wallpapers).where(where).orderBy(desc(wallpapers.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(wallpapers).where(where),
    db.select({ total: count() }).from(wallpapers).where(and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"))),
  ]);
  const ids = items.map(item => item.id);
  const variantRows = ids.length ? await db.select({ id: wallpaperVariants.id, wallpaperId: wallpaperVariants.wallpaperId, imageKey: wallpaperVariants.imageKey, resolution: wallpaperVariants.resolution, targetDevice: wallpaperVariants.targetDevice, width: wallpaperVariants.width, height: wallpaperVariants.height, fileSize: wallpaperVariants.fileSize }).from(wallpaperVariants).where(inArray(wallpaperVariants.wallpaperId, ids)) : [];
  const primaryKeys = new Map(items.map(item => [item.id, item.imageKey]));
  const extras = new Map<number, { id: number; resolution: string; targetDevice: string; width: number; height: number; fileSize: number | null }[]>();
  for (const variant of variantRows) if (primaryKeys.get(variant.wallpaperId) !== variant.imageKey) {
    const list = extras.get(variant.wallpaperId) ?? [];
    list.push({ id: variant.id, resolution: variant.resolution, targetDevice: variant.targetDevice, width: variant.width, height: variant.height, fileSize: variant.fileSize });
    extras.set(variant.wallpaperId, list);
  }
  const enriched = await includeCommunitySubmissionMetadata(db, items);
  return { items: enriched.map(item => { const extraVariants = extras.get(item.id) ?? []; return { ...item, extraVariants, extraVariantCount: extraVariants.length }; }), total: Number(totals[0]?.total ?? 0), activeCount: Number(activeTotals[0]?.total ?? 0) };
}

export async function getAdminOverview() {
  const db = await getDb();
  if (!db) return { wallpapers: { total: 0, active: 0, archived: 0, pending: 0, draft: 0 }, requests: { total: 0, new: 0 }, users: 0, categories: 0 };
  const [wallpaperStates, requestStates, userCount, categoryCount] = await Promise.all([
    db.select({ archived: wallpapers.isArchived, publicationStatus: wallpapers.publicationStatus, total: count() }).from(wallpapers).groupBy(wallpapers.isArchived, wallpapers.publicationStatus),
    db.select({ status: wallpaperRequests.status, total: count() }).from(wallpaperRequests).groupBy(wallpaperRequests.status),
    db.select({ total: count() }).from(users),
    db.select({ total: count() }).from(wallpaperCategories),
  ]);
  const active = wallpaperStates.filter(row => row.archived === 0 && row.publicationStatus === "published").reduce((sum, row) => sum + Number(row.total), 0);
  const archived = wallpaperStates.filter(row => row.archived !== 0).reduce((sum, row) => sum + Number(row.total), 0);
  const pending = wallpaperStates.filter(row => row.archived === 0 && row.publicationStatus === "pending").reduce((sum, row) => sum + Number(row.total), 0);
  const draft = wallpaperStates.filter(row => row.archived === 0 && row.publicationStatus === "draft").reduce((sum, row) => sum + Number(row.total), 0);
  const newRequests = Number(requestStates.find(row => row.status === "new")?.total ?? 0);
  return {
    wallpapers: { total: wallpaperStates.reduce((sum, row) => sum + Number(row.total), 0), active, archived, pending, draft },
    requests: { total: requestStates.reduce((sum, row) => sum + Number(row.total), 0), new: newRequests },
    users: Number(userCount[0]?.total ?? 0),
    categories: Number(categoryCount[0]?.total ?? 0),
  };
}

export async function bulkUpdateWallpapers(ids: number[], operation: { type: "setCategory"; value: string } | { type: "setGameTitle" | "setTags"; value: string } | { type: "archive" | "restore" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  if (!uniqueIds.length) return { updated: 0 };
  if (operation.type === "setCategory") {
    const category = (await db.select({ id: wallpaperCategories.id }).from(wallpaperCategories).where(eq(wallpaperCategories.name, operation.value)).limit(1))[0];
    if (!category) throw new Error("دسته‌بندی مقصد پیدا نشد.");
  }
  const values = operation.type === "setCategory" ? { category: operation.value }
    : operation.type === "setGameTitle" ? { gameTitle: operation.value.trim() || null }
    : operation.type === "setTags" ? { tags: operation.value.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 30).join(", ") || null }
    : operation.type === "archive" ? { isArchived: 1 }
    : { isArchived: 0 };
  const stateFilter = operation.type === "archive" ? eq(wallpapers.isArchived, 0) : operation.type === "restore" ? eq(wallpapers.isArchived, 1) : undefined;
  const result = await db.update(wallpapers).set(values).where(and(inArray(wallpapers.id, uniqueIds), ...(stateFilter ? [stateFilter] : [])));
  return { updated: Number(result[0].affectedRows ?? 0) };
}

export async function listPossibleWallpaperDuplicates() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: wallpapers.id, title: wallpapers.title, gameTitle: wallpapers.gameTitle, category: wallpapers.category, width: wallpapers.width, height: wallpapers.height, fileSize: wallpapers.fileSize, imageKey: wallpapers.imageKey, imageUrl: wallpapers.imageUrl, thumbnailKey: wallpapers.thumbnailKey, thumbnailUrl: wallpapers.thumbnailUrl, publicationStatus: wallpapers.publicationStatus }).from(wallpapers).where(eq(wallpapers.isArchived, 0)).orderBy(desc(wallpapers.createdAt)).limit(5000);
  const enrichedRows = await includeCommunitySubmissionMetadata(db, rows);
  const groups = new Map<string, typeof enrichedRows>();
  for (const row of enrichedRows) {
    const title = normalizeWallpaperTitleForDuplicateReview(row.title);
    if (!title || !row.width || !row.height) continue;
    const key = [normalizeSearch(row.gameTitle ?? ""), title, row.width, row.height, row.fileSize].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.length > 1).slice(0, 40);
}

export async function listGames() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ gameTitle: wallpapers.gameTitle, wallpaperCount: count() }).from(wallpapers)
    .where(and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"), isNotNull(wallpapers.gameTitle)))
    .groupBy(wallpapers.gameTitle).orderBy(desc(count()), asc(wallpapers.gameTitle));
}

export async function getSitemapWallpapers() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({ id: wallpapers.id, title: wallpapers.title, gameTitle: wallpapers.gameTitle, updatedAt: wallpapers.updatedAt, imageUrl: wallpapers.imageUrl, thumbnailUrl: wallpapers.thumbnailUrl })
    .from(wallpapers).where(and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"))).orderBy(asc(wallpapers.id));
}

export async function listSuggestions(q: string) {
  const candidates = await listWallpapers({ q, sort: "popular", limit: 24 });
  const seen = new Set<string>();
  const suggestions: { label: string; type: "wallpaper" | "game" | "tag" }[] = [];
  const terms = expandWallpaperSearchTerms(q);
  const add = (label: string | null | undefined, type: "wallpaper" | "game" | "tag") => {
    const value = label?.trim();
    if (!value || seen.has(value.toLocaleLowerCase()) || !terms.some(term => normalizeSearch(value).includes(term))) return;
    seen.add(value.toLocaleLowerCase()); suggestions.push({ label: value, type });
  };
  for (const row of candidates) {
    add(row.gameTitle, "game"); add(row.title, "wallpaper");
    for (const tag of (row.tags ?? "").split(",")) add(tag, "tag");
    if (suggestions.length >= 10) break;
  }
  return suggestions.slice(0, 10);
}

export async function listWallpaperVariants(wallpaperId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(wallpaperVariants).where(eq(wallpaperVariants.wallpaperId, wallpaperId)).orderBy(desc(wallpaperVariants.width));
}

export async function getWallpaperById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(wallpapers).where(and(eq(wallpapers.id, id), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"))).limit(1);
  if (!result[0]) return undefined;
  return { ...result[0], variants: await listWallpaperVariants(id) };
}

export async function getWallpaperDownloadTarget(id: number, variantId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const wallpaper = (await db.select({ title: wallpapers.title, imageKey: wallpapers.imageKey, imageMime: wallpapers.imageMime, resolution: wallpapers.resolution })
    .from(wallpapers).where(and(eq(wallpapers.id, id), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"))).limit(1))[0];
  if (!wallpaper) return undefined;
  if (variantId === undefined) return wallpaper;
  const variant = (await db.select({ imageKey: wallpaperVariants.imageKey, imageMime: wallpaperVariants.imageMime, resolution: wallpaperVariants.resolution })
    .from(wallpaperVariants).where(and(eq(wallpaperVariants.id, variantId), eq(wallpaperVariants.wallpaperId, id))).limit(1))[0];
  return variant ? { ...wallpaper, ...variant } : undefined;
}

export async function createWallpaper(input: InsertWallpaper, variants: Omit<InsertWallpaperVariant, "wallpaperId">[] = [], publicationStatus: "draft" | "pending" = "pending") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(wallpapers).values({ ...input, publicationStatus });
  const id = Number(result[0].insertId);
  if (variants.length) {
    const primaryDevice = input.targetDevice ?? "desktop";
    const unique = new Map<string, typeof variants[number]>();
    for (const variant of variants) if (variant.resolution !== input.resolution || variant.targetDevice !== primaryDevice) unique.set(`${variant.resolution}|${variant.targetDevice}`, variant);
    if (unique.size) await db.insert(wallpaperVariants).values([...unique.values()].map(variant => ({ ...variant, wallpaperId: id })));
  }
  return id;
}

export async function createCommunityWallpaper(input: InsertWallpaper, submission: {
  privateImageFileId: string;
  privateThumbnailFileId: string;
  sourceUrl: string | null;
  rightsConfirmedAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const result = await tx.insert(wallpapers).values({ ...input, publicationStatus: "pending" });
    const id = Number(result[0].insertId);
    await tx.insert(communityWallpaperSubmissions).values({ ...submission, wallpaperId: id });
    return id;
  });
}

export async function updateWallpaper(
  id: number,
  input: Partial<Omit<InsertWallpaper, "id" | "createdAt">> & { imageFileId?: string | null; thumbnailFileId?: string | null },
  variants: Omit<InsertWallpaperVariant, "wallpaperId">[] = [],
  replaceVariants = false,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const [before] = await tx.select({ imageKey: wallpapers.imageKey, imageFileId: wallpapers.imageFileId, thumbnailKey: wallpapers.thumbnailKey, thumbnailFileId: wallpapers.thumbnailFileId })
      .from(wallpapers).where(eq(wallpapers.id, id)).limit(1);
    const detachedFileIds: string[] = [];
    const [submission] = await tx.select({
      privateImageFileId: communityWallpaperSubmissions.privateImageFileId,
      privateThumbnailFileId: communityWallpaperSubmissions.privateThumbnailFileId,
      publicImageFileId: communityWallpaperSubmissions.publicImageFileId,
      publicThumbnailFileId: communityWallpaperSubmissions.publicThumbnailFileId,
    }).from(communityWallpaperSubmissions).where(eq(communityWallpaperSubmissions.wallpaperId, id)).limit(1);
    const replaceImage = Boolean(input.imageKey !== undefined && input.imageKey !== before?.imageKey) ||
      Boolean(input.imageFileId !== undefined && input.imageFileId !== (before?.imageFileId ?? null));
    const replaceThumbnail = Boolean(input.thumbnailKey !== undefined && input.thumbnailKey !== before?.thumbnailKey) ||
      Boolean(input.thumbnailFileId !== undefined && input.thumbnailFileId !== (before?.thumbnailFileId ?? null));
    if (replaceImage && before?.imageFileId && input.imageFileId !== before.imageFileId) detachedFileIds.push(before.imageFileId);
    if (replaceThumbnail && before?.thumbnailFileId && input.thumbnailFileId !== before.thumbnailFileId) detachedFileIds.push(before.thumbnailFileId);
    if (submission && (replaceImage || replaceThumbnail)) {
      if (replaceImage && submission.privateImageFileId) detachedFileIds.push(submission.privateImageFileId);
      if (replaceImage && submission.publicImageFileId && input.imageFileId !== submission.publicImageFileId) detachedFileIds.push(submission.publicImageFileId);
      if (replaceThumbnail && submission.privateThumbnailFileId) detachedFileIds.push(submission.privateThumbnailFileId);
      if (replaceThumbnail && submission.publicThumbnailFileId && input.thumbnailFileId !== submission.publicThumbnailFileId) detachedFileIds.push(submission.publicThumbnailFileId);
      await tx.update(communityWallpaperSubmissions).set({
        ...(replaceImage ? { privateImageFileId: null, publicImageFileId: input.imageFileId ?? null } : {}),
        ...(replaceThumbnail ? { privateThumbnailFileId: null, publicThumbnailFileId: input.thumbnailFileId ?? null } : {}),
      }).where(eq(communityWallpaperSubmissions.wallpaperId, id));
    }
    if (detachedFileIds.length) await tx.insert(imageKitCleanupJobs).values([...new Set(detachedFileIds)].map(fileId => ({ fileId, nextAttemptAt: new Date() })))
      .onDuplicateKeyUpdate({ set: { nextAttemptAt: new Date() } });
    const wallpaperInput = { ...input };
    if (replaceImage && wallpaperInput.imageFileId === undefined) wallpaperInput.imageFileId = null;
    if (replaceThumbnail && wallpaperInput.thumbnailFileId === undefined) wallpaperInput.thumbnailFileId = null;
    await tx.update(wallpapers).set(wallpaperInput).where(eq(wallpapers.id, id));
    if (replaceVariants) await tx.delete(wallpaperVariants).where(eq(wallpaperVariants.wallpaperId, id));
    const primary = (await tx.select({ imageKey: wallpapers.imageKey, resolution: wallpapers.resolution, targetDevice: wallpapers.targetDevice, width: wallpapers.width, height: wallpapers.height, imageUrl: wallpapers.imageUrl, imageMime: wallpapers.imageMime, fileSize: wallpapers.fileSize }).from(wallpapers).where(eq(wallpapers.id, id)).limit(1))[0];
    if (primary && !replaceVariants) {
      await tx.update(wallpaperVariants).set({ resolution: primary.resolution, targetDevice: primary.targetDevice, ...(primary.width === null ? {} : { width: primary.width }), ...(primary.height === null ? {} : { height: primary.height }), imageUrl: primary.imageUrl, imageMime: primary.imageMime, fileSize: primary.fileSize }).where(and(eq(wallpaperVariants.wallpaperId, id), eq(wallpaperVariants.imageKey, primary.imageKey)));
      await tx.delete(wallpaperVariants).where(and(eq(wallpaperVariants.wallpaperId, id), eq(wallpaperVariants.resolution, primary.resolution), eq(wallpaperVariants.targetDevice, primary.targetDevice), sql`${wallpaperVariants.imageKey} <> ${primary.imageKey}`));
    }
    if (variants.length) {
      const unique = new Map<string, typeof variants[number]>();
      for (const variant of variants) if (!primary || variant.resolution !== primary.resolution || variant.targetDevice !== primary.targetDevice) unique.set(`${variant.resolution}|${variant.targetDevice}`, variant);
      for (const variant of unique.values()) {
        await tx.delete(wallpaperVariants).where(and(
          eq(wallpaperVariants.wallpaperId, id),
          eq(wallpaperVariants.resolution, variant.resolution),
          eq(wallpaperVariants.targetDevice, variant.targetDevice),
          sql`${wallpaperVariants.imageKey} <> ${primary?.imageKey ?? ""}`,
        ));
        await tx.insert(wallpaperVariants).values({ ...variant, wallpaperId: id });
      }
    }
    return detachedFileIds;
  });
}

export async function archiveWallpaper(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(wallpapers).set({ isArchived: 1 }).where(eq(wallpapers.id, id));
}

export async function setWallpaperPublicationStatus(id: number, status: "draft" | "pending" | "published") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const expectedStatus = status === "pending" ? "draft" : "pending";
  const result = await db.update(wallpapers).set({ publicationStatus: status }).where(and(eq(wallpapers.id, id), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, expectedStatus)));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}

export async function getCommunityWallpaperSubmission(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return (await db.select().from(communityWallpaperSubmissions).where(eq(communityWallpaperSubmissions.wallpaperId, id)).limit(1))[0] ?? null;
}

export async function publishCommunityWallpaperWithAssets(id: number, assets: {
  imageKey?: string;
  imageUrl?: string;
  imageFileId?: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  thumbnailFileId?: string;
}, expected: { imageKey: string; imageUrl: string; thumbnailKey: string | null; thumbnailUrl: string | null; privateImageFileId: string | null; privateThumbnailFileId: string | null; publicImageFileId: string | null; publicThumbnailFileId: string | null }, now: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const [submission] = await tx.select({
      privateImageFileId: communityWallpaperSubmissions.privateImageFileId,
      privateThumbnailFileId: communityWallpaperSubmissions.privateThumbnailFileId,
      publicImageFileId: communityWallpaperSubmissions.publicImageFileId,
      publicThumbnailFileId: communityWallpaperSubmissions.publicThumbnailFileId,
    })
      .from(communityWallpaperSubmissions).where(eq(communityWallpaperSubmissions.wallpaperId, id)).limit(1);
    if (!submission || (submission.privateImageFileId ?? null) !== expected.privateImageFileId ||
        (submission.privateThumbnailFileId ?? null) !== expected.privateThumbnailFileId ||
        (submission.publicImageFileId ?? null) !== expected.publicImageFileId ||
        (submission.publicThumbnailFileId ?? null) !== expected.publicThumbnailFileId) return false;
    const result = await tx.update(wallpapers).set({ ...assets, publicationStatus: "published", updatedAt: now })
      .where(and(
        eq(wallpapers.id, id), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "pending"),
        eq(wallpapers.imageKey, expected.imageKey),
        eq(wallpapers.imageUrl, expected.imageUrl),
        expected.thumbnailKey === null ? isNull(wallpapers.thumbnailKey) : eq(wallpapers.thumbnailKey, expected.thumbnailKey),
        expected.thumbnailUrl === null ? isNull(wallpapers.thumbnailUrl) : eq(wallpapers.thumbnailUrl, expected.thumbnailUrl),
      ));
    if (Number(result[0]?.affectedRows ?? 0) !== 1) return false;
    const metadataResult = await tx.update(communityWallpaperSubmissions).set({
      privateImageFileId: null,
      privateThumbnailFileId: null,
      publicImageFileId: assets.imageFileId ?? expected.publicImageFileId,
      publicThumbnailFileId: assets.thumbnailFileId ?? expected.publicThumbnailFileId,
      promotedAt: now,
    })
      .where(and(
        eq(communityWallpaperSubmissions.wallpaperId, id),
        expected.privateImageFileId === null ? isNull(communityWallpaperSubmissions.privateImageFileId) : eq(communityWallpaperSubmissions.privateImageFileId, expected.privateImageFileId),
        expected.privateThumbnailFileId === null ? isNull(communityWallpaperSubmissions.privateThumbnailFileId) : eq(communityWallpaperSubmissions.privateThumbnailFileId, expected.privateThumbnailFileId),
        expected.publicImageFileId === null ? isNull(communityWallpaperSubmissions.publicImageFileId) : eq(communityWallpaperSubmissions.publicImageFileId, expected.publicImageFileId),
        expected.publicThumbnailFileId === null ? isNull(communityWallpaperSubmissions.publicThumbnailFileId) : eq(communityWallpaperSubmissions.publicThumbnailFileId, expected.publicThumbnailFileId),
      ));
    if (Number(metadataResult[0]?.affectedRows ?? 0) !== 1) throw new Error("Community submission changed during publication.");
    const stagedFileIds = [expected.privateImageFileId, expected.privateThumbnailFileId].filter((fileId): fileId is string => Boolean(fileId));
    if (stagedFileIds.length) await tx.insert(imageKitCleanupJobs).values([...new Set(stagedFileIds)].map(fileId => ({ fileId, nextAttemptAt: now })))
      .onDuplicateKeyUpdate({ set: { nextAttemptAt: now } });
    return true;
  });
}

export async function recordWallpaperDownload(id: number, variantId?: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(wallpapers).set({ downloadCount: sql`${wallpapers.downloadCount} + 1` }).where(and(eq(wallpapers.id, id), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published")));
  if (variantId) await db.update(wallpaperVariants).set({ downloadCount: sql`${wallpaperVariants.downloadCount} + 1` }).where(and(eq(wallpaperVariants.id, variantId), eq(wallpaperVariants.wallpaperId, id)));
}

export async function recordWallpaperView(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(wallpapers).set({ viewCount: sql`${wallpapers.viewCount} + 1` }).where(and(eq(wallpapers.id, id), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published")));
}

export async function createWallpaperRequest(input: Omit<InsertWallpaperRequest, "id" | "status" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(wallpaperRequests).values(input);
  return Number(result[0].insertId);
}

async function ensureClientRequestLimitRow(clientHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(clientRequestLimits).values({ clientHash }).onDuplicateKeyUpdate({ set: { clientHash } });
  return db;
}

async function pruneOldClientRequestLimitRows(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, now: Date) {
  if (Math.random() >= 0.01) return;
  try {
    const cutoff = new Date(now.getTime() - CLIENT_RATE_LIMIT_RETENTION_MS);
    await db.delete(clientRequestLimits).where(lt(clientRequestLimits.updatedAt, cutoff));
  } catch (error) {
    console.warn(`[RequestRateLimit] Cleanup failed (${error instanceof Error ? error.name : "UnknownError"}).`);
  }
}

export async function claimWallpaperRequestCheck(clientHash: string, lockToken: string, now: Date) {
  const db = await ensureClientRequestLimitRow(clientHash);
  const [row] = await db.select({
    lastAiCheckAt: clientRequestLimits.lastAiCheckAt,
    lastSubmittedAt: clientRequestLimits.lastSubmittedAt,
    checkLockExpiresAt: clientRequestLimits.checkLockExpiresAt,
  }).from(clientRequestLimits).where(eq(clientRequestLimits.clientHash, clientHash)).limit(1);
  if (!row) throw new Error("Request throttle row could not be loaded");

  const status = getRequestCreationThrottleStatus(row, now);
  if (status !== "allowed") return status;

  const result = await db.update(clientRequestLimits).set({
    lastAiCheckAt: now,
    checkLockToken: lockToken,
    checkLockExpiresAt: new Date(now.getTime() + REQUEST_CHECK_LOCK_TTL_MS),
    updatedAt: now,
  }).where(and(
    eq(clientRequestLimits.clientHash, clientHash),
    row.lastAiCheckAt ? eq(clientRequestLimits.lastAiCheckAt, row.lastAiCheckAt) : isNull(clientRequestLimits.lastAiCheckAt),
    row.lastSubmittedAt ? eq(clientRequestLimits.lastSubmittedAt, row.lastSubmittedAt) : isNull(clientRequestLimits.lastSubmittedAt),
    row.checkLockExpiresAt ? eq(clientRequestLimits.checkLockExpiresAt, row.checkLockExpiresAt) : isNull(clientRequestLimits.checkLockExpiresAt),
  ));
  if (Number(result[0]?.affectedRows ?? 0) !== 1) return "race_lost" as const;
  await pruneOldClientRequestLimitRows(db, now);
  return "claimed" as const;
}

export async function createWallpaperRequestWithActiveCheckLock(
  input: Omit<InsertWallpaperRequest, "id" | "status" | "createdAt" | "updatedAt">,
  clientHash: string,
  lockToken: string,
  now: Date,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const renewed = await tx.update(clientRequestLimits).set({
      checkLockExpiresAt: new Date(now.getTime() + REQUEST_CHECK_LOCK_TTL_MS),
      updatedAt: now,
    }).where(and(
      eq(clientRequestLimits.clientHash, clientHash),
      eq(clientRequestLimits.checkLockToken, lockToken),
      gt(clientRequestLimits.checkLockExpiresAt, now),
    ));
    if (Number(renewed[0]?.affectedRows ?? 0) !== 1) return null;

    const inserted = await tx.insert(wallpaperRequests).values(input);
    const completed = await tx.update(clientRequestLimits).set({
      lastSubmittedAt: now,
      checkLockToken: null,
      checkLockExpiresAt: null,
      updatedAt: now,
    }).where(and(
      eq(clientRequestLimits.clientHash, clientHash),
      eq(clientRequestLimits.checkLockToken, lockToken),
    ));
    if (Number(completed[0]?.affectedRows ?? 0) !== 1) {
      throw new Error("Request throttle lock changed during submission transaction");
    }
    return Number(inserted[0].insertId);
  });
}

export async function releaseWallpaperRequestCheck(clientHash: string, lockToken: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(clientRequestLimits).set({ checkLockToken: null, checkLockExpiresAt: null }).where(and(
    eq(clientRequestLimits.clientHash, clientHash),
    eq(clientRequestLimits.checkLockToken, lockToken),
  ));
}

async function consumeClientRateWindow(clientHash: string, now: Date, bucket: "lookup" | "view" | "report" | "like") {
  const db = await ensureClientRequestLimitRow(clientHash);
  const windowColumn = bucket === "lookup" ? clientRequestLimits.lookupWindowStartedAt : bucket === "view" ? clientRequestLimits.viewWindowStartedAt : bucket === "report" ? clientRequestLimits.reportWindowStartedAt : clientRequestLimits.likeWindowStartedAt;
  const countColumn = bucket === "lookup" ? clientRequestLimits.lookupAttemptCount : bucket === "view" ? clientRequestLimits.viewAttemptCount : bucket === "report" ? clientRequestLimits.reportAttemptCount : clientRequestLimits.likeAttemptCount;
  const windowMs = bucket === "lookup" ? REQUEST_LOOKUP_WINDOW_MS : bucket === "view" ? WALLPAPER_VIEW_WINDOW_MS : bucket === "report" ? WALLPAPER_REPORT_WINDOW_MS : WALLPAPER_LIKE_WINDOW_MS;
  const limit = bucket === "lookup" ? REQUEST_LOOKUP_LIMIT : bucket === "view" ? WALLPAPER_VIEW_LIMIT : bucket === "report" ? WALLPAPER_REPORT_LIMIT : WALLPAPER_LIKE_LIMIT;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [snapshot] = await db.select({ windowStartedAt: windowColumn, attemptCount: countColumn })
      .from(clientRequestLimits).where(eq(clientRequestLimits.clientHash, clientHash)).limit(1);
    if (!snapshot) continue;

    const next = planFixedWindowAttempt(snapshot.windowStartedAt, snapshot.attemptCount, now, windowMs, limit);
    if (!next.allowed) return false;
    const windowCondition = snapshot.windowStartedAt
      ? eq(windowColumn, snapshot.windowStartedAt)
      : isNull(windowColumn);
    const values = bucket === "lookup"
      ? { lookupWindowStartedAt: next.windowStartedAt, lookupAttemptCount: next.attemptCount, updatedAt: now }
      : bucket === "view"
        ? { viewWindowStartedAt: next.windowStartedAt, viewAttemptCount: next.attemptCount, updatedAt: now }
        : bucket === "report"
          ? { reportWindowStartedAt: next.windowStartedAt, reportAttemptCount: next.attemptCount, updatedAt: now }
          : { likeWindowStartedAt: next.windowStartedAt, likeAttemptCount: next.attemptCount, updatedAt: now };
    const result = await db.update(clientRequestLimits).set(values).where(and(
      eq(clientRequestLimits.clientHash, clientHash),
      windowCondition,
      eq(countColumn, snapshot.attemptCount),
    ));
    if (Number(result[0]?.affectedRows ?? 0) > 0) {
      await pruneOldClientRequestLimitRows(db, now);
      return true;
    }
  }
  return false;
}

export async function consumeRequestLookupAttempt(clientHash: string, now: Date) {
  return consumeClientRateWindow(clientHash, now, "lookup");
}

export async function consumeWallpaperViewAttempt(clientHash: string, now: Date) {
  return consumeClientRateWindow(clientHash, now, "view");
}

export async function consumeWallpaperReportAttempt(clientHash: string, now: Date) {
  return consumeClientRateWindow(clientHash, now, "report");
}

export async function consumeWallpaperLikeAttempt(clientHash: string, now: Date) {
  return consumeClientRateWindow(clientHash, now, "like");
}

export async function getPublicRequestStatus(trackingCode: string) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select({ status: wallpaperRequests.status, createdAt: wallpaperRequests.createdAt }).from(wallpaperRequests).where(eq(wallpaperRequests.trackingCode, trackingCode)).limit(1))[0] ?? null;
}

export async function listWallpaperRequests(page = 1, pageSize = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const [items, totals] = await Promise.all([
    db.select().from(wallpaperRequests).orderBy(desc(wallpaperRequests.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(wallpaperRequests),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0) };
}

export async function updateWallpaperRequestStatus(id: number, status: "new" | "reviewed" | "completed") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(wallpaperRequests).set({ status }).where(eq(wallpaperRequests.id, id));
}

export async function deleteWallpaperPermanently(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const [wallpaper] = await tx.select({ imageFileId: wallpapers.imageFileId, thumbnailFileId: wallpapers.thumbnailFileId })
      .from(wallpapers).where(eq(wallpapers.id, id)).limit(1);
    const [submission] = await tx.select({
      privateImageFileId: communityWallpaperSubmissions.privateImageFileId,
      privateThumbnailFileId: communityWallpaperSubmissions.privateThumbnailFileId,
      publicImageFileId: communityWallpaperSubmissions.publicImageFileId,
      publicThumbnailFileId: communityWallpaperSubmissions.publicThumbnailFileId,
    })
      .from(communityWallpaperSubmissions).where(eq(communityWallpaperSubmissions.wallpaperId, id)).limit(1);
    const fileIds = [wallpaper?.imageFileId, wallpaper?.thumbnailFileId, submission?.privateImageFileId, submission?.privateThumbnailFileId, submission?.publicImageFileId, submission?.publicThumbnailFileId].filter((fileId): fileId is string => Boolean(fileId));
    if (fileIds.length) await tx.insert(imageKitCleanupJobs).values([...new Set(fileIds)].map(fileId => ({ fileId, nextAttemptAt: new Date() })))
      .onDuplicateKeyUpdate({ set: { nextAttemptAt: new Date() } });
    await tx.delete(wallpaperVariants).where(eq(wallpaperVariants.wallpaperId, id));
    await tx.delete(wallpapers).where(eq(wallpapers.id, id));
  });
}

export async function deleteExtraWallpaperVariants(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const primary = (await tx.select({ imageKey: wallpapers.imageKey }).from(wallpapers).where(eq(wallpapers.id, id)).limit(1))[0];
    if (!primary) throw new Error("والپیپر پیدا نشد.");
    await tx.delete(wallpaperVariants).where(and(
      eq(wallpaperVariants.wallpaperId, id),
      sql`${wallpaperVariants.imageKey} <> ${primary.imageKey}`,
    ));
  });
}

export async function deleteWallpaperVariant(wallpaperId: number, variantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const [wallpaper] = await tx.select({ imageKey: wallpapers.imageKey }).from(wallpapers).where(eq(wallpapers.id, wallpaperId)).limit(1);
    const [variant] = await tx.select({ id: wallpaperVariants.id, wallpaperId: wallpaperVariants.wallpaperId, imageKey: wallpaperVariants.imageKey }).from(wallpaperVariants).where(eq(wallpaperVariants.id, variantId)).limit(1);
    if (!wallpaper || !variant || variant.wallpaperId !== wallpaperId) throw new Error("نسخهٔ دانلود پیدا نشد.");
    if (variant.imageKey === wallpaper.imageKey) throw new Error("حذف نسخهٔ اصلی از این مسیر مجاز نیست.");
    await tx.delete(wallpaperVariants).where(and(eq(wallpaperVariants.id, variantId), eq(wallpaperVariants.wallpaperId, wallpaperId)));
  });
}

export async function listUsers(page = 1, pageSize = 25) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const [items, totals] = await Promise.all([
    db.select().from(users).orderBy(desc(users.lastSignedIn)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(users),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0) };
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.lastSignedIn));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export async function updateUserRole(id: number, role: User["role"]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ role }).where(eq(users.id, id));
}

export async function getSiteSettings(): Promise<SiteSettingsValues> {
  const db = await getDb();
  if (!db) return { ...DEFAULT_SITE_SETTINGS };
  const row = (await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1))[0];
  if (!row) return { ...DEFAULT_SITE_SETTINGS };
  const { id: _id, updatedAt: _updatedAt, ...values } = row;
  return values;
}

export async function updateSiteSettings(input: SiteSettingsValues) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(siteSettings).values({ id: 1, ...input }).onDuplicateKeyUpdate({ set: input });
  return getSiteSettings();
}

export async function listWallpaperCategories() {
  const db = await getDb();
  if (!db) return [];
  return (await db.select({ name: wallpaperCategories.name }).from(wallpaperCategories).orderBy(asc(wallpaperCategories.sortOrder), asc(wallpaperCategories.name))).map(row => row.name);
}

export async function listAdminTaxonomy() {
  const db = await getDb();
  if (!db) return { categories: [], games: [], tags: [] };
  const categories = await db.select({ id: wallpaperCategories.id, name: wallpaperCategories.name, wallpaperCount: count(wallpapers.id) })
    .from(wallpaperCategories).leftJoin(wallpapers, eq(wallpapers.category, wallpaperCategories.name))
    .groupBy(wallpaperCategories.id, wallpaperCategories.name, wallpaperCategories.sortOrder)
    .orderBy(asc(wallpaperCategories.sortOrder), asc(wallpaperCategories.name));
  const games = await db.select({ gameTitle: wallpapers.gameTitle, wallpaperCount: count() }).from(wallpapers)
    .where(isNotNull(wallpapers.gameTitle)).groupBy(wallpapers.gameTitle).orderBy(asc(wallpapers.gameTitle));
  const tagRows = await db.select({ tags: wallpapers.tags }).from(wallpapers).where(isNotNull(wallpapers.tags));
  const tagCounts = new Map<string, number>();
  for (const row of tagRows) for (const raw of (row.tags ?? "").split(",")) {
    const name = raw.trim();
    if (name) tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
  }
  const tags = [...tagCounts].map(([name, usageCount]) => ({ name, usageCount })).sort((a, b) => a.name.localeCompare(b.name, "fa"));
  return { categories, games: games.flatMap(row => row.gameTitle ? [{ gameTitle: row.gameTitle, wallpaperCount: Number(row.wallpaperCount) }] : []), tags };
}

export async function createWallpaperCategory(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(wallpaperCategories).values({ name, sortOrder: 0 });
}

export async function renameWallpaperCategory(id: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = (await db.select().from(wallpaperCategories).where(eq(wallpaperCategories.id, id)).limit(1))[0];
  if (!current) throw new Error("دسته‌بندی پیدا نشد.");
  const duplicate = (await db.select({ id: wallpaperCategories.id }).from(wallpaperCategories).where(eq(wallpaperCategories.name, name)).limit(1))[0];
  if (duplicate && duplicate.id !== id) throw new Error("دسته‌بندی‌ای با این نام از قبل وجود دارد.");
  await db.transaction(async tx => {
    await tx.update(wallpapers).set({ category: name }).where(eq(wallpapers.category, current.name));
    await tx.update(wallpaperCategories).set({ name }).where(eq(wallpaperCategories.id, id));
  });
}

export async function deleteWallpaperCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = (await db.select().from(wallpaperCategories).where(eq(wallpaperCategories.id, id)).limit(1))[0];
  if (!current) throw new Error("دسته‌بندی پیدا نشد.");
  const usage = (await db.select({ total: count() }).from(wallpapers).where(eq(wallpapers.category, current.name)))[0]?.total ?? 0;
  if (Number(usage) > 0) throw new Error("ابتدا والپیپرهای این دسته را به دستهٔ دیگری منتقل کنید.");
  await db.delete(wallpaperCategories).where(eq(wallpaperCategories.id, id));
}

export async function renameGame(oldName: string, newName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(wallpapers).set({ gameTitle: newName }).where(eq(wallpapers.gameTitle, oldName));
}

export async function removeGame(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(wallpapers).set({ gameTitle: null }).where(eq(wallpapers.gameTitle, name));
}

async function mutateTag(oldName: string, newName: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const rows = await tx.select({ id: wallpapers.id, tags: wallpapers.tags }).from(wallpapers).where(isNotNull(wallpapers.tags));
    for (const row of rows) {
      const source = (row.tags ?? "").split(",").map(tag => tag.trim()).filter(Boolean);
      let changed = false;
      const next = source.flatMap(tag => {
        if (tag.toLocaleLowerCase() !== oldName.toLocaleLowerCase()) return [tag];
        changed = true;
        return newName ? [newName] : [];
      });
      const unique = [...new Map(next.map(tag => [tag.toLocaleLowerCase(), tag])).values()];
      if (changed) await tx.update(wallpapers).set({ tags: unique.join(", ") || null }).where(eq(wallpapers.id, row.id));
    }
  });
}

export async function renameTag(oldName: string, newName: string) { return mutateTag(oldName, newName); }
export async function removeTag(name: string) { return mutateTag(name, null); }

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; errno?: unknown };
  return value.code === "ER_DUP_ENTRY" || value.errno === 1062;
}

export async function getAdminAccountByUsername(username: string): Promise<AdminAccount | undefined> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return (await database.select().from(adminAccounts).where(eq(adminAccounts.username, username)).limit(1))[0];
}

export async function getAdminAccountById(id: number): Promise<AdminAccount | undefined> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return (await database.select().from(adminAccounts).where(eq(adminAccounts.id, id)).limit(1))[0];
}

export async function getOwnerAdminAccount(): Promise<AdminAccount | undefined> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return (await database.select().from(adminAccounts).where(eq(adminAccounts.ownerSlot, 1)).limit(1))[0];
}

export async function getOwnerAdminOpenId(): Promise<string | null> {
  return (await getOwnerAdminAccount())?.ownerOpenId ?? null;
}

export async function getOwnerAdminByOpenId(openId: string): Promise<AdminAccount | undefined> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return (await database.select().from(adminAccounts).where(and(eq(adminAccounts.ownerSlot, 1), eq(adminAccounts.ownerOpenId, openId))).limit(1))[0];
}

export async function createOwnerAdminAccount(input: { username: string; passwordHash: string; ownerOpenId?: string | null; now: Date }): Promise<number | null> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  try {
    return await database.transaction(async tx => {
      const [owner] = await tx.select({ id: adminAccounts.id }).from(adminAccounts).where(eq(adminAccounts.ownerSlot, 1)).limit(1);
      if (owner) return null;
      const values: InsertAdminAccount = {
        username: input.username,
        passwordHash: input.passwordHash,
        role: "owner",
        isActive: 1,
        mustChangePassword: 0,
        ownerSlot: 1,
        ownerOpenId: input.ownerOpenId,
        createdAt: input.now,
        updatedAt: input.now,
        lastLoginAt: input.now,
      };
      const result = await tx.insert(adminAccounts).values(values);
      return Number(result[0].insertId);
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

export async function createManagedAdminAccount(input: { username: string; passwordHash: string; permissions?: AdminPermissions; now: Date }): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  const values: InsertAdminAccount = {
    username: input.username,
    passwordHash: input.passwordHash,
    role: "admin",
    isActive: 1,
    mustChangePassword: 1,
    canAccessOverview: input.permissions?.overview ?? NO_ADMIN_PERMISSIONS.overview,
    canAccessWallpapers: input.permissions?.wallpapers ?? NO_ADMIN_PERMISSIONS.wallpapers,
    canAccessRequests: input.permissions?.requests ?? NO_ADMIN_PERMISSIONS.requests,
    canAccessTaxonomy: input.permissions?.taxonomy ?? NO_ADMIN_PERMISSIONS.taxonomy,
    canAccessSettings: input.permissions?.settings ?? NO_ADMIN_PERMISSIONS.settings,
    canAccessUsers: input.permissions?.users ?? NO_ADMIN_PERMISSIONS.users,
    ownerSlot: null,
    ownerOpenId: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const result = await database.insert(adminAccounts).values(values);
  return Number(result[0].insertId);
}

export async function listManagedAdminAccounts() {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return database.select({
    id: adminAccounts.id,
    username: adminAccounts.username,
    role: adminAccounts.role,
    isActive: adminAccounts.isActive,
    mustChangePassword: adminAccounts.mustChangePassword,
    permissions: {
      overview: adminAccounts.canAccessOverview,
      wallpapers: adminAccounts.canAccessWallpapers,
      requests: adminAccounts.canAccessRequests,
      taxonomy: adminAccounts.canAccessTaxonomy,
      settings: adminAccounts.canAccessSettings,
      users: adminAccounts.canAccessUsers,
    },
    createdAt: adminAccounts.createdAt,
    lastLoginAt: adminAccounts.lastLoginAt,
  }).from(adminAccounts).orderBy(asc(adminAccounts.role), asc(adminAccounts.username));
}

export async function createAdminSession(input: { tokenHash: string; accountId: number; expiresAt: Date; isRecovery: number; createdAt: Date }): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  await database.delete(adminSessions).where(lt(adminSessions.expiresAt, input.createdAt));
  await database.insert(adminSessions).values(input);
}

export async function getAdminSessionByTokenHash(tokenHash: string, now: Date) {
  const database = await getDb();
  if (!database) return null;
  const [row] = await database.select({
    id: adminAccounts.id,
    username: adminAccounts.username,
    role: adminAccounts.role,
    mustChangePassword: adminAccounts.mustChangePassword,
    ownerOpenId: adminAccounts.ownerOpenId,
    isActive: adminAccounts.isActive,
    canAccessOverview: adminAccounts.canAccessOverview,
    canAccessWallpapers: adminAccounts.canAccessWallpapers,
    canAccessRequests: adminAccounts.canAccessRequests,
    canAccessTaxonomy: adminAccounts.canAccessTaxonomy,
    canAccessSettings: adminAccounts.canAccessSettings,
    canAccessUsers: adminAccounts.canAccessUsers,
    isRecovery: adminSessions.isRecovery,
    tokenHash: adminSessions.tokenHash,
  }).from(adminSessions)
    .innerJoin(adminAccounts, eq(adminSessions.accountId, adminAccounts.id))
    .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, now), eq(adminAccounts.isActive, 1)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: Boolean(row.mustChangePassword),
    ownerOpenId: row.ownerOpenId,
    permissions: row.role === "owner" ? FULL_ADMIN_PERMISSIONS : {
      overview: Boolean(row.canAccessOverview),
      wallpapers: Boolean(row.canAccessWallpapers),
      requests: Boolean(row.canAccessRequests),
      taxonomy: Boolean(row.canAccessTaxonomy),
      settings: Boolean(row.canAccessSettings),
      users: Boolean(row.canAccessUsers),
    },
    isRecovery: Boolean(row.isRecovery),
    tokenHash: row.tokenHash,
  } as const;
}

export async function deleteAdminSession(tokenHash: string): Promise<void> {
  const database = await getDb();
  if (!database) return;
  await database.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
}

export async function clearAdminLoginLimits(bucketHashes: string[]): Promise<void> {
  const database = await getDb();
  if (!database || !bucketHashes.length) return;
  await database.delete(adminAuthLimits).where(inArray(adminAuthLimits.bucketHash, bucketHashes));
}

export async function consumeRateLimitBuckets(bucketLimits: Array<{ hash: string; limit: number }>, now: Date, windowMs: number): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  const limits = new Map(bucketLimits.filter(bucket => /^[a-f0-9]{64}$/.test(bucket.hash) && Number.isInteger(bucket.limit) && bucket.limit > 0).map(bucket => [bucket.hash, bucket.limit]));
  const hashes = [...limits.keys()];
  if (!hashes.length) throw new Error("No valid login rate-limit buckets were supplied.");
  const resetBefore = new Date(now.getTime() - windowMs);
  const allowed = await database.transaction(async tx => {
    for (const bucketHash of hashes) {
      await tx.insert(adminAuthLimits).values({ bucketHash, windowStartedAt: now, attemptCount: 1, updatedAt: now }).onDuplicateKeyUpdate({
        set: {
          attemptCount: sql`IF(${adminAuthLimits.windowStartedAt} <= ${resetBefore}, 1, ${adminAuthLimits.attemptCount} + 1)`,
          windowStartedAt: sql`IF(${adminAuthLimits.windowStartedAt} <= ${resetBefore}, ${now}, ${adminAuthLimits.windowStartedAt})`,
          updatedAt: now,
        },
      });
    }
    const rows = await tx.select({ bucketHash: adminAuthLimits.bucketHash, attemptCount: adminAuthLimits.attemptCount })
      .from(adminAuthLimits).where(inArray(adminAuthLimits.bucketHash, hashes));
    return rows.length === hashes.length && rows.every(row => row.attemptCount <= (limits.get(row.bucketHash) ?? 0));
  });
  if (Math.random() < 0.01) {
    await database.delete(adminAuthLimits).where(lt(adminAuthLimits.updatedAt, new Date(now.getTime() - 30 * 24 * 60 * 60_000)));
  }
  return allowed;
}

export async function consumeAdminLoginLimits(bucketLimits: Array<{ hash: string; limit: number }>, now: Date, windowMs: number): Promise<boolean> {
  return consumeRateLimitBuckets(bucketLimits, now, windowMs);
}

export async function updateAdminLastLogin(accountId: number, now: Date): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  await database.update(adminAccounts).set({ lastLoginAt: now, updatedAt: now }).where(eq(adminAccounts.id, accountId));
}

export async function changeAdminPassword(accountId: number, passwordHash: string, tokenHashToKeep: string | null, now: Date): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  await database.transaction(async tx => {
    await tx.update(adminAccounts).set({ passwordHash, mustChangePassword: 0, updatedAt: now }).where(eq(adminAccounts.id, accountId));
    await tx.delete(adminSessions).where(tokenHashToKeep
      ? and(eq(adminSessions.accountId, accountId), ne(adminSessions.tokenHash, tokenHashToKeep))
      : eq(adminSessions.accountId, accountId));
  });
}

export async function resetManagedAdminPassword(accountId: number, passwordHash: string, now: Date): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return database.transaction(async tx => {
    const result = await tx.update(adminAccounts).set({ passwordHash, mustChangePassword: 1, updatedAt: now })
      .where(and(eq(adminAccounts.id, accountId), eq(adminAccounts.role, "admin")));
    if (Number(result[0].affectedRows ?? 0) !== 1) return false;
    await tx.delete(adminSessions).where(eq(adminSessions.accountId, accountId));
    return true;
  });
}

export async function setManagedAdminActive(accountId: number, isActive: boolean, now: Date): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return database.transaction(async tx => {
    const result = await tx.update(adminAccounts).set({ isActive: isActive ? 1 : 0, updatedAt: now })
      .where(and(eq(adminAccounts.id, accountId), eq(adminAccounts.role, "admin")));
    if (Number(result[0].affectedRows ?? 0) !== 1) return false;
    if (!isActive) await tx.delete(adminSessions).where(eq(adminSessions.accountId, accountId));
    return true;
  });
}

export async function deleteManagedAdminAccount(accountId: number): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  const result = await database.delete(adminAccounts).where(and(
    eq(adminAccounts.id, accountId),
    eq(adminAccounts.role, "admin"),
  ));
  return Number(result[0]?.affectedRows ?? 0) === 1;
}

export async function renameManagedAdminAccount(accountId: number, username: string, now: Date): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  const result = await database.update(adminAccounts).set({ username, updatedAt: now })
    .where(and(eq(adminAccounts.id, accountId), eq(adminAccounts.role, "admin")));
  return Number(result[0].affectedRows ?? 0) === 1;
}

export async function updateManagedAdminPermissions(accountId: number, permissions: AdminPermissions, now: Date): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return database.transaction(async tx => {
    const result = await tx.update(adminAccounts).set({
      canAccessOverview: permissions.overview,
      canAccessWallpapers: permissions.wallpapers,
      canAccessRequests: permissions.requests,
      canAccessTaxonomy: permissions.taxonomy,
      canAccessSettings: permissions.settings,
      canAccessUsers: permissions.users,
      updatedAt: now,
    }).where(and(eq(adminAccounts.id, accountId), eq(adminAccounts.role, "admin")));
    if (Number(result[0].affectedRows ?? 0) > 0) return true;
    const [account] = await tx.select({ id: adminAccounts.id }).from(adminAccounts)
      .where(and(eq(adminAccounts.id, accountId), eq(adminAccounts.role, "admin"))).limit(1);
    return Boolean(account);
  });
}

export async function renameOwnerAdminAccount(username: string, now: Date): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  await database.update(adminAccounts).set({ username, updatedAt: now }).where(eq(adminAccounts.ownerSlot, 1));
}

export async function updateOwnerAdminCredentials(input: { accountId: number; username?: string; passwordHash?: string; tokenHash: string; now: Date }): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return database.transaction(async tx => {
    const set: Partial<InsertAdminAccount> = { updatedAt: input.now };
    if (input.username) set.username = input.username;
    if (input.passwordHash) {
      set.passwordHash = input.passwordHash;
      set.mustChangePassword = 0;
    }
    const result = await tx.update(adminAccounts).set(set)
      .where(and(eq(adminAccounts.id, input.accountId), eq(adminAccounts.role, "owner"), eq(adminAccounts.ownerSlot, 1)));
    if (Number(result[0].affectedRows ?? 0) !== 1) return false;
    if (input.passwordHash) {
      await tx.delete(adminSessions).where(and(eq(adminSessions.accountId, input.accountId), ne(adminSessions.tokenHash, input.tokenHash)));
    }
    return true;
  });
}

export async function deleteAdminSessionsForAccount(accountId: number, keepTokenHash?: string): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  await database.delete(adminSessions).where(keepTokenHash
    ? and(eq(adminSessions.accountId, accountId), ne(adminSessions.tokenHash, keepTokenHash))
    : eq(adminSessions.accountId, accountId));
}


export async function deleteWallpaperRequest(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(wallpaperRequests).where(eq(wallpaperRequests.id, id));
}


export async function recordAdminActivity(input: {
  actorAccountId: number; actorUsername: string; section: "wallpapers" | "requests" | "taxonomy" | "settings" | "users" | "admins";
  actionKey: string; entityId: number | null; createdAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(adminActivityLogs).values(input);
}

export async function getAdminActivityPage(page: number, sections: Array<"wallpapers" | "requests" | "taxonomy" | "settings" | "users" | "admins">, pageSize = 25) {
  const db = await getDb();
  if (!db || !sections.length) return { items: [], total: 0 };
  const where = inArray(adminActivityLogs.section, sections);
  const [items, totals] = await Promise.all([
    db.select({ id: adminActivityLogs.id, actorAccountId: adminActivityLogs.actorAccountId, actorUsername: adminActivityLogs.actorUsername, section: adminActivityLogs.section, actionKey: adminActivityLogs.actionKey, entityId: adminActivityLogs.entityId, createdAt: adminActivityLogs.createdAt })
      .from(adminActivityLogs).where(where).orderBy(desc(adminActivityLogs.createdAt), desc(adminActivityLogs.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(adminActivityLogs).where(where),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0) };
}

export async function getActionableAdminStats() {
  const db = await getDb();
  const empty = { totals: { activeWallpapers: 0, views: 0, downloads: 0, pending: 0, drafts: 0, openReports: 0, newRequests: 0 }, topViewed: [], topDownloaded: [], noDownloads: [] };
  if (!db) return empty;
  const publicWhere = and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"));
  const [totals, publicationStates, reportStates, requestStates, topViewed, topDownloaded, noDownloads] = await Promise.all([
    db.select({ views: sql<number>`coalesce(sum(${wallpapers.viewCount}), 0)`, downloads: sql<number>`coalesce(sum(${wallpapers.downloadCount}), 0)` }).from(wallpapers).where(publicWhere),
    db.select({ status: wallpapers.publicationStatus, total: count() }).from(wallpapers).where(eq(wallpapers.isArchived, 0)).groupBy(wallpapers.publicationStatus),
    db.select({ status: wallpaperIssueReports.status, total: count() }).from(wallpaperIssueReports).groupBy(wallpaperIssueReports.status),
    db.select({ status: wallpaperRequests.status, total: count() }).from(wallpaperRequests).groupBy(wallpaperRequests.status),
    db.select({ id: wallpapers.id, title: wallpapers.title, gameTitle: wallpapers.gameTitle, viewCount: wallpapers.viewCount, downloadCount: wallpapers.downloadCount, thumbnailUrl: wallpapers.thumbnailUrl }).from(wallpapers).where(publicWhere).orderBy(desc(wallpapers.viewCount), desc(wallpapers.downloadCount)).limit(5),
    db.select({ id: wallpapers.id, title: wallpapers.title, gameTitle: wallpapers.gameTitle, viewCount: wallpapers.viewCount, downloadCount: wallpapers.downloadCount, thumbnailUrl: wallpapers.thumbnailUrl }).from(wallpapers).where(publicWhere).orderBy(desc(wallpapers.downloadCount), desc(wallpapers.viewCount)).limit(5),
    db.select({ id: wallpapers.id, title: wallpapers.title, gameTitle: wallpapers.gameTitle, viewCount: wallpapers.viewCount, downloadCount: wallpapers.downloadCount, thumbnailUrl: wallpapers.thumbnailUrl }).from(wallpapers).where(and(publicWhere, eq(wallpapers.downloadCount, 0))).orderBy(asc(wallpapers.viewCount), asc(wallpapers.createdAt)).limit(5),
  ]);
  return {
    totals: {
      activeWallpapers: Number(publicationStates.find(row => row.status === "published")?.total ?? 0),
      views: Number(totals[0]?.views ?? 0), downloads: Number(totals[0]?.downloads ?? 0),
      pending: Number(publicationStates.find(row => row.status === "pending")?.total ?? 0),
      drafts: Number(publicationStates.find(row => row.status === "draft")?.total ?? 0),
      openReports: reportStates.filter(row => row.status === "new" || row.status === "reviewed").reduce((sum, row) => sum + Number(row.total), 0),
      newRequests: Number(requestStates.find(row => row.status === "new")?.total ?? 0),
    },
    topViewed, topDownloaded, noDownloads,
  };
}

export async function getContentHealthReport() {
  const db = await getDb();
  const issueKeys = ["missing_dimensions", "missing_thumbnail", "missing_description", "missing_game", "large_file", "possible_duplicate"] as const;
  type IssueKey = typeof issueKeys[number];
  type Sample = { id: number; title: string; gameTitle: string | null };
  const labels: Record<IssueKey, string> = {
    missing_dimensions: "ابعاد واقعی ثبت نشده", missing_thumbnail: "تصویر بندانگشتی مفقود است", missing_description: "توضیح خالی است",
    missing_game: "نام بازی ثبت نشده", large_file: "فایل بزرگ‌تر از ۱۰ مگابایت", possible_duplicate: "تکرار احتمالی در همان بازی",
  };
  const groups = new Map<IssueKey, Sample[]>(issueKeys.map(key => [key, []]));
  const counts = new Map<IssueKey, number>(issueKeys.map(key => [key, 0]));
  if (!db) return { issues: issueKeys.map(key => ({ key, label: labels[key], count: 0, samples: [] as Sample[] })) };
  const rows = await db.select({ id: wallpapers.id, title: wallpapers.title, gameTitle: wallpapers.gameTitle, width: wallpapers.width, height: wallpapers.height, description: wallpapers.description, thumbnailUrl: wallpapers.thumbnailUrl, fileSize: wallpapers.fileSize })
    .from(wallpapers).where(and(eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"))).orderBy(desc(wallpapers.updatedAt)).limit(5000);
  const duplicateGroups = new Map<string, Sample[]>();
  const add = (key: IssueKey, sample: Sample) => { counts.set(key, (counts.get(key) ?? 0) + 1); const list = groups.get(key)!; if (list.length < 8) list.push(sample); };
  for (const row of rows) {
    const sample = { id: row.id, title: row.title, gameTitle: row.gameTitle };
    if (!row.width || !row.height) add("missing_dimensions", sample);
    if (!row.thumbnailUrl) add("missing_thumbnail", sample);
    if (!row.description?.trim()) add("missing_description", sample);
    if (!row.gameTitle?.trim()) add("missing_game", sample);
    if (row.fileSize > 10 * 1024 * 1024) add("large_file", sample);
    if (row.gameTitle?.trim()) {
      const normalizedTitle = normalizeWallpaperTitleForDuplicateReview(row.title);
      if (normalizedTitle) {
        const key = `${normalizeSearch(row.gameTitle)}|${normalizedTitle}`;
        const list = duplicateGroups.get(key) ?? [];
        list.push(sample);
        duplicateGroups.set(key, list);
      }
    }
  }
  for (const duplicates of duplicateGroups.values()) if (duplicates.length > 1) for (const sample of duplicates) add("possible_duplicate", sample);
  return { issues: issueKeys.map(key => ({ key, label: labels[key], count: counts.get(key) ?? 0, samples: groups.get(key) ?? [] })) };
}

export async function consumeWallpaperIssueReportAttempt(clientHash: string, now: Date) {
  const allowed = await consumeClientRateWindow(clientHash, now, "report");
  return allowed;
}

export async function createWallpaperIssueReport(input: {
  wallpaperId: number; reason: "download" | "quality" | "wrong_info" | "duplicate" | "broken" | "irrelevant" | "other"; details: string | null; clientHash: string; createdAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [wallpaper] = await db.select({ title: wallpapers.title }).from(wallpapers).where(and(eq(wallpapers.id, input.wallpaperId), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"))).limit(1);
  if (!wallpaper) return null;
  const result = await db.insert(wallpaperIssueReports).values({ ...input, details: redactWallpaperIssueDetails(input.details), wallpaperTitle: wallpaper.title });
  return Number(result[0].insertId);
}

export async function getWallpaperLikeSummary(wallpaperId: number, clientHash: string) {
  const db = await getDb();
  if (!db) return null;
  const [wallpaper] = await db.select({ id: wallpapers.id }).from(wallpapers).where(and(
    eq(wallpapers.id, wallpaperId), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"),
  )).limit(1);
  if (!wallpaper) return null;
  const [[totals], [viewerVote]] = await Promise.all([
    db.select({ total: count() }).from(wallpaperLikes).where(eq(wallpaperLikes.wallpaperId, wallpaperId)),
    db.select({ id: wallpaperLikes.id }).from(wallpaperLikes).where(and(
      eq(wallpaperLikes.wallpaperId, wallpaperId), eq(wallpaperLikes.clientHash, clientHash),
    )).limit(1),
  ]);
  return { likeCount: Number(totals?.total ?? 0), liked: Boolean(viewerVote) };
}

export async function likeWallpaper(wallpaperId: number, clientHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [wallpaper] = await db.select({ id: wallpapers.id }).from(wallpapers).where(and(
    eq(wallpapers.id, wallpaperId), eq(wallpapers.isArchived, 0), eq(wallpapers.publicationStatus, "published"),
  )).limit(1);
  if (!wallpaper) return null;
  await db.insert(wallpaperLikes).values({ wallpaperId, clientHash }).onDuplicateKeyUpdate({
    set: { createdAt: sql`${wallpaperLikes.createdAt}` },
  });
  return getWallpaperLikeSummary(wallpaperId, clientHash);
}

export async function listWallpaperIssueReports(page: number, status?: "new" | "reviewed" | "resolved" | "dismissed", pageSize = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const where = status ? eq(wallpaperIssueReports.status, status) : undefined;
  const [items, totals] = await Promise.all([
    db.select({ id: wallpaperIssueReports.id, wallpaperId: wallpaperIssueReports.wallpaperId, wallpaperTitle: wallpaperIssueReports.wallpaperTitle, reason: wallpaperIssueReports.reason, details: wallpaperIssueReports.details, status: wallpaperIssueReports.status, createdAt: wallpaperIssueReports.createdAt })
      .from(wallpaperIssueReports).where(where).orderBy(desc(wallpaperIssueReports.createdAt), desc(wallpaperIssueReports.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(wallpaperIssueReports).where(where),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0) };
}

export async function updateWallpaperIssueReportStatus(id: number, status: "new" | "reviewed" | "resolved" | "dismissed") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(wallpaperIssueReports).set({ status }).where(eq(wallpaperIssueReports.id, id));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}


export async function getAdminWallpaperForEdit(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [wallpaper] = await db.select().from(wallpapers).where(eq(wallpapers.id, id)).limit(1);
  if (!wallpaper) return null;
  const variants = await db.select().from(wallpaperVariants).where(eq(wallpaperVariants.wallpaperId, id)).orderBy(asc(wallpaperVariants.id));
  const [enriched] = await includeCommunitySubmissionMetadata(db, [wallpaper]);
  return { ...enriched, extraVariantCount: variants.length, extraVariants: variants };
}
