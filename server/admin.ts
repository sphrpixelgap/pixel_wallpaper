import type { User } from "../drizzle/schema";

/** Bootstrap is safe only for the explicitly configured owner, or the sole configured admin email. */
export function isBootstrapOwnerCandidate(user: Pick<User, "role" | "email" | "openId"> | null | undefined): boolean {
  if (!user) return false;
  const ownerOpenId = process.env.OWNER_OPEN_ID?.trim();
  if (ownerOpenId) return user.openId === ownerOpenId;
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(/[;,\n]/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.length === 1 && Boolean(user.email && user.email.trim().toLowerCase() === allowedEmails[0]);
}

/** Admin access is granted only by an explicit configured email or the existing owner ID/role. */
export function isSiteAdmin(user: Pick<User, "role" | "email" | "openId"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "blocked") return false;
  if (user.role === "admin") return true;
  const ownerOpenId = process.env.OWNER_OPEN_ID?.trim();
  if (ownerOpenId && user.openId === ownerOpenId) return true;
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(/[;,\n]/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(user.email && allowedEmails.includes(user.email.trim().toLowerCase()));
}
