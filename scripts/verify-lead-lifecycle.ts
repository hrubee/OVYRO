/**
 * Phase 2.5 integration verification driver (OVYRO-92ca).
 *
 * Drives the full LEAD + LISTS lifecycle against the REAL running HTTP server, a
 * REAL Postgres, and a REAL Redis/BullMQ worker — exercising the cross-wave seams
 * the per-wave worktrees (leads-core, OTP, inquiry-submission, seller-inbox,
 * buyer-account) could not test in isolation:
 *
 *   register buyer -> dev-mode phone OTP -> submit inquiry -> lead row + 2 emails
 *   enqueued/dequeued -> anon/unverified/self-inquiry blocked -> burst rate-limit
 *   -> seller inbox scoping + status machine -> buyer My-Inquiries + saved lists.
 *
 * Not part of the shipped app; a repeatable manual gate. Prereqs:
 *   - `bun run start` (production server) on :3000,
 *   - Postgres migrated + admin + demo seeded (scripts/dev-setup.sh style),
 *   - Redis up and `bun run worker` running (drains the email queue).
 *
 *   bun run scripts/verify-lead-lifecycle.ts
 *
 * NO cloud creds needed: Twilio (OTP), Resend (email), and Turnstile (CAPTCHA)
 * all run their env-guarded dev/no-op paths. The dev OTP code is a fixed
 * "000000" and email sends no-op inside the worker (jobs still complete).
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { grantRole } from "@/lib/auth/session";
import { leads, listItems, listings, users } from "@/lib/db/schema";
import { closeQueues, closeRedisConnection, getQueue, getRedisConnection } from "@/lib/queue";
import { DEV_OTP_CODE } from "@/lib/auth/phone-otp";

const BASE = "http://127.0.0.1:3000";
const SELLER_EMAIL = "seller@ovyro.local";
const SELLER_PASSWORD = "DemoSeller#2026";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Better Auth rate-limits its own endpoints (spec §12). This driver legitimately
 * creates several accounts back-to-back, so it backs off and retries on a 429 —
 * exactly what a well-behaved client does — rather than treating the protection
 * as a failure.
 */
async function authFetch(path: string, payload: unknown): Promise<Response> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status !== 429) return res;
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`${path} still rate-limited after retries`);
}

async function signUp(email: string, password: string, name: string): Promise<string> {
  const res = await authFetch(`/api/auth/sign-up/email`, { email, password, name });
  if (!res.ok) throw new Error(`sign-up ${email} failed: ${res.status} ${await res.text()}`);
  return cookieHeader(res);
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await authFetch(`/api/auth/sign-in/email`, { email, password });
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

/** Run the dev-mode phone-OTP flow for a signed-in cookie; returns the phone. */
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

function inquiryBody(overrides: Record<string, unknown> = {}) {
  return {
    contactName: "Test Buyer",
    contactPhone: "+15551239999",
    preferredContact: "phone",
    consent: true,
    website: "", // honeypot — must stay empty
    captchaToken: "", // CAPTCHA not configured (dev) — server skips verification
    offerAmount: 3900000,
    message: "Is the road access year-round?",
    ...overrides,
  };
}

async function submitInquiry(cookie: string | null, slug: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return fetch(`${BASE}/api/listings/${slug}/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const nonce = Math.floor(performance.now() * 1000).toString(36);
// Phone numbers must be digits-only (the OTP schema regex is /^\+?[0-9]{7,15}$/),
// so derive a purely-numeric per-run suffix rather than reusing the base36 nonce.
const numId = Math.floor(performance.now() * 1000).toString().replace(/\D/g, "").slice(-5).padStart(5, "0");
const phoneB1 = `+1555${numId}01`;
const phoneB3 = `+1555${numId}02`;

async function main(): Promise<void> {
  console.log("\n== Lead + Lists lifecycle E2E (real HTTP + Postgres + Redis worker) ==\n");

  // Reset the sliding-window rate-limit state (rl:* — lead + OTP limiters) so a
  // re-run starts clean: the demo seller and the shared 127.0.0.1 IP are reused
  // across runs, and their per-listing/per-IP windows would otherwise leak
  // 429s into the self-inquiry and burst assertions. BullMQ (bull:*) and Better
  // Auth state are untouched. This resets ONLY the throttle counters, never data.
  const redis = getRedisConnection();
  const rlKeys = await redis.keys("rl:*");
  if (rlKeys.length) await redis.del(...rlKeys);
  console.log(`  (reset ${rlKeys.length} rate-limit keys)\n`);

  // --- Pick four distinct active demo listings ----------------------------
  const active = await db
    .select({
      id: listings.id,
      slug: listings.slug,
      sellerId: listings.sellerId,
      price: listings.price,
      currency: listings.currency,
    })
    .from(listings)
    .where(and(eq(listings.status, "active"), isNull(listings.deletedAt)))
    .limit(8);
  check("demo has >= 4 active listings", active.length >= 4, `got ${active.length}`);
  if (active.length < 4) throw new Error("need >= 4 active demo listings — run seed:demo");
  const [lMain, lUnverified, lSelf, lBurst] = active;

  const sellerId = await userId(SELLER_EMAIL);
  check(
    "demo listings are owned by the demo seller",
    active.every((l) => l.sellerId === sellerId),
  );

  // --- Actors -------------------------------------------------------------
  const cookieSeller = await signIn(SELLER_EMAIL, SELLER_PASSWORD);
  const buyer1 = `buyer1+${nonce}@ovyro.local`;
  const buyer2 = `buyer2+${nonce}@ovyro.local`;
  const buyer3 = `buyer3+${nonce}@ovyro.local`;
  const sellerB = `sellerB+${nonce}@ovyro.local`;
  const cookieB1 = await signUp(buyer1, "buyer1-pass-123", "Buyer One");
  const cookieB2 = await signUp(buyer2, "buyer2-pass-123", "Buyer Two");
  const cookieB3 = await signUp(buyer3, "buyer3-pass-123", "Buyer Three");
  const cookieSB = await signUp(sellerB, "sellerB-pass-123", "Second Seller");
  await grantRole(await userId(sellerB), "seller");
  check("demo seller + 3 buyers + 2nd seller authenticated", Boolean(cookieSeller && cookieB1 && cookieB2 && cookieB3 && cookieSB));

  // === 1. Phone verification via the dev-mode OTP flow =====================
  const verifyRes = await verifyPhone(cookieB1, phoneB1);
  const verifyJson = await verifyRes.json().catch(() => ({}));
  check("OTP verify -> 200", verifyRes.status === 200, `got ${verifyRes.status}`);
  check("OTP verify body verified:true", verifyJson?.verified === true);
  const [b1Row] = await db
    .select({ phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, await userId(buyer1)))
    .limit(1);
  check("users.phone_verified_at is set for buyer1", b1Row?.phoneVerifiedAt != null);

  // Verify buyer3 too (needed to hit rate-limit, not the phone wall, in the burst).
  await verifyPhone(cookieB3, phoneB3);

  // === 2. Submit an inquiry -> lead row + emails enqueued/dequeued =========
  const emailQueue = getQueue("email");
  const before = await emailQueue.getJobCounts("completed", "waiting", "active", "failed", "delayed");
  const completedBefore = before.completed ?? 0;

  const inqRes = await submitInquiry(cookieB1, lMain.slug, inquiryBody());
  const inqJson = await inqRes.json().catch(() => ({}));
  check("verified buyer inquiry -> 201", inqRes.status === 201, `got ${inqRes.status} ${JSON.stringify(inqJson)}`);
  const leadId: string | undefined = inqJson?.lead?.id;
  check("inquiry response carries a lead id", Boolean(leadId));
  check("inquiry response does NOT leak meta_event_id", inqJson?.lead?.metaEventId === undefined);

  const [leadRow] = leadId
    ? await db.select().from(leads).where(eq(leads.id, leadId)).limit(1)
    : [];
  check("lead row persisted", Boolean(leadRow));
  check("lead.consent_at stamped", leadRow?.consentAt != null);
  check("lead.meta_event_id minted (Meta CAPI dedup)", Boolean(leadRow?.metaEventId));
  check("lead.status = new", leadRow?.status === "new", `got ${leadRow?.status}`);
  check("lead.seller_id denormalized to listing owner", leadRow?.sellerId === sellerId);
  check("lead.buyer_id = buyer1", leadRow?.buyerId === (await userId(buyer1)));

  // Emails: both the seller notification and the buyer confirmation must be
  // enqueued on the `email` queue AND drained by the running worker.
  let completedAfter = completedBefore;
  for (let i = 0; i < 40; i++) {
    const counts = await emailQueue.getJobCounts("completed", "waiting", "active", "failed");
    completedAfter = counts.completed ?? 0;
    if (completedAfter - completedBefore >= 2 && (counts.waiting ?? 0) === 0 && (counts.active ?? 0) === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  check(
    "2 emails enqueued AND dequeued by worker (seller + buyer)",
    completedAfter - completedBefore >= 2,
    `completed delta ${completedAfter - completedBefore}`,
  );

  // === 3. Anonymous / unverified / self-inquiry are blocked ================
  const anon = await submitInquiry(null, lMain.slug, inquiryBody());
  check("anonymous inquiry -> 401", anon.status === 401, `got ${anon.status}`);

  const unverified = await submitInquiry(cookieB2, lUnverified.slug, inquiryBody());
  const unverifiedJson = await unverified.json().catch(() => ({}));
  check("unverified-phone inquiry -> 403", unverified.status === 403, `got ${unverified.status}`);
  check("unverified error code PHONE_NOT_VERIFIED", unverifiedJson?.error?.code === "PHONE_NOT_VERIFIED", JSON.stringify(unverifiedJson));

  const self = await submitInquiry(cookieSeller, lSelf.slug, inquiryBody());
  const selfJson = await self.json().catch(() => ({}));
  check("seller inquiry on own listing -> 403", self.status === 403, `got ${self.status}`);
  check("self-inquiry error code SELF_INQUIRY", selfJson?.error?.code === "SELF_INQUIRY", JSON.stringify(selfJson));

  // === 4. A 20-inquiry burst is rate-limited ==============================
  const statuses: number[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await submitInquiry(cookieB3, lBurst.slug, inquiryBody());
    statuses.push(r.status);
  }
  const ok201 = statuses.filter((s) => s === 201).length;
  const limited = statuses.filter((s) => s === 429).length;
  check("burst: first inquiry accepted (201)", statuses[0] === 201, `got ${statuses[0]}`);
  check("burst: >= 1 request rate-limited (429)", limited >= 1, `201=${ok201} 429=${limited}`);
  check("burst: no request slipped past as 5xx", !statuses.some((s) => s >= 500), statuses.join(","));

  // === 5. Seller inbox: scoped to the owning seller, status machine =======
  const inboxRes = await fetch(`${BASE}/api/dashboard/leads`, { headers: { cookie: cookieSeller } });
  const inboxJson = await inboxRes.json().catch(() => ({}));
  const inboxLeads: Array<{ id: string }> = inboxJson?.data ?? [];
  check("seller inbox -> 200", inboxRes.status === 200, `got ${inboxRes.status}`);
  check("owning seller sees buyer1's lead", inboxLeads.some((l) => l.id === leadId));

  const otherInboxRes = await fetch(`${BASE}/api/dashboard/leads`, { headers: { cookie: cookieSB } });
  const otherInboxJson = await otherInboxRes.json().catch(() => ({}));
  const otherLeads: Array<{ id: string }> = otherInboxJson?.data ?? [];
  check("second seller does NOT see buyer1's lead", !otherLeads.some((l) => l.id === leadId));

  // second seller PATCHing buyer1's lead → 404 (ownership never disclosed as 403)
  const foreignPatch = await fetch(`${BASE}/api/dashboard/leads/${leadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieSB },
    body: JSON.stringify({ status: "contacted" }),
  });
  check("non-owning seller PATCH -> 404", foreignPatch.status === 404, `got ${foreignPatch.status}`);

  // legal move new → contacted
  const legal = await fetch(`${BASE}/api/dashboard/leads/${leadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieSeller },
    body: JSON.stringify({ status: "contacted" }),
  });
  const legalJson = await legal.json().catch(() => ({}));
  check("status new -> contacted -> 200", legal.status === 200, `got ${legal.status}`);
  check("lead now contacted", legalJson?.data?.status === "contacted", JSON.stringify(legalJson?.data?.status));
  const [afterMove] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId!)).limit(1);
  check("status transition persisted in DB", afterMove?.status === "contacted", `got ${afterMove?.status}`);

  // illegal jump contacted → won (skips negotiating)
  const illegal = await fetch(`${BASE}/api/dashboard/leads/${leadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieSeller },
    body: JSON.stringify({ status: "won" }),
  });
  const illegalJson = await illegal.json().catch(() => ({}));
  check("illegal jump contacted -> won -> 409", illegal.status === 409, `got ${illegal.status}`);
  check("illegal jump error INVALID_TRANSITION", illegalJson?.error?.code === "INVALID_TRANSITION", JSON.stringify(illegalJson));

  // === 6. Buyer side: My Inquiries + saved lists ==========================
  const myInq = await fetch(`${BASE}/api/me/inquiries`, { headers: { cookie: cookieB1 } });
  const myInqJson = await myInq.json().catch(() => ({}));
  // My-Inquiries returns { lead, listing } pairs (buyer/_lib/repo BuyerInquiryDTO).
  const myLeads: Array<{ lead: { id: string }; listing: { id: string } }> = myInqJson?.data ?? [];
  check("buyer My-Inquiries -> 200", myInq.status === 200, `got ${myInq.status}`);
  check("buyer sees their own inquiry", myLeads.some((l) => l.lead?.id === leadId));
  check("My-Inquiries pairs the lead with its listing", myLeads.some((l) => l.lead?.id === leadId && l.listing?.id === lMain.id));

  // saved lists: create a custom list, save the listing, assert price_at_save snapshot
  const createList = await fetch(`${BASE}/api/me/lists`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB1 },
    body: JSON.stringify({ name: `Watchlist ${nonce}` }),
  });
  const createListJson = await createList.json().catch(() => ({}));
  const listId: string | undefined = createListJson?.data?.id;
  check("create custom list -> 201", createList.status === 201, `got ${createList.status}`);
  check("custom list has an id", Boolean(listId));

  const save = await fetch(`${BASE}/api/me/lists/${listId}/items/${lMain.id}`, {
    method: "PUT",
    headers: { cookie: cookieB1 },
  });
  const saveJson = await save.json().catch(() => ({}));
  check("save listing to list -> 201", save.status === 201, `got ${save.status}`);
  check(
    "price_at_save snapshots the listing price",
    Number(saveJson?.data?.priceAtSave) === Number(lMain.price),
    `snap=${saveJson?.data?.priceAtSave} listing=${lMain.price}`,
  );
  const [itemRow] = listId
    ? await db
        .select({ priceAtSave: listItems.priceAtSave })
        .from(listItems)
        .where(and(eq(listItems.listId, listId), eq(listItems.listingId, lMain.id)))
        .limit(1)
    : [];
  check("list_items.price_at_save persisted in DB", Number(itemRow?.priceAtSave) === Number(lMain.price), `got ${itemRow?.priceAtSave}`);

  // lists CRUD is auth-gated: anonymous → 401
  const anonLists = await fetch(`${BASE}/api/me/lists`);
  check("anonymous GET /api/me/lists -> 401", anonLists.status === 401, `got ${anonLists.status}`);
  const anonSave = await fetch(`${BASE}/api/me/lists/${listId}/items/${lMain.id}`, { method: "PUT" });
  check("anonymous save -> 401", anonSave.status === 401, `got ${anonSave.status}`);

  console.log(`\n== E2E result: ${passed} passed, ${failed} failed ==\n`);

  await closeQueues();
  await closeRedisConnection();
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("Lead E2E driver crashed:", err);
  try {
    await closeQueues();
    await closeRedisConnection();
    await pool.end();
  } catch {}
  process.exit(1);
});
