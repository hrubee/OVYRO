import type { Metadata } from "next";
import { requireAccountActor, getAccountProfile } from "../_lib/data";
import { ProfileForm } from "./_components/profile-form";

export const metadata: Metadata = { title: "Profile settings" };

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const actor = await requireAccountActor();
  const profile = await getAccountProfile(actor.userId);

  return (
    <div className="max-w-lg">
      <ProfileForm
        initialName={profile.name}
        email={profile.email}
        phone={profile.phone}
        phoneVerified={profile.phoneVerified}
      />
    </div>
  );
}
