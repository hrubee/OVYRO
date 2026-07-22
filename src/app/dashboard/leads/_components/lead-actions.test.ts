import { describe, expect, test } from "bun:test";
import { leadActionsFor } from "./lead-actions";

describe("leadActionsFor", () => {
  test("new → contact | lose", () => {
    expect(leadActionsFor("new")).toEqual([
      { action: "contact", to: "contacted", label: "Mark contacted" },
      { action: "lose", to: "lost", label: "Mark lost" },
    ]);
  });

  test("contacted → negotiate | lose", () => {
    const tos = leadActionsFor("contacted").map((o) => o.to).sort();
    expect(tos).toEqual(["lost", "negotiating"]);
  });

  test("negotiating → win | lose", () => {
    const tos = leadActionsFor("negotiating").map((o) => o.to).sort();
    expect(tos).toEqual(["lost", "won"]);
  });

  test("won is terminal — no actions", () => {
    expect(leadActionsFor("won")).toEqual([]);
  });

  test("lost is terminal — no actions", () => {
    expect(leadActionsFor("lost")).toEqual([]);
  });

  test("never offers a skip-ahead (new never reaches won directly)", () => {
    expect(leadActionsFor("new").some((o) => o.to === "won")).toBe(false);
  });
});
