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
  { name: 'Raw Natural Wood', hex: '#C19A6B', isColorbond: false, desc: 'Traditional rustic raw wood with authentic grain' },
  { name: 'Natural Tan', hex: '#C8965A', isColorbond: false, desc: 'Warm honey-tan timber stain — sun-kissed rustic look' },
  { name: 'Reddish-Brown', hex: '#7A3B2E', isColorbond: false, desc: 'Deep reddish-brown cedar stain — rich, uniform finish' },
  { name: 'Evening Haze', hex: '#C5C2AA', isColorbond: true, desc: 'Warm greige — soft, contemporary, and versatile' },
  { name: 'Paperbark', hex: '#CABFA4', isColorbond: true, desc: 'Warm parchment cream, organic and natural' },
  { name: 'Domain', hex: '#E8DBAE', isColorbond: true, desc: 'Light sandy gold, warm and airy' },
  { name: 'Riversand', hex: '#9D8D76', isColorbond: true, desc: 'Mid warm sandy brown-grey' },
  { name: 'Ironstone', hex: '#3E434C', isColorbond: true, desc: 'Dark cool grey, strong and contemporary' },
  { name: 'Wallaby', hex: '#7F7C78', isColorbond: true, desc: 'Warm mid grey-brown, earthy and versatile' },
  { name: 'Silver Pearl Satin', hex: '#C9CACC', isColorbond: false, desc: 'Satin aluminium silver — clean, neutral powder-coat finish' }
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
  },
  colorbond_solid_panel: {
    // Kit cost $142.99 / 2.4m = ~$60/m panels + posts + rails included.
    // Rounded to $130 to land between post_and_rail ($105) and slat ($135),
    // reflecting simpler install than slat but premium Colorbond sheet product.
    label: 'Colorbond Solid Panel Fence',
    basePerMeter: 130
  },
  aluminium_perforated: {
    // Retail kit (2000×1200mm framed panel) retails A$549–594, ~$275/m — inflated by
    // retail markup and hardware bundles. Installed trade rate for certified pool-safety
    // aluminium perforated fencing runs $180–250/m. We set $185/m: a 20% premium over
    // aluminium blade ($155) reflecting the AS1926.1 pool-compliance spec and thicker
    // extruded frame system, without anchoring to retail kit pricing.
    label: 'Aluminium Perforated Panel',
    basePerMeter: 185
  }
};

// Max structural panel span per material — drives both billing (intermediatePostCount) and
// canvas rendering (visual post spacing) so they always agree.
export const MATERIAL_MAX_SPAN: Record<FenceMaterial, number> = {
  slat_fencing: 2.4,    // AS-2423 standard 2400mm panel
  post_and_rail: 2.4,   // AS-2423 standard 2400mm panel
  aluminium_blade: 2.364, // CAD-derived: 2364mm max structural blade panel span
  colorbond_solid_panel: 2.4,  // 2400mm standard panel kit width
  aluminium_perforated: 2.0   // 2000mm framed panel kit width
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
  customPricing?: DynamicPricing,
  subVariants?: { slatProfile?: '65' | '90'; railCount?: 2 | 3 | 4; includeChainwire?: boolean }
) {
  // Guard: no measurement = nothing to quote
  if (!propertyFrontageMeters || propertyFrontageMeters <= 0) {
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

  // When no canvas posts exist, assume two standard endpoint posts for a straight run.
  // Canvas posts (with type upgrades) are used when present.
  const effectivePosts = postsList && postsList.length > 0
    ? postsList
    : [{ type: 'standard' }, { type: 'standard' }];

  // Material-specific max structural span drives intermediate post count
  const maxSpanLength = MATERIAL_MAX_SPAN[material];
  const intermediatePostCount = Math.max(0, Math.ceil(totalMeters / maxSpanLength) - 1);

  // Per-material pricing block (nested structure)
  const mp = customPricing?.[material];
  const materialDetails = FENCE_PRICES[material];

  // Base material rate + additive sub-variant surcharges
  let baseRate = mp?.materialCostPerMeter ?? materialDetails?.basePerMeter ?? 100;
  if (material === 'slat_fencing' && mp) {
    const slatMp = mp as typeof customPricing.slat_fencing;
    if (subVariants?.slatProfile === '90') baseRate += slatMp.surcharge90mm ?? 18;
    else if (subVariants?.slatProfile === '65') baseRate += slatMp.surcharge65mm ?? 0;
  }
  if (material === 'post_and_rail' && mp) {
    const prMp = mp as typeof customPricing.post_and_rail;
    const rc = subVariants?.railCount;
    if (rc === 3) baseRate += prMp.surcharge3rail ?? 15;
    else if (rc === 4) baseRate += prMp.surcharge4rail ?? 30;
    if (subVariants?.includeChainwire) baseRate += prMp.surchargeChainwire ?? 12;
  }

  const ratePerMeter = baseRate;
  const rawMaterialCost = totalMeters * ratePerMeter;

  // Post costs — per-material, falling back to static defaults
  let totalPostsCost = 0;
  effectivePosts.forEach(p => {
    if (mp) {
      if (p.type === 'standard') totalPostsCost += mp.standardPostCost;
      else if (p.type === 'corner') totalPostsCost += mp.cornerPostCost;
      else if (p.type === 'H-post') totalPostsCost += mp.hPostCost;
      else if (p.type === 'gate') totalPostsCost += mp.gatePostCost;
      else if (p.type === 'decorative') totalPostsCost += mp.decorativePostCost;
    } else {
      totalPostsCost += POST_UPGRADE_COSTS[p.type as keyof typeof POST_UPGRADE_COSTS] || 0;
    }
  });

  // Mandatory intermediate line posts are billed as standard structural posts
  totalPostsCost += intermediatePostCount * (mp ? mp.standardPostCost : POST_UPGRADE_COSTS.standard);

  // Gate costs — per-material
  let totalGatesCost = 0;
  gatesList.forEach(g => {
    if (g.type === 'double') {
      totalGatesCost += mp ? mp.doubleGateCost : 750;
    } else {
      totalGatesCost += mp ? mp.singleGateCost : 350;
    }
  });

  const materialsSubtotal = rawMaterialCost + totalPostsCost + totalGatesCost;

  // Labor installation estimate (Sydney average: $55 to $85 per meter depending on material)
  const defaultLaborRate = material === 'post_and_rail' ? 75 : 85;
  const laborRatePerMeter = mp?.laborCostPerMeter ?? defaultLaborRate;

  const laborCost = installIncluded ? totalMeters * laborRatePerMeter : 0;
  
  // Total structural post count = endpoint posts + mandatory intermediate line posts
  const totalPostCount = effectivePosts.length + intermediatePostCount;

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
