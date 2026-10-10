-- InventoryMovement.reason must support future movements that are not adjustments.
-- Adjustment rows remain protected by inventory_movements_adjustment_check.
ALTER TABLE "inventory_movements"
  ALTER COLUMN "reason" DROP NOT NULL;
