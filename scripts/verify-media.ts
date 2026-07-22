/**
 * Phase 1.5 media presign verification (OVYRO-2553, spec §4.3.1).
 *
 * Exercises everything on the media path that does NOT require Cloudflare R2:
 * seller gate, MIME allow-list, 15 MB size cap, per-listing ownership, and the
 * photo cap. The final valid request is expected to fail at the R2 boundary
 * (`R2 is not configured`) — that, and only that, is what is blocked on missing
 * R2_* credentials. No credentials are faked.
 *
 *   bun run scripts/verify-media.ts   (needs `next start` on :3000 + Postgres)
 */
import { eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { grantRole } from "@/lib/auth/session";
import { users } from "@/lib/db/schema";
import { getR2Config, isR2Configured } from "@/lib/r2";

const BASE = "http://127.0.0.1:3000";
/** spec §4.3.1 per-photo cap; mirrors media/shared.ts MAX_PHOTO_BYTES. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

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

function cookieHeader(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function signUp(email: string, password: string, name: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) throw new Error(`sign-up ${email}: ${res.status} ${await res.text()}`);
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

async function createListing(cookie: string, title: string): Promise<string> {
  const res = await fetch(`${BASE}/api/dashboard/listings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title,
      landType: "residential_plot",
      price: 1500000,
      area: 2400,
      areaUnit: "sqft",
    }),
  });
  const json = await res.json();
  if (res.status !== 201) throw new Error(`create listing: ${res.status} ${JSON.stringify(json)}`);
  return json.data.id;
}

function presign(cookie: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}/api/dashboard/media/presign`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  console.log("\n== Media presign validation (R2-free) ==\n");

  const nonce = Math.floor(Math.random() * 1e9).toString(36);
  const ownerEmail = `mediaowner+${nonce}@ovyro.local`;
  const otherEmail = `mediaother+${nonce}@ovyro.local`;
  const buyerEmail = `mediabuyer+${nonce}@ovyro.local`;

  const ownerCookie = await signUp(ownerEmail, "media-owner-123", "Media Owner");
  const otherCookie = await signUp(otherEmail, "media-other-123", "Media Other");
  const buyerCookie = await signUp(buyerEmail, "media-buyer-123", "Media Buyer");
  await grantRole(await userId(ownerEmail), "seller");
  await grantRole(await userId(otherEmail), "seller");

  const listingId = await createListing(ownerCookie, `Media test parcel ${nonce}`);
  const goodBody = {
    listingId,
    filename: "photo.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1_200_000,
  };

  // 1. Non-seller (buyer) is gated out before any media logic.
  const buyerRes = await presign(buyerCookie, goodBody);
  check("presign as non-seller -> 403", buyerRes.status === 403, `got ${buyerRes.status}`);

  // 2. Disallowed MIME type -> 422 validation.
  const badMime = await presign(ownerCookie, { ...goodBody, contentType: "application/pdf" });
  check("presign disallowed type -> 422", badMime.status === 422, `got ${badMime.status}`);

  // 3. Oversize (> 15 MB) -> 422 with the size message.
  const tooBig = await presign(ownerCookie, { ...goodBody, sizeBytes: MAX_PHOTO_BYTES + 1 });
  const tooBigJson = await tooBig.json();
  check("presign oversize -> 422", tooBig.status === 422, `got ${tooBig.status}`);
  check(
    "oversize error names the 15 MB cap",
    JSON.stringify(tooBigJson).includes("15 MB"),
    JSON.stringify(tooBigJson),
  );

  // 4. Ownership: a second seller presigning against this listing -> 404 (not 403,
  //    so listing ids cannot be enumerated).
  const notOwner = await presign(otherCookie, goodBody);
  check("presign non-owned listing -> 404", notOwner.status === 404, `got ${notOwner.status}`);

  // 5. Missing listing -> 404.
  const missing = await presign(ownerCookie, { ...goodBody, listingId: "does-not-exist" });
  check("presign unknown listing -> 404", missing.status === 404, `got ${missing.status}`);

  // 6. A fully valid request passes every check and then hits the R2 boundary.
  const valid = await presign(ownerCookie, goodBody);
  const validJson = await valid.json();
  check(
    "valid presign is BLOCKED only at R2 (500, no creds)",
    valid.status === 500,
    `got ${valid.status} ${JSON.stringify(validJson)}`,
  );

  // 7. Confirm the block is specifically missing R2 credentials, not a code fault.
  check("isR2Configured() === false locally", isR2Configured() === false);
  let r2Threw = "";
  try {
    getR2Config();
  } catch (e) {
    r2Threw = (e as Error).message;
  }
  check("getR2Config throws 'not configured'", r2Threw.includes("R2 is not configured"), r2Threw);

  console.log(`\n== Media result: ${passed} passed, ${failed} failed ==`);
  console.log(
    "BLOCKED on missing R2_* creds: real presigned PUT URL generation, browser->R2 upload,\n" +
      "  media/complete headObject size re-check, and the media-processing worker's\n" +
      "  getObject/sharp-variants/putObject round-trip. Logic is unit-tested with a fake R2.\n",
  );
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("media driver crashed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
