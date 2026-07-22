import { ConsentBanner } from "@/components/meta/consent-banner";
import { ConsentProvider } from "@/components/meta/consent-provider";

/**
 * Public site shell. Wraps every public route in the cookie-consent provider so
 * the landing-page Meta Pixel (spec §5.2) can gate on the visitor's choice, and
 * renders the consent banner once site-wide.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConsentProvider>
      {children}
      <ConsentBanner />
    </ConsentProvider>
  );
}
