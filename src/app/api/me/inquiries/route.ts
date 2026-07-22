/**
 * Buyer inquiry history (spec §4.2.2). Auth-gated on "is signed in" — any
 * registered user sees the leads *they* submitted; anonymous → 401.
 *
 *   GET /api/me/inquiries → the caller's inquiries, newest first, each with the
 *                           listing it was about (sold/removed listings included).
 */
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { handleRoute, ok } from "../_lib/http";
import { listBuyerInquiries } from "./_lib/repo";

export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    const inquiries = await listBuyerInquiries(db, actor.userId);
    return ok(inquiries);
  });
}
