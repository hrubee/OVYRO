import { describe, expect, test } from "bun:test";
import { extractPixelId, metaPixelUpdateSchema } from "./schema";

/** A realistic multi-line Meta Pixel base code snippet, verbatim in shape. */
const META_SNIPPET = `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '123456789012345');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=123456789012345&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->`;

describe("metaPixelUpdateSchema", () => {
  test("accepts a bare numeric pixel id and trims it", () => {
    const parsed = metaPixelUpdateSchema.parse({ pixelId: "  123456789012  " });
    expect(parsed).toEqual({ pixelId: "123456789012" });
  });

  test("extracts the id from a full Meta base-code snippet", () => {
    const parsed = metaPixelUpdateSchema.parse({ pixelId: META_SNIPPET });
    expect(parsed).toEqual({ pixelId: "123456789012345" });
  });

  test("tolerates double quotes, an unquoted id, and extra whitespace", () => {
    for (const input of [
      `fbq("init", "123456789012345");`,
      `fbq(  'init' ,  123456789012345  );`,
      `fbq('init', '123456789012345', {em: 'hash'});`,
    ]) {
      expect(metaPixelUpdateSchema.parse({ pixelId: input })).toEqual({
        pixelId: "123456789012345",
      });
    }
  });

  test("keeps ONLY the numeric id — never any injected markup", () => {
    const malicious = `<script>alert(1)</script>
<img src=x onerror="alert(2)">
<!-- Meta Pixel Code -->
<script>
fbq('track', 'ViewContent');
fbq('init', '987654321098765');
fbq('trackCustom', 'Evil<script>');
</script>`;
    const parsed = metaPixelUpdateSchema.parse({ pixelId: malicious });
    expect(parsed.pixelId).toBe("987654321098765");
    expect(parsed.pixelId).toMatch(/^\d+$/);
    const serialized = JSON.stringify(parsed).toLowerCase();
    for (const smell of ["<script", "alert", "onerror", "<img", "evil"]) {
      expect(serialized).not.toContain(smell);
    }
  });

  test("rejects a non-Meta tag / garbage with the helpful error", () => {
    for (const input of [
      "gtag('config', 'AW-123456789');", // Google Ads tag
      "<script>gtag('js', new Date());</script>", // Google Analytics
      "pixel-123",
      "not a pixel at all",
    ]) {
      const parsed = metaPixelUpdateSchema.safeParse({ pixelId: input });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain("valid Meta Pixel ID");
      }
    }
  });

  test("rejects a snippet whose init id is malformed", () => {
    expect(
      metaPixelUpdateSchema.safeParse({ pixelId: `fbq('init', 'abc');` })
        .success,
    ).toBe(false);
  });

  test("rejects a blank id", () => {
    expect(metaPixelUpdateSchema.safeParse({ pixelId: "   " }).success).toBe(
      false,
    );
  });

  test("rejects unknown keys (no mass-assignment of server columns)", () => {
    const parsed = metaPixelUpdateSchema.safeParse({
      pixelId: "123456789012",
      status: "active",
      accessTokenEncrypted: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("extractPixelId", () => {
  test("returns the id from a snippet, a bare id, and null otherwise", () => {
    expect(extractPixelId(META_SNIPPET)).toBe("123456789012345");
    expect(extractPixelId("  123456789012345  ")).toBe("123456789012345");
    expect(extractPixelId("AW-123456789")).toBeNull();
    expect(extractPixelId("")).toBeNull();
  });
});
