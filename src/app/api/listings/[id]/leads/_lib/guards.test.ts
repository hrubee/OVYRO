import { describe, expect, test } from "bun:test";
import {
  assertNotSelfInquiry,
  assertPhoneVerified,
  isPhoneVerified,
  isSelfInquiry,
} from "./guards";
import { PhoneNotVerifiedError, SelfInquiryError } from "./http";

describe("self-inquiry guard (spec §3.1, §4.2.2)", () => {
  test("flags the seller inquiring on their own listing", () => {
    expect(isSelfInquiry("user_1", "user_1")).toBe(true);
    expect(isSelfInquiry("user_1", "user_2")).toBe(false);
  });

  test("assert throws SelfInquiryError (403) for the owner", () => {
    expect(() => assertNotSelfInquiry("user_1", "user_1")).toThrow(SelfInquiryError);
  });

  test("assert passes for a different buyer", () => {
    expect(() => assertNotSelfInquiry("buyer_9", "seller_1")).not.toThrow();
  });
});

describe("phone-verification guard (spec §4.2.2)", () => {
  test("treats a set timestamp as verified", () => {
    expect(isPhoneVerified(new Date())).toBe(true);
  });

  test("treats null / undefined as unverified", () => {
    expect(isPhoneVerified(null)).toBe(false);
    expect(isPhoneVerified(undefined)).toBe(false);
  });

  test("assert throws PhoneNotVerifiedError (403) when unverified", () => {
    expect(() => assertPhoneVerified(null)).toThrow(PhoneNotVerifiedError);
  });

  test("assert passes when verified", () => {
    expect(() => assertPhoneVerified(new Date())).not.toThrow();
  });
});
