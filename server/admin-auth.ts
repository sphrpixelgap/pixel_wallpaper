import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import { getSessionCookieOptions } from "./_core/cookies";
import * as db from "./db";
import type { AdminPermissions } from "../shared/admin-permissions";

export const ADMIN_SESSION_COOKIE = "__Host-pixelwp_admin_session";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const ADMIN_RECOVERY_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_ATTEMPT_LIMIT = 8;
export const ADMIN_LOGIN_ADDRESS_ATTEMPT_LIMIT = 60;
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: SCRYPT_MAX_MEMORY,
    }, (error, derived) => error ? reject(error) : resolve(derived));
  });
}

export type AdminSessionPrincipal = {
  id: number;
  username: string;
  role: "owner" | "admin";
  permissions: AdminPermissions;
  mustChangePassword: boolean;
  ownerOpenId: string | null;
  isRecovery: boolean;
  tokenHash: string;
};

export function normalizeAdminUsername(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized)) {
    throw new Error("نام‌کاربری باید ۳ تا ۳۲ نویسه و شامل حروف لاتین، عدد، نقطه، خط تیره یا زیرخط باشد.");
  }
  return normalized;
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePasswordKey(password, salt);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyAdminPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || Number(parts[1]) !== SCRYPT_COST || Number(parts[2]) !== SCRYPT_BLOCK_SIZE || Number(parts[3]) !== SCRYPT_PARALLELIZATION) return false;
  if (!/^[a-f0-9]{32}$/i.test(parts[4]) || !/^[a-f0-9]{128}$/i.test(parts[5])) return false;
  const expected = Buffer.from(parts[5], "hex");
  const actual = await derivePasswordKey(password, Buffer.from(parts[4], "hex"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashAdminSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function makeAdminLoginBucketHashes(username: string, address: string, secret: string): string[] {
  if (!secret) throw new Error("A server signing secret is required for login rate limits.");
  const normalizedUsername = normalizeAdminUsername(username);
  const hmac = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  return [hmac(`username:${normalizedUsername}`), hmac(`address:${address || "unknown"}`)];
}

export function getAdminRequestAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export async function getAdminSessionFromRequest(req: Request): Promise<AdminSessionPrincipal | null> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[ADMIN_SESSION_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return db.getAdminSessionByTokenHash(hashAdminSessionToken(token), new Date());
}

export async function issueAdminSession(
  accountId: number,
  req: Request,
  res: Response,
  options: { recovery?: boolean } = {},
): Promise<string> {
  const recovery = options.recovery === true;
  const ttl = recovery ? ADMIN_RECOVERY_SESSION_TTL_MS : ADMIN_SESSION_TTL_MS;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAdminSessionToken(token);
  const now = new Date();
  await db.createAdminSession({
    tokenHash,
    accountId,
    expiresAt: new Date(now.getTime() + ttl),
    isRecovery: recovery ? 1 : 0,
    createdAt: now,
  });
  await db.updateAdminLastLogin(accountId, now);
  res.cookie(ADMIN_SESSION_COOKIE, token, { ...getSessionCookieOptions(req), maxAge: ttl });
  return tokenHash;
}

export async function clearAdminSession(req: Request, res: Response): Promise<void> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[ADMIN_SESSION_COOKIE];
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await db.deleteAdminSession(hashAdminSessionToken(token));
  }
  res.clearCookie(ADMIN_SESSION_COOKIE, { ...getSessionCookieOptions(req), maxAge: -1 });
}

let dummyPasswordHash: Promise<string> | null = null;
export async function verifyAdminPasswordOrDummy(password: string, encodedHash?: string | null): Promise<boolean> {
  if (encodedHash) return verifyAdminPassword(password, encodedHash);
  dummyPasswordHash ??= hashAdminPassword(randomBytes(24).toString("hex"));
  await verifyAdminPassword(password, await dummyPasswordHash);
  return false;
}
