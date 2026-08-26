import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { savePricing } from './pricing';
import { DynamicPricing } from '../types';

// Corporate default estimator rates — seeded into custom_pricing for a
// brand-new company on first login. Kept in sync with App's DEFAULT_PRICING.
const DEFAULT_PRICING: DynamicPricing = {
  slat_fencing: {
    materialCostPerMeter: 135, laborCostPerMeter: 85,
    standardPostCost: 0, cornerPostCost: 65, hPostCost: 95, gatePostCost: 85, decorativePostCost: 145,
    singleGateCost: 350, doubleGateCost: 750,
    surcharge65mm: 0, surcharge90mm: 18,
  },
  post_and_rail: {
    materialCostPerMeter: 105, laborCostPerMeter: 75,
    standardPostCost: 0, cornerPostCost: 65, hPostCost: 95, gatePostCost: 85, decorativePostCost: 145,
    singleGateCost: 350, doubleGateCost: 750,
    surcharge2rail: 0, surcharge3rail: 15, surcharge4rail: 30, surchargeChainwire: 12,
  },
  aluminium_blade: {
    materialCostPerMeter: 155, laborCostPerMeter: 85,
    standardPostCost: 0, cornerPostCost: 65, hPostCost: 95, gatePostCost: 85, decorativePostCost: 145,
    singleGateCost: 350, doubleGateCost: 750,
  },
  colorbond_solid_panel: {
    materialCostPerMeter: 130, laborCostPerMeter: 85,
    standardPostCost: 0, cornerPostCost: 65, hPostCost: 95, gatePostCost: 85, decorativePostCost: 145,
    singleGateCost: 350, doubleGateCost: 750,
  },
  aluminium_perforated: {
    materialCostPerMeter: 185, laborCostPerMeter: 85,
    standardPostCost: 0, cornerPostCost: 65, hPostCost: 95, gatePostCost: 85, decorativePostCost: 145,
    singleGateCost: 350, doubleGateCost: 750,
  },
};

// Derive a friendly company name from the user's email domain, e.g.
// "jack@acmefences.com.au" -> "Acmefences". Falls back to "My Company".
function companyNameFromEmail(email: string | undefined): string {
  if (!email || !email.includes('@')) return 'My Company';
  const domain = email.split('@')[1] || '';
  const label = domain.split('.')[0] || '';
  if (!label) return 'My Company';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Ensure the signed-in user has a company + profile + pricing row.
 *
 * - If a profile already exists, returns its company_id (no writes).
 * - If not (first-time login), creates a company, an admin profile linking
 *   the user to it, and a default pricing row, then returns the new company_id.
 * - On any failure, logs the error and returns null so the caller can fall
 *   back to defaults without crashing.
 */
export async function ensureUserOnboarded(user: User): Promise<string | null> {
  try {
    // 1. Already onboarded? Return the existing company link.
    const { data: existing, error: lookupError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (lookupError) {
      console.error('Onboarding: failed to look up profile', lookupError);
      return null;
    }
    if (existing?.company_id) {
      return existing.company_id;
    }

    // 2. First login — create company + profile atomically via SECURITY DEFINER
    //    RPC. Runs as the function owner (postgres superuser), bypassing the RLS
    //    RETURNING-visibility deadlock that occurs when no profile row exists yet.
    //    The function is idempotent: if a profile already exists it returns the
    //    existing company_id without writing anything new.
    const { data: companyId, error: rpcError } = await supabase.rpc(
      'create_company_and_profile',
      { company_name: companyNameFromEmail(user.email) }
    );

    if (rpcError || !companyId) {
      console.error('Onboarding: RPC create_company_and_profile failed', rpcError);
      return null;
    }

    // 3. Seed the company's default pricing row (separate step so the pricing
    //    logic stays in pricing.ts and is not duplicated inside the SQL function).
    await savePricing(companyId, DEFAULT_PRICING);

    return companyId as string;
  } catch (err) {
    console.error('Onboarding: unexpected error', err);
    return null;
  }
}
