import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAccountActor } from "../_lib/data";
import { loadBecomeSeller } from "./_lib/data";
import { BecomeSellerWizard } from "./_components/become-seller-wizard";

export const metadata: Metadata = { title: "Become a seller" };

// Reads the session + the caller's application row on every request.
export const dynamic = "force-dynamic";

/**
 * Buyer → seller onboarding (spec §4.2.4). Gated only on "is signed in" (the
 * account layout already redirects anonymous visitors). A caller who already
 * holds the `seller` role has nothing to onboard and is pointed at their
 * dashboard; everyone else gets the resumable wizard, seeded from any
 * in-progress / submitted / rejected application on file.
 */
export default async function BecomeSellerPage() {
  const actor = await requireAccountActor();
  const data = await loadBecomeSeller(actor);

  if (data.isSeller) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>You&apos;re already a seller</CardTitle>
          <CardDescription>
            Your account already has selling enabled — head to your dashboard to
            create and manage listings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard">Go to seller dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <BecomeSellerWizard initial={data.onboarding} />;
}
