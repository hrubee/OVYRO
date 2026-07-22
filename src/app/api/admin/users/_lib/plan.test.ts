import { describe, expect, test } from "bun:test";
import {
  OVERRIDABLE_ROLE,
  SelfActionError,
  anonymizedUserPatch,
  assertNotSelf,
  userSnapshot,
} from "./plan";

describe("assertNotSelf", () => {
  test("throws SelfActionError when acting on your own account", () => {
    expect(() => assertNotSelf("u_admin", "u_admin")).toThrow(SelfActionError);
  });

  test("allows acting on any other account", () => {
    expect(() => assertNotSelf("u_admin", "u_other")).not.toThrow();
  });

  test("SelfActionError is a 400 with a stable code", () => {
    const error = new SelfActionError();
    expect(error.status).toBe(400);
    expect(error.code).toBe("SELF_ACTION");
  });
});

describe("anonymizedUserPatch", () => {
  const now = new Date("2026-07-22T00:00:00.000Z");

  test("moves the account to deleted and stamps deleted_at", () => {
    const patch = anonymizedUserPatch("u_1", now);
    expect(patch.status).toBe("deleted");
    expect(patch.deletedAt).toBe(now);
  });

  test("scrubs directly-identifying PII off the users row", () => {
    const patch = anonymizedUserPatch("u_1", now);
    expect(patch.name).toBe("Deleted user");
    expect(patch.phone).toBeNull();
    expect(patch.avatarUrl).toBeNull();
    expect(patch.emailVerified).toBe(false);
    expect(patch.emailVerifiedAt).toBeNull();
    expect(patch.phoneVerifiedAt).toBeNull();
  });

  test("email becomes a deterministic, unique .invalid placeholder", () => {
    const a = anonymizedUserPatch("u_1", now);
    const b = anonymizedUserPatch("u_2", now);
    expect(a.email).toBe("deleted+u_1@deleted.invalid");
    // Distinct per user so the users.email unique index is never violated.
    expect(a.email).not.toBe(b.email);
    expect(a.email.endsWith("@deleted.invalid")).toBe(true);
  });
});

describe("userSnapshot", () => {
  test("captures the audited fields and ISO-serializes deletedAt", () => {
    const deletedAt = new Date("2026-07-22T00:00:00.000Z");
    const snap = userSnapshot({
      id: "u_1",
      email: "a@b.com",
      name: "Ada",
      phone: "+15550001",
      status: "active",
      deletedAt,
    });
    expect(snap).toEqual({
      id: "u_1",
      email: "a@b.com",
      name: "Ada",
      phone: "+15550001",
      status: "active",
      deletedAt: deletedAt.toISOString(),
    });
  });

  test("null deletedAt serializes to null", () => {
    const snap = userSnapshot({
      id: "u_1",
      email: "a@b.com",
      name: "Ada",
      phone: null,
      status: "suspended",
      deletedAt: null,
    });
    expect(snap.deletedAt).toBeNull();
    expect(snap.phone).toBeNull();
  });
});

describe("OVERRIDABLE_ROLE", () => {
  test("the manual role override targets the seller role (spec §3.1)", () => {
    expect(OVERRIDABLE_ROLE).toBe("seller");
  });
});
