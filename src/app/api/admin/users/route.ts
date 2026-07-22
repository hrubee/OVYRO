/**
 * GET /api/admin/users?q=&role=&status=  (spec §4.1.2, §7)
 *
 * The admin users table: searchable (name/email) and filterable by role and
 * status. Admin-gated; non-admins get 403.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";
import { requireActorWithRole } from "@/lib/auth/session";
import { jsonError } from "./_lib/http";
import { listUsers } from "./_lib/queries";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(["active", "suspended", "deleted"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireActorWithRole("admin");

    const params = request.nextUrl.searchParams;
    const filters = filtersSchema.parse({
      q: params.get("q") ?? undefined,
      role: params.get("role") ?? undefined,
      status: params.get("status") ?? undefined,
    });

    const usersList = await listUsers(filters);
    return NextResponse.json({ users: usersList });
  } catch (error) {
    return jsonError(error);
  }
}
