/**
 * Phase 1.5 integration verification driver (OVYRO-2553).
 *
 * Drives the full listing lifecycle against the REAL running HTTP server and a
 * REAL Postgres, exercising the cross-module seams the per-wave worktrees could
 * not: seller create -> submit gate -> ownership -> admin approve -> public
 * detail/browse. Not part of the shipped app; a repeatable manual gate.
 *
 * Prereqs: `next start` on :3000, Postgres migrated + admin seeded, Redis up.
 *   bun run scripts/verify-lifecycle.ts
 *
 * MEDIA CAVEAT: no R2 credentials exist, so a completed photo cannot be uploaded
 * through the presign/complete path. To reach `active` (submit requires >=1
 * photo) this injects one `listing_media` row directly at the DB level. That is
 * the ONLY R2 shortcut taken and is called out at the injection site.
 */
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { grantRole } from "@/lib/auth/session";
import { adminAuditLog, listingMedia, listings, users } from "@/lib/db/schema";

const BASE = "http://127.0.0.1:3000";
const ADMIN_EMAIL = "admin@ovyro.local";
const ADMIN_PASSWORD = "AdminPass1!verify";

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
  return cookieHeader(res);
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
  // Better Auth stores emails lowercased; match that when looking the user up.
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!row) throw new Error(`no user ${email}`);
  return row.id;
}

const nonce = Math.floor(Math.random() * 1e9).toString(36);
const draftListing = {
  title: `Riverside pasture verify ${nonce}`,
  description: "Gently sloping riverside pasture with road frontage.",
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
  console.log("\n== Listing lifecycle E2E (real HTTP + Postgres) ==\n");

  // --- Actors -------------------------------------------------------------
  const sellerA = `sellerA+${nonce}@ovyro.local`;
  const sellerB = `sellerB+${nonce}@ovyro.local`;
  const cookieA = await signUp(sellerA, "sellerA-pass-123", "Seller A");
  const cookieB = await signUp(sellerB, "sellerB-pass-123", "Seller B");
  await grantRole(await userId(sellerA), "seller");
  await grantRole(await userId(sellerB), "seller");
  const cookieAdmin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  check("two sellers + admin authenticated", Boolean(cookieA && cookieB && cookieAdmin));

  // --- Non-seller is 403 on create ---------------------------------------
  const buyerEmail = `buyer+${nonce}@ovyro.local`;
  const cookieBuyer = await signUp(buyerEmail, "buyer-pass-1234", "Plain Buyer");
  const buyerCreate = await fetch(`${BASE}/api/dashboard/listings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieBuyer },
    body: JSON.stringify(draftListing),
  });
  check("non-seller create -> 403", buyerCreate.status === 403, `got ${buyerCreate.status}`);

  // --- Create draft as seller A ------------------------------------------
  const createRes = await fetch(`${BASE}/api/dashboard/listings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify(draftListing),
  });
  const created = await createRes.json();
  const listingId: string = created?.data?.id;
  const slug: string = created?.data?.slug;
  check("create draft -> 201", createRes.status === 201, `got ${createRes.status}`);
  check("draft status = draft", created?.data?.status === "draft", `got ${created?.data?.status}`);
  check("draft has a slug", Boolean(slug));

  // --- Submit blocked with zero photos (422) -----------------------------
  const submitNoPhoto = await fetch(`${BASE}/api/dashboard/listings/${listingId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ to: "pending_review" }),
  });
  check("submit with 0 photos -> 422", submitNoPhoto.status === 422, `got ${submitNoPhoto.status}`);

  // --- Ownership: seller B gets 404 on A's listing (never 403) -----------
  const bReadsA = await fetch(`${BASE}/api/dashboard/listings/${listingId}`, { headers: { cookie: cookieB } });
  check("other seller reads A's listing -> 404", bReadsA.status === 404, `got ${bReadsA.status}`);
  const bSubmitsA = await fetch(`${BASE}/api/dashboard/listings/${listingId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB },
    body: JSON.stringify({ to: "pending_review" }),
  });
  check("other seller submits A's listing -> 404", bSubmitsA.status === 404, `got ${bSubmitsA.status}`);

  // --- Not public while draft --------------------------------------------
  const draftApi = await fetch(`${BASE}/api/listings/${slug}`);
  check("draft public detail API -> 404", draftApi.status === 404, `got ${draftApi.status}`);
  const draftPage = await fetch(`${BASE}/land/${slug}`);
  check("draft public detail page -> 404", draftPage.status === 404, `got ${draftPage.status}`);

  // --- Inject one photo row (R2 SHORTCUT — no creds to upload for real) ---
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

  // --- Submit now succeeds -> pending_review -----------------------------
  const submitOk = await fetch(`${BASE}/api/dashboard/listings/${listingId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ to: "pending_review" }),
  });
  const submitted = await submitOk.json();
  check("submit with a photo -> 200", submitOk.status === 200, `got ${submitOk.status}`);
  check("status now pending_review", submitted?.data?.status === "pending_review", `got ${submitted?.data?.status}`);

  // --- Not public while pending ------------------------------------------
  const pendingApi = await fetch(`${BASE}/api/listings/${slug}`);
  check("pending public detail API -> 404", pendingApi.status === 404, `got ${pendingApi.status}`);

  // --- Admin approves -----------------------------------------------------
  const approveRes = await fetch(`${BASE}/api/admin/listings/${listingId}/approve`, {
    method: "POST",
    headers: { cookie: cookieAdmin },
  });
  const approved = await approveRes.json();
  check("admin approve -> 200", approveRes.status === 200, `got ${approveRes.status}`);
  check("approved status = active", approved?.listing?.status === "active", `got ${approved?.listing?.status}`);

  // Non-admin cannot approve (seller B).
  const bApproves = await fetch(`${BASE}/api/admin/listings/${listingId}/approve`, {
    method: "POST",
    headers: { cookie: cookieB },
  });
  check("non-admin approve -> 403", bApproves.status === 403, `got ${bApproves.status}`);

  // --- DB side effects of approval ---------------------------------------
  const [row] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  check("published_at set", row?.publishedAt != null);
  check("expires_at set", row?.expiresAt != null);
  if (row?.publishedAt && row?.expiresAt) {
    const days = (row.expiresAt.getTime() - row.publishedAt.getTime()) / 86_400_000;
    check("expiry ~90 days from publish", Math.round(days) === 90, `got ${days.toFixed(1)}d`);
  }
  const audit = await db
    .select()
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.entityId, listingId), eq(adminAuditLog.action, "listing.approve")));
  check("admin_audit_log row written", audit.length === 1, `rows=${audit.length}`);
  check(
    "audit before/after snapshot present",
    audit[0]?.beforeJsonb != null && audit[0]?.afterJsonb != null,
  );

  // --- Public detail now reachable with OG tags --------------------------
  const liveApi = await fetch(`${BASE}/api/listings/${slug}`);
  const liveJson = await liveApi.json();
  check("active public detail API -> 200", liveApi.status === 200, `got ${liveApi.status}`);
  check("public detail returns the slug", liveJson?.slug === slug);

  const livePage = await fetch(`${BASE}/land/${slug}`);
  const html = await livePage.text();
  check("active public detail page -> 200", livePage.status === 200, `got ${livePage.status}`);
  check("page renders listing title", html.includes(draftListing.title));
  check(
    'og:title present',
    html.includes('property="og:title"') && html.includes(draftListing.title),
  );
  check("og:url / canonical present", html.includes('property="og:url"') && html.includes(`/land/${slug}`));
  check("twitter card present", html.includes('name="twitter:card"'));

  // --- Browse: filter + FTS return only the active listing ---------------
  const byFilter = await fetch(`${BASE}/api/listings?landType=agricultural`);
  const filterJson = await byFilter.json();
  const filterHit = (filterJson.items ?? filterJson.listings ?? []).some(
    (l: { slug?: string }) => l.slug === slug,
  );
  check("browse filter returns active listing", byFilter.status === 200 && filterHit);

  const byFts = await fetch(`${BASE}/api/listings?q=riverside`);
  const ftsJson = await byFts.json();
  const ftsItems = ftsJson.items ?? ftsJson.listings ?? [];
  const ftsHit = ftsItems.some((l: { slug?: string }) => l.slug === slug);
  check("FTS q=riverside returns active listing", byFts.status === 200 && ftsHit);

  // --- A second draft must NOT leak into browse --------------------------
  const secondRes = await fetch(`${BASE}/api/dashboard/listings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ ...draftListing, title: `Hidden draft ${nonce}` }),
  });
  const second = await secondRes.json();
  const secondSlug: string = second?.data?.slug;
  const allActive = await fetch(`${BASE}/api/listings?limit=48`);
  const allJson = await allActive.json();
  const allItems = allJson.items ?? allJson.listings ?? [];
  check(
    "draft listing absent from browse",
    !allItems.some((l: { slug?: string }) => l.slug === secondSlug),
  );

  console.log(`\n== E2E result: ${passed} passed, ${failed} failed ==\n`);
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("E2E driver crashed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
