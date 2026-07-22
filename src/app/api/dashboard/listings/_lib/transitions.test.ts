import { describe, expect, test } from "bun:test";
import { ListingTransitionError } from "@/lib/listings";
import {
  PhotosRequiredError,
  SELLER_ACTIONS,
  SellerActionError,
  resolveSellerTransition,
} from "./transitions";

const withPhotos = { photoCount: 3 };
const noPhotos = { photoCount: 0 };

describe("resolveSellerTransition — legal seller moves", () => {
  test("draft → pending_review with photos is 'submit'", () => {
    expect(resolveSellerTransition("draft", "pending_review", withPhotos)).toBe(
      "submit",
    );
  });

  test("active → paused is 'pause'", () => {
    expect(resolveSellerTransition("active", "paused", noPhotos)).toBe("pause");
  });

  test("paused → active is 'reactivate'", () => {
    expect(resolveSellerTransition("paused", "active", noPhotos)).toBe(
      "reactivate",
    );
  });

  test("active → sold is 'mark_sold'", () => {
    expect(resolveSellerTransition("active", "sold", noPhotos)).toBe("mark_sold");
  });

  test("expired → pending_review with photos is 'renew'", () => {
    expect(
      resolveSellerTransition("expired", "pending_review", withPhotos),
    ).toBe("renew");
  });

  test("rejected → pending_review with photos is 'resubmit'", () => {
    expect(
      resolveSellerTransition("rejected", "pending_review", withPhotos),
    ).toBe("resubmit");
  });
});

describe("resolveSellerTransition — photo gate", () => {
  test("draft → pending_review with zero photos throws PhotosRequiredError (422)", () => {
    expect(() =>
      resolveSellerTransition("draft", "pending_review", noPhotos),
    ).toThrow(PhotosRequiredError);
    try {
      resolveSellerTransition("draft", "pending_review", noPhotos);
    } catch (err) {
      expect((err as PhotosRequiredError).status).toBe(422);
      expect((err as PhotosRequiredError).code).toBe("PHOTOS_REQUIRED");
    }
  });

  test("resubmit and renew are gated on photos too", () => {
    expect(() =>
      resolveSellerTransition("rejected", "pending_review", noPhotos),
    ).toThrow(PhotosRequiredError);
    expect(() =>
      resolveSellerTransition("expired", "pending_review", noPhotos),
    ).toThrow(PhotosRequiredError);
  });
});

describe("resolveSellerTransition — admin/worker moves are 403", () => {
  test("pending_review → active (admin approve) throws SellerActionError", () => {
    // This edge is *legal* in the shared machine, so the guard — not the state
    // machine — is what stops a seller self-approving.
    expect(() =>
      resolveSellerTransition("pending_review", "active", withPhotos),
    ).toThrow(SellerActionError);
    try {
      resolveSellerTransition("pending_review", "active", withPhotos);
    } catch (err) {
      expect((err as SellerActionError).status).toBe(403);
    }
  });

  test("pending_review → rejected (admin reject) throws SellerActionError", () => {
    expect(() =>
      resolveSellerTransition("pending_review", "rejected", withPhotos),
    ).toThrow(SellerActionError);
  });

  test("active → expired (worker) throws SellerActionError", () => {
    expect(() =>
      resolveSellerTransition("active", "expired", withPhotos),
    ).toThrow(SellerActionError);
  });
});

describe("resolveSellerTransition — illegal moves are 409", () => {
  test("draft → active is illegal", () => {
    expect(() =>
      resolveSellerTransition("draft", "active", withPhotos),
    ).toThrow(ListingTransitionError);
  });

  test("sold is terminal", () => {
    expect(() =>
      resolveSellerTransition("sold", "active", withPhotos),
    ).toThrow(ListingTransitionError);
  });
});

describe("SELLER_ACTIONS", () => {
  test("excludes admin approve/reject and worker expire", () => {
    expect(SELLER_ACTIONS.has("approve")).toBe(false);
    expect(SELLER_ACTIONS.has("reject")).toBe(false);
    expect(SELLER_ACTIONS.has("expire")).toBe(false);
  });

  test("includes the six seller-owned actions", () => {
    for (const action of [
      "submit",
      "pause",
      "reactivate",
      "mark_sold",
      "renew",
      "resubmit",
    ] as const) {
      expect(SELLER_ACTIONS.has(action)).toBe(true);
    }
  });
});
