/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FenceMaterial = 'slat_fencing' | 'post_and_rail' | 'aluminium_blade';

export type FenceHeight = 900 | 1200 | 1500 | 1800 | 2100;

export interface ColorOption {
  name: string;
  hex: string;
  isColorbond: boolean;
  desc?: string;
}

export type PostType = 'standard' | 'corner' | 'gate' | 'H-post' | 'decorative';

export interface Post {
  id: string;
  x: number; // percentage of container width (0 - 100)
  y: number; // percentage of container height (0 - 100)
  type: PostType;
  customHeight?: number; // custom height override
}

export interface Segment {
  id: string;
  startPostId: string;
  endPostId: string;
  hasGate: boolean;
  gateType?: 'single' | 'double';
  gateWidthPercent?: number; // 10 to 80%
  gatePositionPercent?: number; // offset from start (usually center-ish)
  isStandaloneGate?: boolean;
}

export interface DynamicPricing {
  slatMaterialCost: number;
  postRailMaterialCost: number;
  bladeMaterialCost: number;
  slatLaborCost: number;
  postRailLaborCost: number;
  bladeLaborCost: number;
  standardPostCost: number;
  cornerPostCost: number;
  hPostCost: number;
  gatePostCost: number;
  decorativePostCost: number;
  singleGateCost: number;
  doubleGateCost: number;
}

export interface FencingPlan {
  id: string;
  name: string;
  material: FenceMaterial;
  height: FenceHeight;
  colorName: string;
  posts: Post[];
  segments: Segment[];
  backgroundUrl: string;
  customImageUploaded: boolean;
  notes?: string;
}

export interface QuoteInquiry {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  fenceLength: number; // in meters, calculated from nodes
  totalCost: number;
  // Optional itemised cost breakdown captured at save time, mirroring the
  // on-screen estimate rows. Optional for backward compatibility: proposals
  // saved before this field existed will simply not have it.
  costBreakdown?: { description: string; amount: number }[];
  message: string;
  status: 'pending' | 'reviewed' | 'accepted';
  createdAt: string;
  planSummary: {
    material: string;
    height: number;
    colorName: string;
    segmentsCount: number;
    gatesCount: number;
  };
}
