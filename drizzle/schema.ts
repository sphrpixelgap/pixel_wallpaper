import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "blocked"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const adminAccounts = mysqlTable("admin_accounts", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 32 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["owner", "admin"]).default("admin").notNull(),
  isActive: int("isActive").default(1).notNull(),
  mustChangePassword: int("mustChangePassword").default(0).notNull(),
  canAccessOverview: boolean("canAccessOverview").default(false).notNull(),
  canAccessWallpapers: boolean("canAccessWallpapers").default(false).notNull(),
  canAccessRequests: boolean("canAccessRequests").default(false).notNull(),
  canAccessTaxonomy: boolean("canAccessTaxonomy").default(false).notNull(),
  canAccessSettings: boolean("canAccessSettings").default(false).notNull(),
  canAccessUsers: boolean("canAccessUsers").default(false).notNull(),
  ownerSlot: int("ownerSlot"),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
}, table => ({
  usernameUniqueIdx: uniqueIndex("admin_accounts_username_uq").on(table.username),
  ownerSlotUniqueIdx: uniqueIndex("admin_accounts_owner_slot_uq").on(table.ownerSlot),
  ownerOpenIdUniqueIdx: uniqueIndex("admin_accounts_owner_open_id_uq").on(table.ownerOpenId),
}));

export type AdminAccount = typeof adminAccounts.$inferSelect;
export type InsertAdminAccount = typeof adminAccounts.$inferInsert;

export const adminSessions = mysqlTable("admin_sessions", {
  tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
  accountId: int("accountId").notNull().references(() => adminAccounts.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  isRecovery: int("isRecovery").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  accountIdx: index("admin_sessions_account_idx").on(table.accountId),
  expiresAtIdx: index("admin_sessions_expires_idx").on(table.expiresAt),
}));

export const adminAuthLimits = mysqlTable("admin_auth_limits", {
  bucketHash: varchar("bucketHash", { length: 64 }).primaryKey(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  attemptCount: int("attemptCount").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  updatedAtIdx: index("admin_auth_limits_updated_at_idx").on(table.updatedAt),
}));

export const wallpapers = mysqlTable("wallpapers", {
  id: int("id").autoincrement().primaryKey(),
  publicationStatus: mysqlEnum("publicationStatus", ["draft", "pending", "published"]).default("published").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  gameTitle: varchar("gameTitle", { length: 160 }),
  tags: text("tags"),
  mood: varchar("mood", { length: 40 }).default("سایر").notNull(),
  dominantColor: varchar("dominantColor", { length: 24 }).default("purple").notNull(),
  targetDevice: varchar("targetDevice", { length: 24 }).default("desktop").notNull(),
  resolution: varchar("resolution", { length: 40 }).notNull(),
  width: int("width"),
  height: int("height"),
  description: text("description"),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  imageUrl: varchar("imageUrl", { length: 1024 }).notNull(),
  imageFileId: varchar("imageFileId", { length: 128 }),
  imageMime: varchar("imageMime", { length: 40 }).default("image/jpeg").notNull(),
  fileSize: int("fileSize").default(0).notNull(),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  thumbnailUrl: varchar("thumbnailUrl", { length: 1024 }),
  thumbnailFileId: varchar("thumbnailFileId", { length: 128 }),
  downloadCount: int("downloadCount").default(0).notNull(),
  viewCount: int("viewCount").default(0).notNull(),
  isArchived: int("isArchived").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  archiveCreatedIdx: index("wallpapers_archived_created_idx").on(table.isArchived, table.createdAt),
  gameTitleIdx: index("wallpapers_game_title_idx").on(table.gameTitle),
  popularIdx: index("wallpapers_popular_idx").on(table.downloadCount),
  viewCountIdx: index("wallpapers_view_count_idx").on(table.viewCount),
}));

export type Wallpaper = typeof wallpapers.$inferSelect;
export type InsertWallpaper = typeof wallpapers.$inferInsert;

export const communityWallpaperSubmissions = mysqlTable("community_wallpaper_submissions", {
  wallpaperId: int("wallpaperId").primaryKey().references(() => wallpapers.id, { onDelete: "cascade" }),
  privateImageFileId: varchar("privateImageFileId", { length: 128 }),
  privateThumbnailFileId: varchar("privateThumbnailFileId", { length: 128 }),
  publicImageFileId: varchar("publicImageFileId", { length: 128 }),
  publicThumbnailFileId: varchar("publicThumbnailFileId", { length: 128 }),
  sourceUrl: varchar("sourceUrl", { length: 1024 }),
  rightsConfirmedAt: timestamp("rightsConfirmedAt").notNull(),
  promotedAt: timestamp("promotedAt"),
}, table => ({
  promotedIdx: index("community_wallpaper_submissions_promoted_idx").on(table.promotedAt),
}));

export const imageKitCleanupJobs = mysqlTable("imagekit_cleanup_jobs", {
  fileId: varchar("fileId", { length: 128 }).primaryKey(),
  attempts: int("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  nextAttemptIdx: index("imagekit_cleanup_next_attempt_idx").on(table.nextAttemptAt),
}));

export const wallpaperIssueReports = mysqlTable("wallpaper_issue_reports", {
  id: int("id").autoincrement().primaryKey(),
  wallpaperId: int("wallpaperId").notNull(),
  wallpaperTitle: varchar("wallpaperTitle", { length: 180 }).notNull(),
  reason: mysqlEnum("reason", ["download", "quality", "wrong_info", "duplicate", "other"]).notNull(),
  details: varchar("details", { length: 800 }),
  status: mysqlEnum("status", ["new", "reviewed", "resolved", "dismissed"]).default("new").notNull(),
  clientHash: varchar("clientHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  statusCreatedIdx: index("wallpaper_issue_reports_status_created_idx").on(table.status, table.createdAt),
  wallpaperCreatedIdx: index("wallpaper_issue_reports_wallpaper_created_idx").on(table.wallpaperId, table.createdAt),
  clientCreatedIdx: index("wallpaper_issue_reports_client_created_idx").on(table.clientHash, table.createdAt),
}));

export const adminActivityLogs = mysqlTable("admin_activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorAccountId: int("actorAccountId").notNull(),
  actorUsername: varchar("actorUsername", { length: 32 }).notNull(),
  section: mysqlEnum("section", ["wallpapers", "requests", "taxonomy", "settings", "users", "admins"]).notNull(),
  actionKey: varchar("actionKey", { length: 128 }).notNull(),
  entityId: int("entityId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  createdIdx: index("admin_activity_logs_created_idx").on(table.createdAt),
  sectionCreatedIdx: index("admin_activity_logs_section_created_idx").on(table.section, table.createdAt),
  actorCreatedIdx: index("admin_activity_logs_actor_created_idx").on(table.actorAccountId, table.createdAt),
}));

export const wallpaperVariants = mysqlTable("wallpaper_variants", {
  id: int("id").autoincrement().primaryKey(),
  wallpaperId: int("wallpaperId").notNull().references(() => wallpapers.id, { onDelete: "cascade" }),
  resolution: varchar("resolution", { length: 40 }).notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  targetDevice: varchar("targetDevice", { length: 24 }).notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  imageUrl: varchar("imageUrl", { length: 1024 }).notNull(),
  imageMime: varchar("imageMime", { length: 40 }).notNull(),
  fileSize: int("fileSize").default(0).notNull(),
  downloadCount: int("downloadCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  wallpaperIdx: index("wallpaper_variants_wallpaper_idx").on(table.wallpaperId),
}));

export type WallpaperVariant = typeof wallpaperVariants.$inferSelect;
export type InsertWallpaperVariant = typeof wallpaperVariants.$inferInsert;

export const wallpaperRequests = mysqlTable("wallpaper_requests", {
  id: int("id").autoincrement().primaryKey(),
  trackingCode: varchar("trackingCode", { length: 32 }),
  gameTitle: varchar("gameTitle", { length: 160 }).notNull(),
  wantedContent: varchar("wantedContent", { length: 200 }).notNull(),
  targetDevice: varchar("targetDevice", { length: 24 }).default("desktop").notNull(),
  resolution: varchar("resolution", { length: 40 }),
  details: text("details"),
  status: mysqlEnum("status", ["new", "reviewed", "completed"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  statusCreatedIdx: index("wallpaper_requests_status_created_idx").on(table.status, table.createdAt),
  trackingCodeUniqueIdx: uniqueIndex("wallpaper_requests_tracking_code_uq").on(table.trackingCode),
}));

export type WallpaperRequest = typeof wallpaperRequests.$inferSelect;
export type InsertWallpaperRequest = typeof wallpaperRequests.$inferInsert;

export const clientRequestLimits = mysqlTable("client_request_limits", {
  clientHash: varchar("clientHash", { length: 64 }).primaryKey(),
  lastAiCheckAt: timestamp("lastAiCheckAt"),
  lastSubmittedAt: timestamp("lastSubmittedAt"),
  checkLockToken: varchar("checkLockToken", { length: 32 }),
  checkLockExpiresAt: timestamp("checkLockExpiresAt"),
  lookupWindowStartedAt: timestamp("lookupWindowStartedAt"),
  lookupAttemptCount: int("lookupAttemptCount").default(0).notNull(),
  viewWindowStartedAt: timestamp("viewWindowStartedAt"),
  viewAttemptCount: int("viewAttemptCount").default(0).notNull(),
  reportWindowStartedAt: timestamp("reportWindowStartedAt"),
  reportAttemptCount: int("reportAttemptCount").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  updatedAtIdx: index("client_request_limits_updated_at_idx").on(table.updatedAt),
}));

export type ClientRequestLimit = typeof clientRequestLimits.$inferSelect;

export const wallpaperCategories = mysqlTable("wallpaper_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  nameUniqueIdx: uniqueIndex("wallpaper_categories_name_uq").on(table.name),
}));

export const siteSettings = mysqlTable("site_settings", {
  id: int("id").primaryKey(),
  brandName: varchar("brandName", { length: 100 }).notNull(),
  brandCaption: varchar("brandCaption", { length: 120 }).notNull(),
  footerTagline: varchar("footerTagline", { length: 180 }).notNull(),
  logoUrl: varchar("logoUrl", { length: 1024 }).notNull(),
  accentColor: varchar("accentColor", { length: 7 }).notNull(),
  heroEyebrow: varchar("heroEyebrow", { length: 120 }).notNull(),
  heroTitle: varchar("heroTitle", { length: 100 }).notNull(),
  heroAccentTitle: varchar("heroAccentTitle", { length: 100 }).notNull(),
  heroSubtitle: varchar("heroSubtitle", { length: 500 }).notNull(),
  seoTitle: varchar("seoTitle", { length: 180 }).notNull(),
  seoDescription: varchar("seoDescription", { length: 320 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSettings = typeof siteSettings.$inferSelect;
