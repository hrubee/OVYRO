/**
 * GET /api/admin/leads?q=&status=  (spec §4.1.4, §7)
 *
 * Platform-wide, READ-ONLY leads list for dispute resolution. Admin-gated;
 * non-admins get 403. There is intentionally no write route under this path.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActorWithRole } from "@/lib/auth/session";
import { LEAD_STATUSES } from "@/lib/leads";
import { jsonError } from "./_lib/http";
import { listAllLeads } from "./_lib/queries";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireActorWithRole("admin");

    const params = request.nextUrl.searchParams;
    const filters = filtersSchema.parse({
      q: params.get("q") ?? undefined,
      status: params.get("status") ?? undefined,
    });

    const leads = await listAllLeads(filters);
    return NextResponse.json({ leads });
  } catch (error) {
    return jsonError(error);
  }
}
