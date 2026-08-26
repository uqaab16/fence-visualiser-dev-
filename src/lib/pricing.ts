import { supabase } from './supabase';
import { DynamicPricing } from '../types';

// Maps a custom_pricing table row (snake_case columns) to the app's DynamicPricing shape.
// New per-material post/gate columns fall back to the old shared column, then to hardcoded
// defaults — so existing rows without the new columns load correctly.
function rowToPricing(row: Record<string, any>): DynamicPricing {
  return {
    slat_fencing: {
      materialCostPerMeter: row.slat_material_cost ?? 135,
      laborCostPerMeter: row.slat_labor_cost ?? 85,
      standardPostCost: row.slat_standard_post_cost ?? row.standard_post_cost ?? 0,
      cornerPostCost: row.slat_corner_post_cost ?? row.corner_post_cost ?? 65,
      hPostCost: row.slat_h_post_cost ?? row.h_post_cost ?? 95,
      gatePostCost: row.slat_gate_post_cost ?? row.gate_post_cost ?? 85,
      decorativePostCost: row.slat_decorative_post_cost ?? row.decorative_post_cost ?? 145,
      singleGateCost: row.slat_single_gate_cost ?? row.single_gate_cost ?? 350,
      doubleGateCost: row.slat_double_gate_cost ?? row.double_gate_cost ?? 750,
      surcharge65mm: row.slat_surcharge_65mm ?? 0,
      surcharge90mm: row.slat_surcharge_90mm ?? 18,
    },
    post_and_rail: {
      materialCostPerMeter: row.post_rail_material_cost ?? 105,
      laborCostPerMeter: row.post_rail_labor_cost ?? 75,
      standardPostCost: row.post_rail_standard_post_cost ?? row.standard_post_cost ?? 0,
      cornerPostCost: row.post_rail_corner_post_cost ?? row.corner_post_cost ?? 65,
      hPostCost: row.post_rail_h_post_cost ?? row.h_post_cost ?? 95,
      gatePostCost: row.post_rail_gate_post_cost ?? row.gate_post_cost ?? 85,
      decorativePostCost: row.post_rail_decorative_post_cost ?? row.decorative_post_cost ?? 145,
      singleGateCost: row.post_rail_single_gate_cost ?? row.single_gate_cost ?? 350,
      doubleGateCost: row.post_rail_double_gate_cost ?? row.double_gate_cost ?? 750,
      surcharge2rail: row.post_rail_surcharge_2rail ?? 0,
      surcharge3rail: row.post_rail_surcharge_3rail ?? 15,
      surcharge4rail: row.post_rail_surcharge_4rail ?? 30,
      surchargeChainwire: row.post_rail_surcharge_chainwire ?? 12,
    },
    aluminium_blade: {
      materialCostPerMeter: row.blade_material_cost ?? 155,
      laborCostPerMeter: row.blade_labor_cost ?? 85,
      standardPostCost: row.blade_standard_post_cost ?? row.standard_post_cost ?? 0,
      cornerPostCost: row.blade_corner_post_cost ?? row.corner_post_cost ?? 65,
      hPostCost: row.blade_h_post_cost ?? row.h_post_cost ?? 95,
      gatePostCost: row.blade_gate_post_cost ?? row.gate_post_cost ?? 85,
      decorativePostCost: row.blade_decorative_post_cost ?? row.decorative_post_cost ?? 145,
      singleGateCost: row.blade_single_gate_cost ?? row.single_gate_cost ?? 350,
      doubleGateCost: row.blade_double_gate_cost ?? row.double_gate_cost ?? 750,
    },
    colorbond_solid_panel: {
      materialCostPerMeter: row.colorbond_panel_material_cost ?? 130,
      laborCostPerMeter: row.colorbond_panel_labor_cost ?? 85,
      standardPostCost: row.colorbond_standard_post_cost ?? row.standard_post_cost ?? 0,
      cornerPostCost: row.colorbond_corner_post_cost ?? row.corner_post_cost ?? 65,
      hPostCost: row.colorbond_h_post_cost ?? row.h_post_cost ?? 95,
      gatePostCost: row.colorbond_gate_post_cost ?? row.gate_post_cost ?? 85,
      decorativePostCost: row.colorbond_decorative_post_cost ?? row.decorative_post_cost ?? 145,
      singleGateCost: row.colorbond_single_gate_cost ?? row.single_gate_cost ?? 350,
      doubleGateCost: row.colorbond_double_gate_cost ?? row.double_gate_cost ?? 750,
    },
    aluminium_perforated: {
      materialCostPerMeter: row.perforated_material_cost ?? 185,
      laborCostPerMeter: row.perforated_labor_cost ?? 85,
      standardPostCost: row.perforated_standard_post_cost ?? row.standard_post_cost ?? 0,
      cornerPostCost: row.perforated_corner_post_cost ?? row.corner_post_cost ?? 65,
      hPostCost: row.perforated_h_post_cost ?? row.h_post_cost ?? 95,
      gatePostCost: row.perforated_gate_post_cost ?? row.gate_post_cost ?? 85,
      decorativePostCost: row.perforated_decorative_post_cost ?? row.decorative_post_cost ?? 145,
      singleGateCost: row.perforated_single_gate_cost ?? row.single_gate_cost ?? 350,
      doubleGateCost: row.perforated_double_gate_cost ?? row.double_gate_cost ?? 750,
    },
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
  const s = pricing.slat_fencing;
  const p = pricing.post_and_rail;
  const b = pricing.aluminium_blade;
  const c = pricing.colorbond_solid_panel;
  const f = pricing.aluminium_perforated;

  const { error } = await supabase
    .from('custom_pricing')
    .upsert(
      {
        company_id: companyId,
        // Legacy shared columns — kept so old app versions that read them still work
        slat_material_cost: s.materialCostPerMeter,
        blade_material_cost: b.materialCostPerMeter,
        post_rail_material_cost: p.materialCostPerMeter,
        slat_labor_cost: s.laborCostPerMeter,
        blade_labor_cost: b.laborCostPerMeter,
        post_rail_labor_cost: p.laborCostPerMeter,
        colorbond_panel_material_cost: c.materialCostPerMeter,
        colorbond_panel_labor_cost: c.laborCostPerMeter,
        perforated_material_cost: f.materialCostPerMeter,
        perforated_labor_cost: f.laborCostPerMeter,
        standard_post_cost: s.standardPostCost,
        corner_post_cost: s.cornerPostCost,
        h_post_cost: s.hPostCost,
        gate_post_cost: s.gatePostCost,
        decorative_post_cost: s.decorativePostCost,
        single_gate_cost: s.singleGateCost,
        double_gate_cost: s.doubleGateCost,
        // Per-material post costs
        slat_standard_post_cost: s.standardPostCost,
        slat_corner_post_cost: s.cornerPostCost,
        slat_h_post_cost: s.hPostCost,
        slat_gate_post_cost: s.gatePostCost,
        slat_decorative_post_cost: s.decorativePostCost,
        slat_single_gate_cost: s.singleGateCost,
        slat_double_gate_cost: s.doubleGateCost,
        slat_surcharge_65mm: s.surcharge65mm,
        slat_surcharge_90mm: s.surcharge90mm,
        blade_standard_post_cost: b.standardPostCost,
        blade_corner_post_cost: b.cornerPostCost,
        blade_h_post_cost: b.hPostCost,
        blade_gate_post_cost: b.gatePostCost,
        blade_decorative_post_cost: b.decorativePostCost,
        blade_single_gate_cost: b.singleGateCost,
        blade_double_gate_cost: b.doubleGateCost,
        colorbond_standard_post_cost: c.standardPostCost,
        colorbond_corner_post_cost: c.cornerPostCost,
        colorbond_h_post_cost: c.hPostCost,
        colorbond_gate_post_cost: c.gatePostCost,
        colorbond_decorative_post_cost: c.decorativePostCost,
        colorbond_single_gate_cost: c.singleGateCost,
        colorbond_double_gate_cost: c.doubleGateCost,
        perforated_standard_post_cost: f.standardPostCost,
        perforated_corner_post_cost: f.cornerPostCost,
        perforated_h_post_cost: f.hPostCost,
        perforated_gate_post_cost: f.gatePostCost,
        perforated_decorative_post_cost: f.decorativePostCost,
        perforated_single_gate_cost: f.singleGateCost,
        perforated_double_gate_cost: f.doubleGateCost,
        post_rail_standard_post_cost: p.standardPostCost,
        post_rail_corner_post_cost: p.cornerPostCost,
        post_rail_h_post_cost: p.hPostCost,
        post_rail_gate_post_cost: p.gatePostCost,
        post_rail_decorative_post_cost: p.decorativePostCost,
        post_rail_single_gate_cost: p.singleGateCost,
        post_rail_double_gate_cost: p.doubleGateCost,
        post_rail_surcharge_2rail: p.surcharge2rail,
        post_rail_surcharge_3rail: p.surcharge3rail,
        post_rail_surcharge_4rail: p.surcharge4rail,
        post_rail_surcharge_chainwire: p.surchargeChainwire,
      },
      { onConflict: 'company_id' }
    );

  if (error) {
    console.error('Failed to save custom pricing to Supabase', error);
  }
}
