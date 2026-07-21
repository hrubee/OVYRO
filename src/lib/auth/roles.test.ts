import { describe, expect, test } from "bun:test";
import {
  AuthorizationError,
  canInquireOnListing,
  canMutateOwned,
  canUseBuyerFeatures,
  expandRoles,
  hasAnyRole,
  hasRole,
  isAdmin,
  isRole,
  isSeller,
  requireAnyRole,
  requireRole,
  type Role,
} from "./roles";

describe("additive roles (spec §3.1)", () => {
  test("a seller passes buyer checks without holding an explicit buyer grant", () => {
    const seller: Role[] = ["seller"];

    expect(hasRole(seller, "buyer")).toBe(true);
    expect(hasRole(seller, "seller")).toBe(true);
    expect(() => requireRole(seller, "buyer")).not.toThrow();
  });

  test("a seller who also holds the buyer grant is unchanged", () => {
    const seller: Role[] = ["seller", "buyer"];

    expect([...expandRoles(seller)].sort()).toEqual(["buyer", "seller"]);
    expect(hasRole(seller, "buyer")).toBe(true);
  });

  test("a buyer does not get seller capability", () => {
    const buyer: Role[] = ["buyer"];

    expect(hasRole(buyer, "seller")).toBe(false);
    expect(hasRole(buyer, "admin")).toBe(false);
    expect(() => requireRole(buyer, "seller")).toThrow(AuthorizationError);
  });

  test("admin is separate, not a superset of buyer (spec §3.2 matrix)", () => {
    const admin: Role[] = ["admin"];

    expect(hasRole(admin, "admin")).toBe(true);
    expect(hasRole(admin, "buyer")).toBe(false);
    expect(hasRole(admin, "seller")).toBe(false);
  });

  test("an admin who is also a seller keeps both, and gains buyer via seller", () => {
    const staffSeller: Role[] = ["admin", "seller"];

    expect([...expandRoles(staffSeller)].sort()).toEqual([
      "admin",
      "buyer",
      "seller",
    ]);
  });

  test("no roles confers nothing", () => {
    expect(expandRoles([]).size).toBe(0);
    expect(hasRole([], "buyer")).toBe(false);
    expect(hasAnyRole([], ["buyer", "seller", "admin"])).toBe(false);
  });
});

describe("hasAnyRole / requireAnyRole", () => {
  test("matches through implication", () => {
    expect(hasAnyRole(["seller"], ["buyer"])).toBe(true);
    expect(hasAnyRole(["buyer"], ["seller", "admin"])).toBe(false);
    expect(() => requireAnyRole(["seller"], ["admin", "buyer"])).not.toThrow();
    expect(() => requireAnyRole(["buyer"], ["admin"])).toThrow(AuthorizationError);
  });
});

describe("AuthorizationError", () => {
  test("carries the error envelope fields the API layer needs", () => {
    try {
      requireRole(["buyer"], "admin");
      throw new Error("expected requireRole to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      const authError = error as AuthorizationError;
      expect(authError.code).toBe("FORBIDDEN");
      expect(authError.status).toBe(403);
      expect(authError.message).toContain("admin");
    }
  });
});

describe("buyer features gate on authentication, never on role", () => {
  test("any authenticated user can use buyer features", () => {
    expect(canUseBuyerFeatures({ userId: "u_1" })).toBe(true);
    expect(canUseBuyerFeatures(null)).toBe(false);
  });
});

describe("ownership guard rails (spec §3.2)", () => {
  const owner = { userId: "u_owner", roles: ["seller"] as Role[] };
  const stranger = { userId: "u_other", roles: ["seller"] as Role[] };
  const admin = { userId: "u_admin", roles: ["admin"] as Role[] };

  test("owner and admin may mutate; another seller may not", () => {
    expect(canMutateOwned(owner, "u_owner")).toBe(true);
    expect(canMutateOwned(admin, "u_owner")).toBe(true);
    expect(canMutateOwned(stranger, "u_owner")).toBe(false);
  });
});

describe("a seller cannot inquire on their own listing (spec §3.2)", () => {
  const listing = { sellerId: "u_owner" };

  test("owner is blocked, other users are not", () => {
    expect(
      canInquireOnListing({ userId: "u_owner", roles: ["seller"] }, listing),
    ).toBe(false);
    expect(
      canInquireOnListing({ userId: "u_buyer", roles: ["buyer"] }, listing),
    ).toBe(true);
    expect(
      canInquireOnListing({ userId: "u_seller2", roles: ["seller"] }, listing),
    ).toBe(true);
  });

  test("anonymous and admin cannot inquire", () => {
    expect(canInquireOnListing(null, listing)).toBe(false);
    expect(
      canInquireOnListing({ userId: "u_admin", roles: ["admin"] }, listing),
    ).toBe(false);
  });
});

describe("isRole / isSeller / isAdmin", () => {
  test("isRole narrows unknown input", () => {
    expect(isRole("seller")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(42)).toBe(false);
  });

  test("isSeller and isAdmin follow the same implication rules", () => {
    expect(isSeller(["seller"])).toBe(true);
    expect(isSeller(["buyer"])).toBe(false);
    expect(isAdmin(["admin"])).toBe(true);
    expect(isAdmin(["seller"])).toBe(false);
  });
});
