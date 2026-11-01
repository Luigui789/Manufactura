BEGIN;
CREATE UNIQUE INDEX production_orders_id_product_id_key ON production_orders(id, product_id);
CREATE UNIQUE INDEX production_orders_id_warehouse_id_key ON production_orders(id, warehouse_id);
ALTER TABLE lots ADD COLUMN production_order_id UUID;
ALTER TABLE lots DROP CONSTRAINT lots_purchase_origin_check;
ALTER TABLE lots ADD CONSTRAINT lots_business_origin_check CHECK (
  (purchase_receipt_item_id IS NOT NULL) <> (production_order_id IS NOT NULL)
);
CREATE UNIQUE INDEX lots_production_order_id_key ON lots(production_order_id);
CREATE UNIQUE INDEX lots_production_order_id_product_id_key ON lots(production_order_id, product_id);
ALTER TABLE lots ADD CONSTRAINT lots_production_order_id_product_id_fkey
  FOREIGN KEY (production_order_id, product_id) REFERENCES production_orders(id, product_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE inventory_movements ADD COLUMN production_order_id UUID;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_production_order_id_warehouse_id_fkey
  FOREIGN KEY (production_order_id, warehouse_id) REFERENCES production_orders(id, warehouse_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX inventory_movements_production_order_id_idx ON inventory_movements(production_order_id);
CREATE UNIQUE INDEX inventory_movements_production_output_key ON inventory_movements(production_order_id)
  WHERE type = 'PRODUCTION_OUTPUT';
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_origin_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_origin_check CHECK (
  (type = 'ADJUSTMENT_IN' AND quantity > 0 AND reason IS NOT NULL AND purchase_receipt_item_id IS NULL AND production_order_id IS NULL)
  OR (type = 'ADJUSTMENT_OUT' AND quantity < 0 AND reason IS NOT NULL AND purchase_receipt_item_id IS NULL AND production_order_id IS NULL)
  OR (type = 'PURCHASE_RECEIPT' AND quantity > 0 AND reason IS NULL AND purchase_receipt_item_id IS NOT NULL AND production_order_id IS NULL)
  OR (type = 'PRODUCTION_CONSUMPTION' AND quantity < 0 AND reason IS NULL AND purchase_receipt_item_id IS NULL AND production_order_id IS NOT NULL)
  OR (type = 'PRODUCTION_OUTPUT' AND quantity > 0 AND reason IS NULL AND purchase_receipt_item_id IS NULL AND production_order_id IS NOT NULL AND lot_id IS NOT NULL)
);
ALTER TABLE production_orders ADD CONSTRAINT production_orders_execution_check CHECK (
  quantity_produced <= quantity_planned
  AND ((status IN ('DRAFT', 'CANCELLED') AND quantity_produced = 0 AND started_at IS NULL AND completed_at IS NULL)
    OR (status = 'IN_PROGRESS' AND quantity_produced = 0 AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'COMPLETED' AND quantity_produced > 0 AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= started_at))
);
-- An output must reference the very lot originated by its OP, not another OP's lot.
CREATE FUNCTION enforce_production_output_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'PRODUCTION_OUTPUT' AND NOT EXISTS (
    SELECT 1 FROM lots WHERE id = NEW.lot_id AND production_order_id = NEW.production_order_id
  ) THEN
    RAISE EXCEPTION 'Production output must use its own produced lot'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_movements_output_lot_origin_check';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_movements_output_lot_origin_check BEFORE INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION enforce_production_output_origin();
CREATE TABLE quality_inspections (
  id UUID NOT NULL PRIMARY KEY,
  lot_id UUID NOT NULL,
  result "QualityResult" NOT NULL,
  observations VARCHAR(1000) NOT NULL,
  non_conformities VARCHAR(1000),
  inspected_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inspected_by_user_id UUID NOT NULL,
  CONSTRAINT quality_inspections_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT quality_inspections_inspected_by_user_id_fkey FOREIGN KEY (inspected_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT quality_inspections_observations_check CHECK (length(btrim(observations)) > 0),
  CONSTRAINT quality_inspections_rejection_check CHECK (result <> 'REJECTED' OR length(btrim(non_conformities)) > 0 AND non_conformities IS NOT NULL)
);
CREATE UNIQUE INDEX quality_inspections_lot_id_key ON quality_inspections(lot_id);
CREATE INDEX quality_inspections_inspected_at_idx ON quality_inspections(inspected_at);
COMMIT;
