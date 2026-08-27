-- Migration: add_per_material_pricing_columns
-- Created: 2026-08-27
--
-- Adds per-material post upgrade costs, gate costs, and sub-variant surcharges
-- to custom_pricing. All columns are nullable with defaults matching the
-- corporate standard rates, so existing rows are not broken and the app's
-- rowToPricing fallback chain works immediately after deployment.
--
-- Slat Fencing
ALTER TABLE custom_pricing
  ADD COLUMN IF NOT EXISTS slat_standard_post_cost   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slat_corner_post_cost     integer DEFAULT 65,
  ADD COLUMN IF NOT EXISTS slat_h_post_cost          integer DEFAULT 95,
  ADD COLUMN IF NOT EXISTS slat_gate_post_cost       integer DEFAULT 85,
  ADD COLUMN IF NOT EXISTS slat_decorative_post_cost integer DEFAULT 145,
  ADD COLUMN IF NOT EXISTS slat_single_gate_cost     integer DEFAULT 350,
  ADD COLUMN IF NOT EXISTS slat_double_gate_cost     integer DEFAULT 750,
  ADD COLUMN IF NOT EXISTS slat_surcharge_65mm       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slat_surcharge_90mm       integer DEFAULT 18;

-- Post & Rail
ALTER TABLE custom_pricing
  ADD COLUMN IF NOT EXISTS post_rail_standard_post_cost   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_rail_corner_post_cost     integer DEFAULT 65,
  ADD COLUMN IF NOT EXISTS post_rail_h_post_cost          integer DEFAULT 95,
  ADD COLUMN IF NOT EXISTS post_rail_gate_post_cost       integer DEFAULT 85,
  ADD COLUMN IF NOT EXISTS post_rail_decorative_post_cost integer DEFAULT 145,
  ADD COLUMN IF NOT EXISTS post_rail_single_gate_cost     integer DEFAULT 350,
  ADD COLUMN IF NOT EXISTS post_rail_double_gate_cost     integer DEFAULT 750,
  ADD COLUMN IF NOT EXISTS post_rail_surcharge_2rail      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_rail_surcharge_3rail      integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS post_rail_surcharge_4rail      integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS post_rail_surcharge_chainwire  integer DEFAULT 12;

-- Aluminium Blade
ALTER TABLE custom_pricing
  ADD COLUMN IF NOT EXISTS blade_standard_post_cost   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blade_corner_post_cost     integer DEFAULT 65,
  ADD COLUMN IF NOT EXISTS blade_h_post_cost          integer DEFAULT 95,
  ADD COLUMN IF NOT EXISTS blade_gate_post_cost       integer DEFAULT 85,
  ADD COLUMN IF NOT EXISTS blade_decorative_post_cost integer DEFAULT 145,
  ADD COLUMN IF NOT EXISTS blade_single_gate_cost     integer DEFAULT 350,
  ADD COLUMN IF NOT EXISTS blade_double_gate_cost     integer DEFAULT 750;

-- Colorbond Solid Panel
ALTER TABLE custom_pricing
  ADD COLUMN IF NOT EXISTS colorbond_standard_post_cost   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colorbond_corner_post_cost     integer DEFAULT 65,
  ADD COLUMN IF NOT EXISTS colorbond_h_post_cost          integer DEFAULT 95,
  ADD COLUMN IF NOT EXISTS colorbond_gate_post_cost       integer DEFAULT 85,
  ADD COLUMN IF NOT EXISTS colorbond_decorative_post_cost integer DEFAULT 145,
  ADD COLUMN IF NOT EXISTS colorbond_single_gate_cost     integer DEFAULT 350,
  ADD COLUMN IF NOT EXISTS colorbond_double_gate_cost     integer DEFAULT 750;

-- Aluminium Perforated
ALTER TABLE custom_pricing
  ADD COLUMN IF NOT EXISTS perforated_standard_post_cost   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perforated_corner_post_cost     integer DEFAULT 65,
  ADD COLUMN IF NOT EXISTS perforated_h_post_cost          integer DEFAULT 95,
  ADD COLUMN IF NOT EXISTS perforated_gate_post_cost       integer DEFAULT 85,
  ADD COLUMN IF NOT EXISTS perforated_decorative_post_cost integer DEFAULT 145,
  ADD COLUMN IF NOT EXISTS perforated_single_gate_cost     integer DEFAULT 350,
  ADD COLUMN IF NOT EXISTS perforated_double_gate_cost     integer DEFAULT 750;

-- Backfill existing rows: copy the current shared values into the new
-- per-material columns so no contractor loses their previously saved rates.
UPDATE custom_pricing SET
  slat_standard_post_cost   = COALESCE(slat_standard_post_cost,   standard_post_cost,   0),
  slat_corner_post_cost     = COALESCE(slat_corner_post_cost,     corner_post_cost,     65),
  slat_h_post_cost          = COALESCE(slat_h_post_cost,          h_post_cost,          95),
  slat_gate_post_cost       = COALESCE(slat_gate_post_cost,       gate_post_cost,       85),
  slat_decorative_post_cost = COALESCE(slat_decorative_post_cost, decorative_post_cost, 145),
  slat_single_gate_cost     = COALESCE(slat_single_gate_cost,     single_gate_cost,     350),
  slat_double_gate_cost     = COALESCE(slat_double_gate_cost,     double_gate_cost,     750),
  post_rail_standard_post_cost   = COALESCE(post_rail_standard_post_cost,   standard_post_cost,   0),
  post_rail_corner_post_cost     = COALESCE(post_rail_corner_post_cost,     corner_post_cost,     65),
  post_rail_h_post_cost          = COALESCE(post_rail_h_post_cost,          h_post_cost,          95),
  post_rail_gate_post_cost       = COALESCE(post_rail_gate_post_cost,       gate_post_cost,       85),
  post_rail_decorative_post_cost = COALESCE(post_rail_decorative_post_cost, decorative_post_cost, 145),
  post_rail_single_gate_cost     = COALESCE(post_rail_single_gate_cost,     single_gate_cost,     350),
  post_rail_double_gate_cost     = COALESCE(post_rail_double_gate_cost,     double_gate_cost,     750),
  blade_standard_post_cost   = COALESCE(blade_standard_post_cost,   standard_post_cost,   0),
  blade_corner_post_cost     = COALESCE(blade_corner_post_cost,     corner_post_cost,     65),
  blade_h_post_cost          = COALESCE(blade_h_post_cost,          h_post_cost,          95),
  blade_gate_post_cost       = COALESCE(blade_gate_post_cost,       gate_post_cost,       85),
  blade_decorative_post_cost = COALESCE(blade_decorative_post_cost, decorative_post_cost, 145),
  blade_single_gate_cost     = COALESCE(blade_single_gate_cost,     single_gate_cost,     350),
  blade_double_gate_cost     = COALESCE(blade_double_gate_cost,     double_gate_cost,     750),
  colorbond_standard_post_cost   = COALESCE(colorbond_standard_post_cost,   standard_post_cost,   0),
  colorbond_corner_post_cost     = COALESCE(colorbond_corner_post_cost,     corner_post_cost,     65),
  colorbond_h_post_cost          = COALESCE(colorbond_h_post_cost,          h_post_cost,          95),
  colorbond_gate_post_cost       = COALESCE(colorbond_gate_post_cost,       gate_post_cost,       85),
  colorbond_decorative_post_cost = COALESCE(colorbond_decorative_post_cost, decorative_post_cost, 145),
  colorbond_single_gate_cost     = COALESCE(colorbond_single_gate_cost,     single_gate_cost,     350),
  colorbond_double_gate_cost     = COALESCE(colorbond_double_gate_cost,     double_gate_cost,     750),
  perforated_standard_post_cost   = COALESCE(perforated_standard_post_cost,   standard_post_cost,   0),
  perforated_corner_post_cost     = COALESCE(perforated_corner_post_cost,     corner_post_cost,     65),
  perforated_h_post_cost          = COALESCE(perforated_h_post_cost,          h_post_cost,          95),
  perforated_gate_post_cost       = COALESCE(perforated_gate_post_cost,       gate_post_cost,       85),
  perforated_decorative_post_cost = COALESCE(perforated_decorative_post_cost, decorative_post_cost, 145),
  perforated_single_gate_cost     = COALESCE(perforated_single_gate_cost,     single_gate_cost,     350),
  perforated_double_gate_cost     = COALESCE(perforated_double_gate_cost,     double_gate_cost,     750);
