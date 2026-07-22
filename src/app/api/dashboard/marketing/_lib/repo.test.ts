import { describe, expect, test } from "bun:test";
import { serializeSettings } from "./repo";

describe("serializeSettings", () => {
  const connectedAt = new Date("2026-01-02T03:04:05.000Z");

  test("an active connection exposes the pixel id and connect time", () => {
    expect(
      serializeSettings({
        pixelId: "123456789012",
        status: "active",
        connectedAt,
      }),
    ).toEqual({
      pixelId: "123456789012",
      status: "active",
      connectedAt: "2026-01-02T03:04:05.000Z",
    });
  });

  test("a disconnected connection withholds the pixel id", () => {
    expect(
      serializeSettings({
        pixelId: "123456789012",
        status: "disconnected",
        connectedAt,
      }),
    ).toEqual({
      pixelId: null,
      status: "disconnected",
      connectedAt: null,
    });
  });

  test("a needs_reauth connection also withholds the pixel id", () => {
    expect(
      serializeSettings({
        pixelId: "123456789012",
        status: "needs_reauth",
        connectedAt,
      }),
    ).toMatchObject({ pixelId: null, status: "needs_reauth" });
  });
});
