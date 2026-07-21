import { describe, expect, test } from "bun:test";
import { GET } from "./route";

describe("GET /api/health", () => {
  test("returns 200 with status ok", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  test("reports uptime and an ISO timestamp", async () => {
    const body = await GET().json();

    expect(typeof body.uptime).toBe("number");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
