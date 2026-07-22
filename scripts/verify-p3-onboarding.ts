/**
 * Phase 3.5 integration verification driver (OVYRO-f37e).
 *
 * Drives the buyer → seller onboarding lifecycle, the additive role model, the
 * seller profile, per-listing stats, and the self-inquiry regression against a
 * REAL running HTTP server and REAL Postgres + Redis — the cross-module seams
 * the per-wave worktrees (onboarding-core, buyer onboarding, admin review, role
 * switcher, per-listing stats) could not exercise in isolation. Not part of the
 * shipped app; a repeatable manual gate, mirroring scripts/verify-lifecycle.ts.
 *
 * Prereqs: `next start` on :3000, Postgres migrated + admin + demo seeded,
 * Redis up, and the admin password exported so the driver can sign in:
 *   ADMIN_PASSWORD='…' bun run scripts/verify-p3-onboarding.ts
 *
 * DOCUMENTED SHORTCUTS (no cloud creds exist locally, exactly as verify-lifecycle):
 *   - one `listing_media` row is injected at the DB level so a listing can reach
 *     `active` without an R2 upload (submit requires >= 1 photo);
 *   - a few `analytics_events` rows are injected to prove the stats SQL bucketing
 *     against real Postgres. No request path emits analytics events yet (only the
 *     uncalled `track()` helper exists — see the report), so organic traffic
 *     would leave every sparkline flat; the injection exercises the reader only.
 * Both are called out at their injection sites and nowhere else is data faked.
 */
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import {
  adminAuditLog,
  analyticsEvents,
  listingMedia,
  listings,
  sellerOnboarding,
  userRoles,
  users,
} from "@/lib/db/schema";

const BASE = "http://127.0.0.1:3000";
const ADMIN_EMAIL = "admin@ovyro.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const DEV_OTP_CODE = "000000";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n-- ${title} --`);
}

/** Better Auth sets the session as a Set-Cookie; collapse to a Cookie header. */
function cookieHeader(res: Response): string {
  const jar = res.headers.getSetCookie?.() ?? [];
  return jar.map((c) => c.split(";")[0]).join("; ");
}

async function signUp(email: string, password: string, name: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) throw new Error(`sign-up ${email} failed: ${res.status} ${await res.text()}`);
  const cookie = cookieHeader(res);
  if (cookie) return cookie;
  return signIn(email, password);
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${email} failed: ${res.status} ${await res.text()}`);
  return cookieHeader(res);
}

async function userId(email: string): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!row) throw new Error(`no user ${email}`);
  return row.id;
}

async function rolesOf(uid: string): Promise<string[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, uid));
  return rows.map((r) => r.role).sort();
}

/** Verify a phone through the real OTP send + verify endpoints (dev code). */
async function verifyPhone(cookie: string, phone: string): Promise<Response> {
  const send = await fetch(`${BASE}/api/auth/otp/send`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ phone }),
  });
  if (!send.ok) throw new Error(`otp send failed: ${send.status} ${await send.text()}`);
  return fetch(`${BASE}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ phone, code: DEV_OTP_CODE }),
  });
}

const nonce = Math.floor(Math.random() * 1e9).toString(36);

const completeApplication = {
  sellerType: "individual",
  legalName: "Jaya Verify",
  address: {
    line1: "12 Riverside Road",
    city: "Nashik",
    region: "Maharashtra",
    postalCode: "422001",
    country: "IN",
  },
  termsAccepted: true,
};

const draftListing = {
  title: `Stats plot verify ${nonce}`,
  description: "Gently sloping riverside pasture with road frontage for stats.",
  landType: "agricultural",
  price: 4200000,
  currency: "INR",
  area: 5,
  areaUnit: "acre",
  city: "Nashik",
  region: "Maharashtra",
  country: "IN",
  roadAccess: true,
  water: true,
};

async function main(): Promise<void> {
  console.log("\n== Phase 3.5 onboarding + roles + stats E2E (real HTTP + Postgres) ==\n");
  if (!ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_PASSWORD (from the admin seed) before running.");
  }
  const cookieAdmin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  check("admin authenticated", Boolean(cookieAdmin));

  // ======================================================================
  section("Buyer registers + verifies phone via dev OTP");
  const buyerAEmail = `applicantA+${nonce}@ovyro.local`;
  const buyerAPhone = `+1555100${(1000 + Math.floor(Math.random() * 8999)).toString()}`;
  const cookieA = await signUp(buyerAEmail, "ApplicantA#2026", "Applicant A");
  const uidA = await userId(buyerAEmail);
  check("buyer registered with buyer role only", (await rolesOf(uidA)).join(",") === "buyer");

  const verifyRes = await verifyPhone(cookieA, buyerAPhone);
  const verifyJson = await verifyRes.json().catch(() => ({}));
  check("phone OTP verify -> 200", verifyRes.status === 200, `got ${verifyRes.status}`);
  check("verify response { verified: true }", verifyJson?.verified === true);
  const [uaRow] = await db
    .select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, uidA));
  check("users.phone_verified_at stamped", uaRow?.phoneVerifiedAt != null);
  check("users.phone persisted", uaRow?.phone === buyerAPhone, `got ${uaRow?.phone}`);

  // ======================================================================
  section("Buyer saves onboarding steps (resumable, stays in_progress)");
  const save1 = await fetch(`${BASE}/api/me/seller-onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ step: 1, sellerType: "individual", legalName: "Jaya Verify" }),
  });
  const save1Json = await save1.json();
  check("save step 1 -> 200", save1.status === 200, `got ${save1.status}`);
  check("state in_progress after save", save1Json?.data?.state === "in_progress", `got ${save1Json?.data?.state}`);
  check("partial legalName persisted", save1Json?.data?.legalName === "Jaya Verify");
  check("buyer DTO omits reviewedBy", !("reviewedBy" in (save1Json?.data ?? {})));

  const save2 = await fetch(`${BASE}/api/me/seller-onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ step: 2, address: { line1: "12 Riverside Road", city: "Nashik", country: "IN" } }),
  });
  const save2Json = await save2.json();
  check("save step 2 merges (legalName retained)", save2Json?.data?.legalName === "Jaya Verify");
  check("save step 2 address persisted", save2Json?.data?.address?.city === "Nashik");

  const getProgress = await fetch(`${BASE}/api/me/seller-onboarding`, { headers: { cookie: cookieA } });
  const progress = await getProgress.json();
  check("GET progress isSeller=false while applying", progress?.data?.isSeller === false);
  check("GET progress echoes in_progress row", progress?.data?.onboarding?.state === "in_progress");

  // ======================================================================
  section("Buyer submits the completed application");
  const submit = await fetch(`${BASE}/api/me/seller-onboarding/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify(completeApplication),
  });
  const submitJson = await submit.json();
  check("submit -> 200", submit.status === 200, `got ${submit.status}`);
  check("state submitted", submitJson?.data?.state === "submitted", `got ${submitJson?.data?.state}`);
  check("submitted_at stamped", Boolean(submitJson?.data?.submittedAt));
  check("termsAccepted true after submit", submitJson?.data?.termsAccepted === true);
  const applicationId: string = submitJson?.data?.id;

  // A locked (submitted) application cannot be edited.
  const editLocked = await fetch(`${BASE}/api/me/seller-onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ legalName: "Changed" }),
  });
  check("editing a submitted app -> 409 locked", editLocked.status === 409, `got ${editLocked.status}`);

  // ======================================================================
  section("Admin approves — additive seller role + audit log + idempotency");
  // Non-admin cannot approve.
  const buyerApproves = await fetch(`${BASE}/api/admin/seller-onboarding/${applicationId}/approve`, {
    method: "POST",
    headers: { cookie: cookieA },
  });
  check("non-admin approve -> 403", buyerApproves.status === 403, `got ${buyerApproves.status}`);

  const approve = await fetch(`${BASE}/api/admin/seller-onboarding/${applicationId}/approve`, {
    method: "POST",
    headers: { cookie: cookieAdmin },
  });
  const approveJson = await approve.json();
  check("admin approve -> 200", approve.status === 200, `got ${approve.status}`);
  check("submission state approved", approveJson?.submission?.state === "approved", `got ${approveJson?.submission?.state}`);

  const rolesAfter = await rolesOf(uidA);
  check("applicant now holds BOTH buyer AND seller", rolesAfter.join(",") === "buyer,seller", `got [${rolesAfter}]`);
  check("buyer role retained (additive, not replaced)", rolesAfter.includes("buyer"));

  const auditRows = await db
    .select()
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.entityId, applicationId), eq(adminAuditLog.action, "seller_onboarding.approve")));
  check("admin_audit_log approve row written", auditRows.length === 1, `rows=${auditRows.length}`);
  check("audit before/after snapshot present", auditRows[0]?.beforeJsonb != null && auditRows[0]?.afterJsonb != null);
  check(
    "audit before=submitted, after=approved",
    (auditRows[0]?.beforeJsonb as { state?: string })?.state === "submitted" &&
      (auditRows[0]?.afterJsonb as { state?: string })?.state === "approved",
  );

  // Idempotency: re-approve must not duplicate the role nor corrupt state.
  const reApprove = await fetch(`${BASE}/api/admin/seller-onboarding/${applicationId}/approve`, {
    method: "POST",
    headers: { cookie: cookieAdmin },
  });
  console.log(`  note  re-approve returned HTTP ${reApprove.status} (409 INVALID_TRANSITION expected — 'approved' is terminal)`);
  const sellerRoleRows = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, uidA), eq(userRoles.role, "seller")));
  check("re-approve did NOT duplicate the seller role", sellerRoleRows.length === 1, `rows=${sellerRoleRows.length}`);
  const [appRowNow] = await db.select().from(sellerOnboarding).where(eq(sellerOnboarding.id, applicationId));
  check("re-approve did NOT corrupt state (still approved)", appRowNow?.state === "approved", `got ${appRowNow?.state}`);
  const auditAfterReApprove = await db
    .select()
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.entityId, applicationId), eq(adminAuditLog.action, "seller_onboarding.approve")));
  check("re-approve wrote NO second audit row", auditAfterReApprove.length === 1, `rows=${auditAfterReApprove.length}`);
  check("re-approve is a controlled 409 (not a 500 crash)", reApprove.status === 409, `got ${reApprove.status}`);

  // Approved applicant can no longer touch the onboarding endpoint.
  const approvedSave = await fetch(`${BASE}/api/me/seller-onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ legalName: "x" }),
  });
  check("approved applicant save -> 409 already onboarded", approvedSave.status === 409, `got ${approvedSave.status}`);

  // ======================================================================
  section("Reject sets rejected + note, and the buyer can resubmit");
  const buyerBEmail = `applicantB+${nonce}@ovyro.local`;
  const buyerBPhone = `+1555200${(1000 + Math.floor(Math.random() * 8999)).toString()}`;
  const cookieB = await signUp(buyerBEmail, "ApplicantB#2026", "Applicant B");
  const uidB = await userId(buyerBEmail);
  await verifyPhone(cookieB, buyerBPhone);
  const submitB = await fetch(`${BASE}/api/me/seller-onboarding/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB },
    body: JSON.stringify(completeApplication),
  });
  const submitBJson = await submitB.json();
  const appIdB: string = submitBJson?.data?.id;
  check("applicant B submitted", submitB.status === 200 && submitBJson?.data?.state === "submitted");

  // Empty note is rejected by validation (400), never a 500.
  const rejectEmpty = await fetch(`${BASE}/api/admin/seller-onboarding/${appIdB}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieAdmin },
    body: JSON.stringify({ note: "" }),
  });
  check("reject with empty note -> 400", rejectEmpty.status === 400, `got ${rejectEmpty.status}`);

  const reviewNote = "Please upload a clearer identity document.";
  const reject = await fetch(`${BASE}/api/admin/seller-onboarding/${appIdB}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieAdmin },
    body: JSON.stringify({ note: reviewNote }),
  });
  const rejectJson = await reject.json();
  check("admin reject -> 200", reject.status === 200, `got ${reject.status}`);
  check("state rejected", rejectJson?.submission?.state === "rejected", `got ${rejectJson?.submission?.state}`);
  check("reject note recorded", rejectJson?.submission?.reviewNote === reviewNote);
  check("reject did NOT grant seller role", (await rolesOf(uidB)).join(",") === "buyer", `got [${await rolesOf(uidB)}]`);

  const auditReject = await db
    .select()
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.entityId, appIdB), eq(adminAuditLog.action, "seller_onboarding.reject")));
  check("admin_audit_log reject row written", auditReject.length === 1, `rows=${auditReject.length}`);

  // Buyer sees the rejection note, then edits (reopens to in_progress) and resubmits.
  const bProgress = await (await fetch(`${BASE}/api/me/seller-onboarding`, { headers: { cookie: cookieB } })).json();
  check("buyer sees rejection note on their DTO", bProgress?.data?.onboarding?.reviewNote === reviewNote);
  const reopen = await fetch(`${BASE}/api/me/seller-onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB },
    body: JSON.stringify({ legalName: "Jaya Verify B" }),
  });
  const reopenJson = await reopen.json();
  check("editing a rejected app reopens it -> in_progress", reopenJson?.data?.state === "in_progress", `got ${reopenJson?.data?.state}`);
  check("reopening clears the stale review note", reopenJson?.data?.reviewNote === null);
  const resubmit = await fetch(`${BASE}/api/me/seller-onboarding/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB },
    body: JSON.stringify(completeApplication),
  });
  const resubmitJson = await resubmit.json();
  check("buyer resubmits -> submitted", resubmit.status === 200 && resubmitJson?.data?.state === "submitted", `got ${resubmit.status}/${resubmitJson?.data?.state}`);

  // ======================================================================
  section("Role model: seller-gating + Selling toggle presence");
  const TOGGLE_MARKER = 'aria-label="Switch between browsing and selling"';
  // A plain buyer for the negative cases.
  const plainBuyerEmail = `plainbuyer+${nonce}@ovyro.local`;
  const cookiePlain = await signUp(plainBuyerEmail, "PlainBuyer#2026", "Plain Buyer");

  // Seller-gated API: anon 401, buyer 403, seller 200.
  const profAnon = await fetch(`${BASE}/api/dashboard/profile`);
  check("profile API anon -> 401", profAnon.status === 401, `got ${profAnon.status}`);
  const profBuyer = await fetch(`${BASE}/api/dashboard/profile`, { headers: { cookie: cookiePlain } });
  check("profile API plain buyer -> 403", profBuyer.status === 403, `got ${profBuyer.status}`);
  const profSeller = await fetch(`${BASE}/api/dashboard/profile`, { headers: { cookie: cookieA } });
  check("profile API approved seller -> 200", profSeller.status === 200, `got ${profSeller.status}`);

  // Seller-only dashboard sub-page redirects a plain buyer, serves the seller.
  const settingsBuyer = await fetch(`${BASE}/dashboard/settings`, { headers: { cookie: cookiePlain }, redirect: "manual" });
  check("dashboard/settings redirects a plain buyer (3xx)", settingsBuyer.status >= 300 && settingsBuyer.status < 400, `got ${settingsBuyer.status}`);
  const settingsSeller = await fetch(`${BASE}/dashboard/settings`, { headers: { cookie: cookieA } });
  check("dashboard/settings serves the seller -> 200", settingsSeller.status === 200, `got ${settingsSeller.status}`);

  // Selling toggle present for a seller, absent for a plain buyer (same page).
  const accountSellerHtml = await (await fetch(`${BASE}/account`, { headers: { cookie: cookieA } })).text();
  const accountBuyerHtml = await (await fetch(`${BASE}/account`, { headers: { cookie: cookiePlain } })).text();
  check("Selling toggle PRESENT for seller on /account", accountSellerHtml.includes(TOGGLE_MARKER));
  check("Selling toggle ABSENT for plain buyer on /account", !accountBuyerHtml.includes(TOGGLE_MARKER));

  // ======================================================================
  section("Seller profile settings persist");
  const newProfile = {
    displayName: `Jaya Land Co ${nonce}`,
    about: "Family-run agricultural land near Nashik.",
  };
  const putProfile = await fetch(`${BASE}/api/dashboard/profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify(newProfile),
  });
  check("PUT profile -> 200", putProfile.status === 200, `got ${putProfile.status}`);
  const reread = await (await fetch(`${BASE}/api/dashboard/profile`, { headers: { cookie: cookieA } })).json();
  check("profile displayName persisted across GET", reread?.data?.displayName === newProfile.displayName, `got ${reread?.data?.displayName}`);
  check("profile about persisted across GET", reread?.data?.about === newProfile.about);

  // ======================================================================
  section("Per-listing stats: owner reads, other seller 404");
  // Create + activate a listing owned by the newly-approved seller (buyer A).
  const createRes = await fetch(`${BASE}/api/dashboard/listings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify(draftListing),
  });
  const created = await createRes.json();
  const listingId: string = created?.data?.id;
  const slug: string = created?.data?.slug;
  check("seller creates a listing -> 201", createRes.status === 201, `got ${createRes.status}`);

  // R2 SHORTCUT: inject one ready photo so submit (>=1 photo) can pass.
  await db.insert(listingMedia).values({
    listingId,
    kind: "photo",
    storageKey: `verify/${nonce}/cover.jpg`,
    url: `https://media.example/${nonce}/cover.jpg`,
    thumbUrl: `https://media.example/${nonce}/cover-thumb.jpg`,
    processingStatus: "ready",
    sortOrder: 0,
    width: 1600,
    height: 1067,
  });
  await fetch(`${BASE}/api/dashboard/listings/${listingId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ to: "pending_review" }),
  });
  await fetch(`${BASE}/api/admin/listings/${listingId}/approve`, { method: "POST", headers: { cookie: cookieAdmin } });
  const [activeRow] = await db.select().from(listings).where(eq(listings.id, listingId));
  check("listing reached active", activeRow?.status === "active", `got ${activeRow?.status}`);

  // Generate a REAL view (public landing page bumps view_count) and a REAL
  // inquiry (buyer B, phone-verified, bumps lead_count via the real lead path).
  await fetch(`${BASE}/land/${slug}`);
  await fetch(`${BASE}/land/${slug}`);
  const inquiry = await fetch(`${BASE}/api/listings/${slug}/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB },
    body: JSON.stringify({ contactName: "Applicant B", contactPhone: buyerBPhone, message: "Interested", consent: true }),
  });
  check("buyer inquiry on active listing -> 201", inquiry.status === 201, `got ${inquiry.status} ${inquiry.status !== 201 ? await inquiry.text() : ""}`);

  // ANALYTICS SHORTCUT: no request path emits analytics_events yet (see report),
  // so inject a few to prove the stats SQL day-bucketing against real Postgres.
  const today = new Date();
  const tenDaysAgo = new Date(today.getTime() - 10 * 86_400_000);
  await db.insert(analyticsEvents).values([
    { eventName: "listing_view", listingId, occurredAt: today },
    { eventName: "listing_view", listingId, occurredAt: today },
    { eventName: "save", listingId, occurredAt: today },
    { eventName: "inquiry_submitted", listingId, occurredAt: today },
    { eventName: "listing_view", listingId, occurredAt: tenDaysAgo },
  ]);

  const [counterRow] = await db
    .select({ v: listings.viewCount, s: listings.saveCount, l: listings.leadCount })
    .from(listings)
    .where(eq(listings.id, listingId));

  const statsRes = await fetch(`${BASE}/api/dashboard/listings/${listingId}/stats`, { headers: { cookie: cookieA } });
  const stats = (await statsRes.json())?.data;
  check("owner stats -> 200", statsRes.status === 200, `got ${statsRes.status}`);
  check("stats payload has views/saves/inquiries metrics", Boolean(stats?.metrics?.views && stats?.metrics?.saves && stats?.metrics?.inquiries));
  check("7-day sparkline has 7 points", stats?.metrics?.views?.daily7?.length === 7, `got ${stats?.metrics?.views?.daily7?.length}`);
  check("30-day sparkline has 30 points", stats?.metrics?.views?.daily30?.length === 30, `got ${stats?.metrics?.views?.daily30?.length}`);
  check("views total reflects real view_count counter", stats?.metrics?.views?.total === counterRow?.v, `stats=${stats?.metrics?.views?.total} db=${counterRow?.v}`);
  check("inquiries total reflects real lead_count counter", stats?.metrics?.inquiries?.total === counterRow?.l, `stats=${stats?.metrics?.inquiries?.total} db=${counterRow?.l}`);
  check("injected views bucket into last7 (today=2, 10d-ago excluded)", stats?.metrics?.views?.last7 === 2, `got ${stats?.metrics?.views?.last7}`);
  check("injected views bucket into last30 (today + 10d-ago = 3)", stats?.metrics?.views?.last30 === 3, `got ${stats?.metrics?.views?.last30}`);
  check("injected save event surfaces in last7", stats?.metrics?.saves?.last7 === 1, `got ${stats?.metrics?.saves?.last7}`);
  check("injected inquiry event surfaces in last7", stats?.metrics?.inquiries?.last7 === 1, `got ${stats?.metrics?.inquiries?.last7}`);

  // A different seller (the demo seller) must NOT see this listing's stats.
  const cookieDemo = await signIn("seller@ovyro.local", "DemoSeller#2026");
  const otherStats = await fetch(`${BASE}/api/dashboard/listings/${listingId}/stats`, { headers: { cookie: cookieDemo } });
  check("other seller reads this listing's stats -> 404", otherStats.status === 404, `got ${otherStats.status}`);

  // ======================================================================
  section("Regression: a seller cannot inquire on their own listing (Phase 2 guard)");
  const selfInquiry = await fetch(`${BASE}/api/listings/${slug}/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ contactName: "Jaya", contactPhone: buyerAPhone, message: "mine", consent: true }),
  });
  check("owning seller inquires on own listing -> 403", selfInquiry.status === 403, `got ${selfInquiry.status}`);

  console.log(`\n== Phase 3.5 E2E result: ${passed} passed, ${failed} failed ==\n`);
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("P3 E2E driver crashed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
