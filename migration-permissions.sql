-- Migration: Add permissions JSONB column to staff table
-- NULL = use role template defaults, non-null = custom permissions

ALTER TABLE staff ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;
