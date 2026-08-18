-- Migration: add_colorbond_pricing_columns
-- Created: 2026-08-18
--
-- Adds two new columns to custom_pricing for the Colorbond Solid Panel material.
-- Existing rows get the default rates so no NULL violations occur.

ALTER TABLE custom_pricing
  ADD COLUMN IF NOT EXISTS colorbond_panel_material_cost integer NOT NULL DEFAULT 130,
  ADD COLUMN IF NOT EXISTS colorbond_panel_labor_cost     integer NOT NULL DEFAULT 85;
