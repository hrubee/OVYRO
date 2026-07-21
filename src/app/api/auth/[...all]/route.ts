import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/** Every Better Auth endpoint (spec §7: `POST /api/auth/*`). */
export const { GET, POST } = toNextJsHandler(auth.handler);
