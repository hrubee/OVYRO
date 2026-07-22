/**
 * Idempotent demo seed: a populated marketplace for local development.
 *
 * Bootstraps a single demo seller and ~8 active, non-deleted listings spread
 * across land types, cities, and price/area ranges so browse, filters, sort,
 * and full-text search all have real content. Each listing gets `listing_media`
 * rows pointing at publicly-reachable picsum.photos placeholders with
 * `processing_status = 'ready'` and a blurhash, so cards and the gallery render
 * without R2, Mux, or the media worker.
 *
 *   bun run seed:demo        # or: bun run scripts/seed-demo.ts
 *
 * Re-running is safe: the seller is looked up by email, listings by
 * (seller, slug), and each listing's media is rebuilt from scratch. Every run
 * also refreshes `published_at`/`expires_at`, so the demo never drifts into an
 * expired state.
 *
 * Env: SELLER_EMAIL (default seller@ovyro.local), SELLER_PASSWORD
 * (default below — printed once on create so you can log in as the seller).
 */
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, pool } from "@/lib/db";
import {
  listingMedia,
  listings,
  sellerProfiles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { slugify, type AreaUnit, type LandType } from "@/lib/listings";

const SELLER_EMAIL = (process.env.SELLER_EMAIL ?? "seller@ovyro.local").toLowerCase();
const SELLER_PASSWORD = process.env.SELLER_PASSWORD ?? "DemoSeller#2026";
const SELLER_NAME = "Demo Land Co.";
const SELLER_DISPLAY_NAME = "Green Valley Estates";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number): Date => new Date(now - n * DAY_MS);
/** All demo listings stay live for 60 more days — comfortably un-expired. */
const EXPIRES_AT = new Date(now + 60 * DAY_MS);

/**
 * Canonical, known-valid blurhash strings (from the blurhash reference set).
 * Cycled across photos so `listing_media.blurhash` is always populated with a
 * decodable value, matching what the media worker would write in production.
 */
const BLURHASHES = [
  "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
  "LGF5]+Yk^6#M@-5c,1J5@[or[Q6.",
  "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
  "LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
] as const;

interface ListingSpec {
  title: string;
  description: string;
  landType: LandType;
  price: string;
  area: string;
  areaUnit: AreaUnit;
  addressText: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  surveyNumber: string | null;
  zoning: string | null;
  roadAccess: boolean;
  water: boolean;
  electricity: boolean;
  legalDocsAvailable: boolean;
  negotiable: boolean;
  featured: boolean;
  publishedAt: Date;
  photoCount: number;
}

/**
 * Eight listings, deliberately varied so every browse control has something to
 * do: six land types, six regions, prices from ₹28L to ₹3.5Cr, five area units,
 * and distinctive keywords (river, highway, GIDC, farmhouse, coconut) for FTS.
 * `publishedAt` is spread over the last month so `sort=newest` has a real order.
 */
const LISTINGS: ListingSpec[] = [
  {
    title: "5-Acre Riverfront Agricultural Land in Nashik",
    description:
      "Fertile black-soil parcel on the banks of the Godavari river, currently " +
      "under grape cultivation. Perennial water, drip irrigation in place, and a " +
      "tar road right up to the boundary. Ideal for a vineyard or farmhouse.",
    landType: "agricultural",
    price: "4500000",
    area: "5",
    areaUnit: "acre",
    addressText: "Gangapur Road, Nashik, Maharashtra",
    city: "Nashik",
    region: "Maharashtra",
    lat: 19.9975,
    lng: 73.7898,
    surveyNumber: "Survey No. 142/2",
    zoning: "Agricultural (green zone)",
    roadAccess: true,
    water: true,
    electricity: false,
    legalDocsAvailable: true,
    negotiable: true,
    featured: true,
    publishedAt: daysAgo(2),
    photoCount: 4,
  },
  {
    title: "NA Residential Corner Plot in Pune",
    description:
      "Clear-title NA corner plot inside a gated residential layout in Wagholi. " +
      "Two-side open, ready for immediate construction, with underground water, " +
      "electricity, and internal cement roads. Walking distance to schools.",
    landType: "residential_plot",
    price: "8500000",
    area: "2400",
    areaUnit: "sqft",
    addressText: "Wagholi, Pune, Maharashtra",
    city: "Pune",
    region: "Maharashtra",
    lat: 18.5793,
    lng: 74.0089,
    surveyNumber: "Plot No. 27",
    zoning: "Residential (NA)",
    roadAccess: true,
    water: true,
    electricity: true,
    legalDocsAvailable: true,
    negotiable: false,
    featured: false,
    publishedAt: daysAgo(5),
    photoCount: 3,
  },
  {
    title: "Commercial Highway-Facing Plot, Bengaluru",
    description:
      "Prime commercial land with 120 ft of frontage on the highway near the IT " +
      "corridor. High visibility, suited to a showroom, retail block, or office. " +
      "Approved commercial zoning and three-phase electricity available.",
    landType: "commercial",
    price: "35000000",
    area: "6000",
    areaUnit: "sqft",
    addressText: "Outer Ring Road, Bengaluru, Karnataka",
    city: "Bengaluru",
    region: "Karnataka",
    lat: 12.9716,
    lng: 77.5946,
    surveyNumber: "Khata No. 88/1",
    zoning: "Commercial",
    roadAccess: true,
    water: false,
    electricity: true,
    legalDocsAvailable: true,
    negotiable: true,
    featured: true,
    publishedAt: daysAgo(8),
    photoCount: 4,
  },
  {
    title: "Industrial Land in GIDC, Ahmedabad",
    description:
      "Ready-to-build industrial plot inside the GIDC estate with wide internal " +
      "roads, high-tension power, and effluent infrastructure nearby. Suits a " +
      "manufacturing unit or warehouse. All approvals and NOCs in order.",
    landType: "industrial",
    price: "12000000",
    area: "2",
    areaUnit: "hectare",
    addressText: "Sanand GIDC, Ahmedabad, Gujarat",
    city: "Ahmedabad",
    region: "Gujarat",
    lat: 22.9884,
    lng: 72.3805,
    surveyNumber: "Block No. 501",
    zoning: "Industrial",
    roadAccess: true,
    water: true,
    electricity: true,
    legalDocsAvailable: true,
    negotiable: false,
    featured: false,
    publishedAt: daysAgo(12),
    photoCount: 3,
  },
  {
    title: "1-Acre Farmhouse Plot near Lonavala",
    description:
      "Weekend getaway land with sweeping hill and valley views, a short drive " +
      "from Lonavala. Gentle slope, red-earth soil, and a seasonal stream along " +
      "one edge. Perfect for a farmhouse retreat or an orchard.",
    landType: "recreational",
    price: "6500000",
    area: "1",
    areaUnit: "acre",
    addressText: "Tungarli, Lonavala, Maharashtra",
    city: "Lonavala",
    region: "Maharashtra",
    lat: 18.7546,
    lng: 73.4062,
    surveyNumber: null,
    zoning: "Recreational / farmhouse",
    roadAccess: true,
    water: false,
    electricity: false,
    legalDocsAvailable: false,
    negotiable: true,
    featured: false,
    publishedAt: daysAgo(16),
    photoCount: 4,
  },
  {
    title: "300 sqm HMDA Villa Plot in Hyderabad",
    description:
      "HMDA-approved villa plot in a gated community with a clubhouse, parks, and " +
      "24x7 security. East-facing, clear title, and ready for registration. " +
      "Underground drainage, water, and electricity already provided.",
    landType: "residential_plot",
    price: "5500000",
    area: "300",
    areaUnit: "sqm",
    addressText: "Kollur, Hyderabad, Telangana",
    city: "Hyderabad",
    region: "Telangana",
    lat: 17.489,
    lng: 78.2717,
    surveyNumber: "Plot No. 114",
    zoning: "Residential (HMDA)",
    roadAccess: true,
    water: true,
    electricity: true,
    legalDocsAvailable: true,
    negotiable: false,
    featured: false,
    publishedAt: daysAgo(21),
    photoCount: 3,
  },
  {
    title: "3-Acre Coconut Farm Land, Coimbatore",
    description:
      "Well-maintained coconut grove with over 200 yielding trees, a working " +
      "borewell, and fertile red soil. Steady annual income from the harvest. " +
      "Quiet rural setting with a mud road connecting to the main village road.",
    landType: "agricultural",
    price: "2800000",
    area: "3",
    areaUnit: "acre",
    addressText: "Pollachi Road, Coimbatore, Tamil Nadu",
    city: "Coimbatore",
    region: "Tamil Nadu",
    lat: 10.9925,
    lng: 76.9614,
    surveyNumber: "Survey No. 63/1B",
    zoning: "Agricultural",
    roadAccess: false,
    water: true,
    electricity: false,
    legalDocsAvailable: true,
    negotiable: false,
    featured: false,
    publishedAt: daysAgo(26),
    photoCount: 3,
  },
  {
    title: "Mixed-Use Development Land in Jaipur",
    description:
      "Large parcel with frontage on the ring road, earmarked for mixed-use " +
      "development. Excellent potential for a commercial-cum-residential project. " +
      "Flat terrain, road access on two sides, and power lines along the boundary.",
    landType: "other",
    price: "4000000",
    area: "10",
    areaUnit: "guntha",
    addressText: "Ajmer Road, Jaipur, Rajasthan",
    city: "Jaipur",
    region: "Rajasthan",
    lat: 26.8505,
    lng: 75.6597,
    surveyNumber: "Khasra No. 210",
    zoning: "Mixed-use",
    roadAccess: true,
    water: false,
    electricity: false,
    legalDocsAvailable: false,
    negotiable: true,
    featured: false,
    publishedAt: daysAgo(30),
    photoCount: 2,
  },
];

async function findUserByEmail(email: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

/**
 * Create (or reuse) the demo seller. Signup goes through Better Auth so the
 * password hash matches the login path and the `buyer` role hook fires; we then
 * add the `seller` role (additive — spec §3.1), mark the email verified, and
 * ensure a seller profile so the landing page header resolves a display name.
 */
async function ensureDemoSeller(): Promise<string> {
  let user = await findUserByEmail(SELLER_EMAIL);

  if (user) {
    console.info(`· demo seller already exists: ${SELLER_EMAIL}`);
  } else {
    await auth.api.signUpEmail({
      body: { email: SELLER_EMAIL, password: SELLER_PASSWORD, name: SELLER_NAME },
    });
    console.info(`✓ created demo seller ${SELLER_EMAIL}`);
    console.info(`  seller login password (shown once): ${SELLER_PASSWORD}`);
    user = await findUserByEmail(SELLER_EMAIL);
  }
  if (!user) throw new Error(`demo seller ${SELLER_EMAIL} missing after signup`);

  await db
    .insert(userRoles)
    .values([
      { userId: user.id, role: "buyer" },
      { userId: user.id, role: "seller" },
    ])
    .onConflictDoNothing();

  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, user.id));

  await db
    .insert(sellerProfiles)
    .values({
      userId: user.id,
      displayName: SELLER_DISPLAY_NAME,
      about:
        "Family-run land specialists listing hand-picked agricultural, " +
        "residential, and commercial parcels across India.",
    })
    .onConflictDoNothing();

  return user.id;
}

/**
 * Insert or refresh one listing, keyed by (seller, slug) so re-runs update in
 * place rather than duplicate. Returns the listing id. `createdAt` is pinned to
 * `publishedAt` so the newest-first browse order reflects listing age.
 */
async function upsertListing(sellerId: string, spec: ListingSpec): Promise<string> {
  const slug = slugify(spec.title);
  const values = {
    sellerId,
    slug,
    title: spec.title,
    description: spec.description,
    landType: spec.landType,
    price: spec.price,
    currency: "INR",
    negotiable: spec.negotiable,
    area: spec.area,
    areaUnit: spec.areaUnit,
    addressText: spec.addressText,
    city: spec.city,
    region: spec.region,
    country: "IN",
    lat: spec.lat,
    lng: spec.lng,
    surveyNumber: spec.surveyNumber,
    zoning: spec.zoning,
    roadAccess: spec.roadAccess,
    water: spec.water,
    electricity: spec.electricity,
    legalDocsAvailable: spec.legalDocsAvailable,
    status: "active" as const,
    featured: spec.featured,
    publishedAt: spec.publishedAt,
    expiresAt: EXPIRES_AT,
    createdAt: spec.publishedAt,
  };

  const [existing] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), eq(listings.slug, slug)))
    .limit(1);

  if (existing) {
    await db.update(listings).set(values).where(eq(listings.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(listings)
    .values(values)
    .returning({ id: listings.id });
  return row.id;
}

/**
 * Rebuild a listing's photos from scratch (delete-then-insert keeps re-runs
 * clean). URLs point at picsum.photos placeholders — `/seed/<x>` gives a stable
 * image per photo — with `processing_status = 'ready'` so the public cover/
 * gallery resolve a URL exactly as they would for finished R2 media.
 */
async function seedMedia(listingId: string, slug: string, count: number): Promise<void> {
  await db.delete(listingMedia).where(eq(listingMedia.listingId, listingId));

  const rows = Array.from({ length: count }, (_, i) => {
    const seed = `${slug}-${i}`;
    return {
      listingId,
      kind: "photo" as const,
      storageKey: `demo/${slug}/${i}.jpg`,
      url: `https://picsum.photos/seed/${seed}/1200/800`,
      thumbUrl: `https://picsum.photos/seed/${seed}/400/300`,
      blurhash: BLURHASHES[i % BLURHASHES.length],
      processingStatus: "ready" as const,
      sortOrder: i,
      width: 1200,
      height: 800,
    };
  });

  await db.insert(listingMedia).values(rows);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed demo data.");
  }

  const sellerId = await ensureDemoSeller();

  let count = 0;
  for (const spec of LISTINGS) {
    const id = await upsertListing(sellerId, spec);
    await seedMedia(id, slugify(spec.title), spec.photoCount);
    count += 1;
  }

  console.info(`✓ seeded ${count} active demo listings for ${SELLER_EMAIL}`);
  console.info("demo seed complete.");
}

main()
  .catch((error) => {
    console.error("demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
