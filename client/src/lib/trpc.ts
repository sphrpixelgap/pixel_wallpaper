import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type Wallpaper = RouterOutputs["wallpapers"]["list"][number];
export type AdminWallpaper = RouterOutputs["admin"]["listPage"]["items"][number];
