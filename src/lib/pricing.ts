import { supabase } from './supabase';
import { DynamicPricing } from '../types';

// Maps a custom_pricing table row (snake_case columns) to the app's
// DynamicPricing shape (camelCase fields).
function rowToPricing(row: Record<string, any>): DynamicPricing {
  return {
    slatMaterialCost: row.slat_material_cost,
    bladeMaterialCost: row.blade_material_cost,
    postRailMaterialCost: row.post_rail_material_cost,
    slatLaborCost: row.slat_labor_cost,
    bladeLaborCost: row.blade_labor_cost,
    postRailLaborCost: row.post_rail_labor_cost,
    standardPostCost: row.standard_post_cost,
    cornerPostCost: row.corner_post_cost,
    hPostCost: row.h_post_cost,
    gatePostCost: row.gate_post_cost,
    decorativePostCost: row.decorative_post_cost,
    singleGateCost: row.single_gate_cost,
    doubleGateCost: row.double_gate_cost,
  };
}

export async function loadPricing(companyId: string): Promise<DynamicPricing | null> {
  const { data, error } = await supabase
    .from('custom_pricing')
    .select('*')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load custom pricing from Supabase', error);
    return null;
  }
  if (!data) return null;
  return rowToPricing(data);
}

export async function savePricing(companyId: string, pricing: DynamicPricing): Promise<void> {
  const { error } = await supabase
    .from('custom_pricing')
    .upsert(
      {
        company_id: companyId,
        slat_material_cost: pricing.slatMaterialCost,
        blade_material_cost: pricing.bladeMaterialCost,
        post_rail_material_cost: pricing.postRailMaterialCost,
        slat_labor_cost: pricing.slatLaborCost,
        blade_labor_cost: pricing.bladeLaborCost,
        post_rail_labor_cost: pricing.postRailLaborCost,
        standard_post_cost: pricing.standardPostCost,
        corner_post_cost: pricing.cornerPostCost,
        h_post_cost: pricing.hPostCost,
        gate_post_cost: pricing.gatePostCost,
        decorative_post_cost: pricing.decorativePostCost,
        single_gate_cost: pricing.singleGateCost,
        double_gate_cost: pricing.doubleGateCost,
      },
      { onConflict: 'company_id' }
    );

  if (error) {
    console.error('Failed to save custom pricing to Supabase', error);
  }
}
