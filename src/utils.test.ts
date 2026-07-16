import { describe, it, expect } from 'vitest';
import { estimateFencingCosts, MATERIAL_MAX_SPAN } from './utils';
import type { DynamicPricing } from './types';

const TWO_POSTS = [{ type: 'standard' }, { type: 'standard' }];
const ONE_CORNER_POST = [{ type: 'corner' }];

// ---------------------------------------------------------------------------
// Helpers to compute expected values from the same formulas as the engine
// ---------------------------------------------------------------------------
function expectedIntermediate(meters: number, material: 'slat_fencing' | 'post_and_rail' | 'aluminium_blade') {
  return Math.max(0, Math.ceil(meters / MATERIAL_MAX_SPAN[material]) - 1);
}

function concreteCost(totalPostCount: number) {
  return totalPostCount * 2 * 12.5;
}

// ---------------------------------------------------------------------------
// DEFAULT PRICING
// ---------------------------------------------------------------------------
describe('estimateFencingCosts — default pricing', () => {

  it('0 posts → every field is $0', () => {
    const r = estimateFencingCosts('slat_fencing', 10, [], [], true);
    expect(r.totalPrice).toBe(0);
    expect(r.materialCost).toBe(0);
    expect(r.laborCost).toBe(0);
    expect(r.totalMeters).toBe(0);
  });

  it('10m slat, 2 standard posts, no gates, no install → correct total', () => {
    const r = estimateFencingCosts('slat_fencing', 10, TWO_POSTS, [], false);
    const intermediate = expectedIntermediate(10, 'slat_fencing'); // 3
    const totalPostCount = 2 + intermediate;
    const expected = 10 * 135 + 0 + 0 + concreteCost(totalPostCount);
    expect(r.materialCost).toBe(10 * 135);
    expect(r.laborCost).toBe(0);
    expect(r.totalPrice).toBeCloseTo(expected, 2);
  });

  it('10m slat, 2 standard posts, no gates, WITH install → correct total', () => {
    const r = estimateFencingCosts('slat_fencing', 10, TWO_POSTS, [], true);
    const intermediate = expectedIntermediate(10, 'slat_fencing'); // 3
    const totalPostCount = 2 + intermediate;
    const expected = 10 * 135 + 10 * 85 + concreteCost(totalPostCount);
    expect(r.laborCost).toBeCloseTo(10 * 85, 2);
    expect(r.totalPrice).toBeCloseTo(expected, 2);
  });

  it('10m slat, 2 standard posts, 1 single gate, with install → correct total', () => {
    const r = estimateFencingCosts('slat_fencing', 10, TWO_POSTS, [{ type: 'single' }], true);
    const intermediate = expectedIntermediate(10, 'slat_fencing');
    const totalPostCount = 2 + intermediate;
    const expected = 10 * 135 + 350 + 10 * 85 + concreteCost(totalPostCount);
    expect(r.gatesCost).toBe(350);
    expect(r.totalPrice).toBeCloseTo(expected, 2);
  });

  it('10m post_and_rail, 2 standard posts, no gates, with install → correct total', () => {
    const r = estimateFencingCosts('post_and_rail', 10, TWO_POSTS, [], true);
    const intermediate = expectedIntermediate(10, 'post_and_rail'); // 3
    const totalPostCount = 2 + intermediate;
    const expected = 10 * 105 + 10 * 75 + concreteCost(totalPostCount);
    expect(r.materialCost).toBe(10 * 105);
    expect(r.laborCost).toBeCloseTo(10 * 75, 2);
    expect(r.totalPrice).toBeCloseTo(expected, 2);
  });

  it('10m aluminium_blade, 2 standard posts, no gates, with install → correct total', () => {
    const r = estimateFencingCosts('aluminium_blade', 10, TWO_POSTS, [], true);
    const intermediate = expectedIntermediate(10, 'aluminium_blade'); // ceil(10/2.364)-1 = 4-1 = 3... let engine decide
    const totalPostCount = 2 + intermediate;
    const expected = 10 * 155 + 10 * 85 + concreteCost(totalPostCount);
    expect(r.materialCost).toBe(10 * 155);
    expect(r.laborCost).toBeCloseTo(10 * 85, 2);
    expect(r.totalPrice).toBeCloseTo(expected, 2);
  });

  it('intermediate post count: 10m slat = ceil(10/2.4)-1 = 4', () => {
    // 10 / 2.4 = 4.166... → ceil = 5 → 5-1 = 4 intermediate posts
    const r = estimateFencingCosts('slat_fencing', 10, TWO_POSTS, [], false);
    expect(r.intermediatePostCount).toBe(4);
  });

});

// ---------------------------------------------------------------------------
// CUSTOM PRICING
// ---------------------------------------------------------------------------
const BASE_CUSTOM: DynamicPricing = {
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

describe('estimateFencingCosts — custom pricing overrides', () => {

  it('custom material rate $200/m overrides default $135/m for slat', () => {
    const custom: DynamicPricing = { ...BASE_CUSTOM, slatMaterialCost: 200 };
    const r = estimateFencingCosts('slat_fencing', 10, TWO_POSTS, [], false, custom);
    expect(r.materialCost).toBe(10 * 200);
  });

  it('custom labour rate $100/m overrides default $85/m for slat', () => {
    const custom: DynamicPricing = { ...BASE_CUSTOM, slatLaborCost: 100 };
    const r = estimateFencingCosts('slat_fencing', 10, TWO_POSTS, [], true, custom);
    expect(r.laborCost).toBeCloseTo(10 * 100, 2);
  });

  it('custom single gate cost $500 overrides default $350', () => {
    const custom: DynamicPricing = { ...BASE_CUSTOM, singleGateCost: 500 };
    const r = estimateFencingCosts('slat_fencing', 10, TWO_POSTS, [{ type: 'single' }], false, custom);
    expect(r.gatesCost).toBe(500);
  });

  it('custom corner post cost $100 overrides default $65', () => {
    const custom: DynamicPricing = { ...BASE_CUSTOM, cornerPostCost: 100 };
    const r = estimateFencingCosts('slat_fencing', 10, ONE_CORNER_POST, [], false, custom);
    expect(r.postsCost).toBe(100);
  });

});
