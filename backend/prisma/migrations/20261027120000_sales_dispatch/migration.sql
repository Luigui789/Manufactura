-- The composite FK below guarantees that a dispatch item belongs to the same
-- order and product as its referenced order line.
CREATE UNIQUE INDEX "sale_order_items_id_sale_order_id_product_id_key"
  ON "sale_order_items"("id", "sale_order_id", "product_id");

CREATE TABLE "sale_dispatches" (
  "id" UUID NOT NULL,
  "number" VARCHAR(32) NOT NULL,
  "sale_order_id" UUID NOT NULL,
  "dispatched_at" TIMESTAMPTZ(6) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_dispatches_id_sale_order_id_key" UNIQUE ("id", "sale_order_id"),
  CONSTRAINT "sale_dispatches_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_dispatches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sale_dispatches_number_key" ON "sale_dispatches"("number");
CREATE INDEX "sale_dispatches_sale_order_id_dispatched_at_idx" ON "sale_dispatches"("sale_order_id", "dispatched_at");

CREATE TABLE "sale_dispatch_items" (
  "id" UUID NOT NULL,
  "sale_dispatch_id" UUID NOT NULL,
  "sale_order_id" UUID NOT NULL,
  "sale_order_item_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "lot_id" UUID,
  "quantity" DECIMAL(18,4) NOT NULL,
  CONSTRAINT "sale_dispatch_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_dispatch_items_positive_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "sale_dispatch_items_id_product_id_warehouse_id_key" UNIQUE ("id", "product_id", "warehouse_id"),
  CONSTRAINT "sale_dispatch_items_dispatch_order_fkey" FOREIGN KEY ("sale_dispatch_id", "sale_order_id") REFERENCES "sale_dispatches"("id", "sale_order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_dispatch_items_order_item_product_fkey" FOREIGN KEY ("sale_order_item_id", "sale_order_id", "product_id") REFERENCES "sale_order_items"("id", "sale_order_id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_dispatch_items_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_dispatch_items_warehouse_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_dispatch_items_lot_product_fkey" FOREIGN KEY ("lot_id", "product_id") REFERENCES "lots"("id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sale_dispatch_items_sale_dispatch_id_idx" ON "sale_dispatch_items"("sale_dispatch_id");
CREATE INDEX "sale_dispatch_items_sale_order_item_id_idx" ON "sale_dispatch_items"("sale_order_item_id");
CREATE INDEX "sale_dispatch_items_product_warehouse_idx" ON "sale_dispatch_items"("product_id", "warehouse_id");

-- A dispatch is an immutable document. Corrections belong to a future returns flow.
CREATE FUNCTION reject_sale_dispatch_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Sale dispatch documents are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'sale_dispatch_immutable';
END $$;
CREATE TRIGGER sale_dispatches_immutable BEFORE UPDATE OR DELETE ON "sale_dispatches"
  FOR EACH ROW EXECUTE FUNCTION reject_sale_dispatch_mutation();
CREATE TRIGGER sale_dispatch_items_immutable BEFORE UPDATE OR DELETE ON "sale_dispatch_items"
  FOR EACH ROW EXECUTE FUNCTION reject_sale_dispatch_mutation();

-- Every committed dispatch item must have its matching immutable ledger movement.
CREATE FUNCTION require_sale_dispatch_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inventory_movements m
    WHERE m.sale_dispatch_item_id = NEW.id
      AND m.type = 'SALE_DISPATCH'
      AND m.product_id = NEW.product_id
      AND m.warehouse_id = NEW.warehouse_id
      AND m.lot_id IS NOT DISTINCT FROM NEW.lot_id
      AND abs(m.quantity) = NEW.quantity
  ) THEN
    RAISE EXCEPTION 'Sale dispatch item requires exactly one matching inventory movement'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_dispatch_item_movement_required';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sale_dispatch_item_movement_required
  AFTER INSERT ON "sale_dispatch_items"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_sale_dispatch_movement();

ALTER TABLE "inventory_movements" ADD COLUMN "sale_dispatch_item_id" UUID;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sale_dispatch_item_id_fkey" FOREIGN KEY ("sale_dispatch_item_id") REFERENCES "sale_dispatch_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "inventory_movements_sale_dispatch_item_id_key" ON "inventory_movements"("sale_dispatch_item_id");
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_origin_check";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_origin_check" CHECK (
  ("type" = 'ADJUSTMENT_IN' AND "quantity" > 0 AND "reason" IS NOT NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'ADJUSTMENT_OUT' AND "quantity" < 0 AND "reason" IS NOT NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'PURCHASE_RECEIPT' AND "quantity" > 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NOT NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'PRODUCTION_CONSUMPTION' AND "quantity" < 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NOT NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'PRODUCTION_OUTPUT' AND "quantity" > 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NOT NULL AND "sale_dispatch_item_id" IS NULL AND "lot_id" IS NOT NULL)
  OR ("type" = 'SALE_DISPATCH' AND "quantity" < 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NOT NULL)
);

CREATE FUNCTION enforce_sale_dispatch_movement_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'SALE_DISPATCH' AND NOT EXISTS (
    SELECT 1 FROM sale_dispatch_items i
    WHERE i.id = NEW.sale_dispatch_item_id
      AND i.product_id = NEW.product_id
      AND i.warehouse_id = NEW.warehouse_id
      AND i.lot_id IS NOT DISTINCT FROM NEW.lot_id
      AND i.quantity = abs(NEW.quantity)
  ) THEN
    RAISE EXCEPTION 'Sale dispatch movement must match its dispatch item'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_movements_dispatch_item_origin_check';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_movements_dispatch_item_origin_check BEFORE INSERT OR UPDATE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION enforce_sale_dispatch_movement_origin();
