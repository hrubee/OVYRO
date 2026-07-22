/**
 * Dependency-free HTML helpers shared across transactional email bodies.
 *
 * Templates are pure `(data) -> { subject, html, text }` (see `listing-moderation`),
 * so these helpers touch no DB, no Resend, and no React — keeping every template
 * trivially unit-testable and safe to import from the worker. Inline styles only:
 * email clients strip `<style>`/`<head>`, so every rule lives on the element.
 */

/** Escape untrusted text (names, titles, messages) before HTML interpolation. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared HTML shell — heading + body + Ovyro sign-off. */
export function emailLayout(heading: string, bodyHtml: string): string {
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6">`,
    `<h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${escapeHtml(heading)}</h1>`,
    bodyHtml,
    `<p style="font-size:13px;color:#64748b;margin-top:32px">— The Ovyro team</p>`,
    `</div>`,
  ].join("");
}

/** Primary call-to-action button. `href` is a trusted app URL, never user input. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:500">${escapeHtml(label)}</a></p>`;
}
