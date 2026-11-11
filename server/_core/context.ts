import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getAdminSessionFromRequest, type AdminSessionPrincipal } from "../admin-auth";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  adminSession: AdminSessionPrincipal | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  let adminSession: AdminSessionPrincipal | null = null;
  try {
    adminSession = await getAdminSessionFromRequest(opts.req);
  } catch {
    adminSession = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    adminSession,
  };
}
