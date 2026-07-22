import { describe, expect, test } from "bun:test";
import { isBlurhashValid } from "blurhash";
import sharp from "sharp";
import { generateImageVariants } from "./media-processing";

/** A real, decodable raster with distinct colour regions (so blurhash is non-trivial). */
async function makeJpeg(width: number, height: number): Promise<Buffer> {
  const half = Math.max(1, Math.floor(width / 2));
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: half,
            height,
            channels: 3,
            background: { r: 220, g: 60, b: 40 },
          },
        })
          .png()
          .toBuffer(),
        left: width - half,
        top: 0,
      },
    ])
    .jpeg()
    .toBuffer();
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

describe("generateImageVariants", () => {
  test("produces ready webp variants, a thumb and a valid blurhash", async () => {
    const original = await makeJpeg(800, 600);
    const result = await generateImageVariants(original);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);

    // Ladder widths <= 800 are 320 and 640; nothing is upscaled.
    expect(result.variants.map((variant) => variant.width)).toEqual([320, 640]);
    for (const variant of result.variants) {
      expect(isWebp(variant.buffer)).toBe(true);
      expect(variant.width).toBeLessThanOrEqual(800);
      expect(variant.buffer.length).toBeGreaterThan(0);
    }

    // Variants ascend by width so the last is the display image.
    const widths = result.variants.map((variant) => variant.width);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);

    expect(result.thumb.width).toBe(400);
    expect(isWebp(result.thumb.buffer)).toBe(true);

    expect(typeof result.blurhash).toBe("string");
    expect(result.blurhash.length).toBeGreaterThan(6);
    expect(isBlurhashValid(result.blurhash).result).toBe(true);
  });

  test("never upscales a source smaller than the smallest ladder width", async () => {
    const original = await makeJpeg(100, 80);
    const result = await generateImageVariants(original);

    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].width).toBe(100);
    expect(result.thumb.width).toBe(100);
    expect(isBlurhashValid(result.blurhash).result).toBe(true);
  });

  test("rejects bytes that are not a decodable image", async () => {
    await expect(generateImageVariants(Buffer.from("not an image"))).rejects.toThrow();
  });
});
