import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { savePricing } from './pricing';
import { DynamicPricing } from '../types';

// Corporate default estimator rates — seeded into custom_pricing for a
// brand-new company on first login. Kept in sync with App's DEFAULT_PRICING.
const DEFAULT_PRICING: DynamicPricing = {
  slatMaterialCost: 135,
  postRailMaterialCost: 105,
  bladeMaterialCost: 155,
  slatLaborCost: 85,
  postRailLaborCost: 75,
  bladeLaborCost: 85,
  standardPostCost: 0,
  cornerPostCost: 65,
  hPostCost: 95,
  gatePostCost: 85,
  decorativePostCost: 145,
  singleGateCost: 350,
  doubleGateCost: 750,
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

    // 2a. First login — create the company.
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyNameFromEmail(user.email) })
      .select('id')
      .single();

    if (companyError || !company?.id) {
      console.error('Onboarding: failed to create company', companyError);
      return null;
    }

    // 2b. Link the user to the company as an admin.
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: user.id, company_id: company.id, role: 'admin' });

    if (profileError) {
      console.error('Onboarding: failed to create profile', profileError);
      return null;
    }

    // 2c. Seed the company's default pricing row.
    await savePricing(company.id, DEFAULT_PRICING);

    return company.id;
  } catch (err) {
    console.error('Onboarding: unexpected error', err);
    return null;
  }
}
