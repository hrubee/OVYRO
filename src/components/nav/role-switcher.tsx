import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { RoleSwitcherToggle } from "./role-switcher-toggle";

/**
 * Global "Browsing / Selling" control (spec §3.1, §4.3), dropped into every
 * shared header (public site header, buyer /account shell, seller /dashboard
 * shell). Self-contained: it resolves the current actor itself, so a header can
 * mount `<RoleSwitcher />` with no props.
 *
 * Visibility follows the additive-roles rule (spec §3.1):
 *   - buyer surfaces gate on "is authenticated" — but a plain buyer has nothing
 *     to switch *to*, so the toggle is hidden for them;
 *   - the Selling toggle is revealed only by `hasRole('seller')` (via
 *     {@link isSeller}), which — because seller implies buyer — is exactly the
 *     set of users who legitimately move between both experiences.
 *
 * Anonymous visitors and non-seller buyers render nothing. This is a server
 * component; the pages that mount it (home, browse, /account, /dashboard) are
 * already dynamically rendered, so reading the session here costs nothing extra
 * and never opts a statically-cached listing page into dynamic rendering.
 */
export async function RoleSwitcher() {
  const actor = await getActor();
  if (!actor || !isSeller(actor.roles)) return null;
  return <RoleSwitcherToggle />;
}
