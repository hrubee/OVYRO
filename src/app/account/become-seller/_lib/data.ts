/**
 * Server-side loader for the Become-a-seller page (spec §4.2.4).
 *
 * Reuses the API's repo read + buyer serializer so the server-rendered initial
 * state and the `/api/me/seller-onboarding` responses can never disagree on the
 * wire shape. An already-seller short-circuits before any application query —
 * they have nothing to onboard.
 */
import { isSeller } from "@/lib/auth/roles";
import type { Actor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  toBuyerDTO,
  type BuyerOnboardingDTO,
} from "@/app/api/me/seller-onboarding/_lib/dto";
import { getOnboarding } from "@/app/api/me/seller-onboarding/_lib/repo";

export interface BecomeSellerData {
  isSeller: boolean;
  onboarding: BuyerOnboardingDTO | null;
}

export async function loadBecomeSeller(actor: Actor): Promise<BecomeSellerData> {
  if (isSeller(actor.roles)) {
    return { isSeller: true, onboarding: null };
  }
  const row = await getOnboarding(db, actor.userId);
  return { isSeller: false, onboarding: row ? toBuyerDTO(row) : null };
}
