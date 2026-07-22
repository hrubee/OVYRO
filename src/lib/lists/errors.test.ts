import { describe, expect, test } from "bun:test";
import { DefaultListError, ListConflictError, isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
  test("true for a Postgres 23505 error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  test("false for other errors and non-objects", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});

describe("typed list errors", () => {
  test("ListConflictError carries 409 + LIST_NAME_TAKEN", () => {
    const err = new ListConflictError();
    expect(err.status).toBe(409);
    expect(err.code).toBe("LIST_NAME_TAKEN");
  });

  test("DefaultListError carries 409 + DEFAULT_LIST_IMMUTABLE", () => {
    const err = new DefaultListError();
    expect(err.status).toBe(409);
    expect(err.code).toBe("DEFAULT_LIST_IMMUTABLE");
  });
});
