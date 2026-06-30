/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorOption, FenceMaterial, FenceHeight, DynamicPricing } from './types';

export const COLORS_PALETTE: ColorOption[] = [
  { name: 'Monument Grey', hex: '#3B3F42', isColorbond: true, desc: 'Sophisticated deep charcoal, the modern standard' },
  { name: 'Primrose', hex: '#EDE2C9', isColorbond: true, desc: 'Classic warm cream / yellow sand color' },
  { name: 'Basalt', hex: '#686C6E', isColorbond: true, desc: 'Solid, medium blue-grey steel' },
  { name: 'Woodland Grey', hex: '#4D514A', isColorbond: true, desc: 'Deep olive grey, rich and organic' },
  { name: 'Surfmist', hex: '#E4E2DC', isColorbond: true, desc: 'Fresh, off-white, light and architectural' },
  { name: 'Black', hex: '#111111', isColorbond: true, desc: 'Bold, deep solid black' },
  { name: 'Cottage Green', hex: '#2E473B', isColorbond: true, desc: 'Classic rich deep Heritage green' },
  { name: 'Boral Brown', hex: '#61564D', isColorbond: true, desc: 'Rich earthy brown / Jasper tone' },
  { name: 'Manor Red', hex: '#6A2D2B', isColorbond: true, desc: 'Deep red ochre / heritage red' },
  { name: 'Dune', hex: '#C1B8A7', isColorbond: true, desc: 'Warm sand-beige, balancing warmth and cool' },
  { name: 'Shale Grey', hex: '#BEC2C1', isColorbond: true, desc: 'Soft silver-grey, light and modern' },
  { name: 'Raw Natural Wood', hex: '#C19A6B', isColorbond: false, desc: 'Traditional rustic raw wood with authentic grain' }
];

export const FENCE_PRICES: Record<FenceMaterial, { basePerMeter: number; label: string }> = {
  slat_fencing: {
    label: 'Modern Slat Fencing',
    basePerMeter: 135
  },
  post_and_rail: {
    label: 'Post & Rail + Black Chainwire',
    basePerMeter: 105
  },
  aluminium_blade: {
    label: 'Aluminium Blade Fencing',
    basePerMeter: 155
  }
};

// Max structural panel span per material — drives both billing (intermediatePostCount) and
// canvas rendering (visual post spacing) so they always agree.
export const MATERIAL_MAX_SPAN: Record<FenceMaterial, number> = {
  slat_fencing: 2.4,    // AS-2423 standard 2400mm panel
  post_and_rail: 2.4,   // AS-2423 standard 2400mm panel
  aluminium_blade: 2.364 // CAD-derived: 2364mm max structural blade panel span
};

export const POST_UPGRADE_COSTS = {
  standard: 0,
  corner: 65,
  'H-post': 95,
  gate: 85,
  decorative: 145
};

export function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function estimateFencingCosts(
  material: FenceMaterial,
  propertyFrontageMeters: number, // locked map measurement; canvas drawing is visual-only and never affects billing
  postsList: { type: string }[],
  gatesList: { type?: 'single' | 'double' }[],
  installIncluded: boolean = true,
  customPricing?: DynamicPricing
) {
  // Guard clause: if there are no posts on canvas, the total meters and total cost must remain exactly 0
  if (!postsList || postsList.length === 0) {
    return {
      totalMeters: 0,
      ratePerMeter: 0,
      materialCost: 0,
      postsCost: 0,
      gatesCost: 0,
      concreteCost: 0,
      laborCost: 0,
      totalPrice: 0,
      postCount: 0,
      intermediatePostCount: 0,
      concreteBagsCount: 0
    };
  }

  // Billing length is the locked map measurement, not the on-canvas drawing geometry
  const totalMeters = parseFloat(propertyFrontageMeters.toFixed(1));

  // Material-specific max structural span drives intermediate post count
  const maxSpanLength = MATERIAL_MAX_SPAN[material];
  const intermediatePostCount = Math.max(0, Math.ceil(totalMeters / maxSpanLength) - 1);

  // Base Price
  const materialDetails = FENCE_PRICES[material];
  const baseRate = customPricing
    ? (material === 'slat_fencing' ? customPricing.slatMaterialCost
      : material === 'aluminium_blade' ? customPricing.bladeMaterialCost
      : customPricing.postRailMaterialCost)
    : (materialDetails?.basePerMeter || 100);

  const ratePerMeter = baseRate;
  const rawMaterialCost = totalMeters * ratePerMeter;
  
  // Post costs
  let totalPostsCost = 0;
  postsList.forEach(p => {
    if (customPricing) {
      if (p.type === 'standard') totalPostsCost += customPricing.standardPostCost;
      else if (p.type === 'corner') totalPostsCost += customPricing.cornerPostCost;
      else if (p.type === 'H-post') totalPostsCost += customPricing.hPostCost;
      else if (p.type === 'gate') totalPostsCost += customPricing.gatePostCost;
      else if (p.type === 'decorative') totalPostsCost += customPricing.decorativePostCost;
    } else {
      totalPostsCost += POST_UPGRADE_COSTS[p.type as keyof typeof POST_UPGRADE_COSTS] || 0;
    }
  });

  // Mandatory intermediate line posts are billed as standard structural posts
  totalPostsCost += intermediatePostCount * (customPricing ? customPricing.standardPostCost : POST_UPGRADE_COSTS.standard);

  // Gate costs
  let totalGatesCost = 0;
  gatesList.forEach(g => {
    if (g.type === 'double') {
      totalGatesCost += customPricing ? customPricing.doubleGateCost : 750; // Double swing gate
    } else {
      totalGatesCost += customPricing ? customPricing.singleGateCost : 350; // Single pedestrian gate
    }
  });

  const materialsSubtotal = rawMaterialCost + totalPostsCost + totalGatesCost;
  
  // Labor installation estimate (Sydney average: $55 to $85 per meter depending on material)
  const defaultLaborRate = material === 'post_and_rail' ? 75 : 85;
  const laborRatePerMeter = customPricing
    ? (material === 'slat_fencing' ? customPricing.slatLaborCost
      : material === 'aluminium_blade' ? customPricing.bladeLaborCost
      : customPricing.postRailLaborCost)
    : defaultLaborRate;

  const laborCost = installIncluded ? totalMeters * laborRatePerMeter : 0;
  
  // Total structural post count = drawn corner/end posts + mandatory intermediate line posts
  const totalPostCount = postsList.length + intermediatePostCount;

  // Concrete bags and brackets estimate
  const concreteBagsCount = totalPostCount * 2; // ~2 bags per post
  const concreteCost = concreteBagsCount * 12.5; // $12.50 per bag

  const totalPrice = materialsSubtotal + laborCost + concreteCost;

  return {
    totalMeters,
    ratePerMeter,
    materialCost: parseFloat(rawMaterialCost.toFixed(2)),
    postsCost: totalPostsCost,
    gatesCost: totalGatesCost,
    concreteCost: parseFloat(concreteCost.toFixed(2)),
    laborCost: parseFloat(laborCost.toFixed(2)),
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    postCount: totalPostCount,
    intermediatePostCount,
    concreteBagsCount
  };
}
