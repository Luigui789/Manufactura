-- Shared purchase migration is preserved. This correction enables operational receipts.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM lots WHERE purchase_receipt_item_id IS NULL) THEN
    RAISE EXCEPTION 'Purchases migration blocked: existing lots have no business origin. Resolve explicitly before retrying; no automatic backfill is permitted.';
  END IF;
END $$;
ALTER TABLE lots ADD CONSTRAINT lots_purchase_origin_check CHECK (purchase_receipt_item_id IS NOT NULL);
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_adjustment_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_origin_check CHECK (
  (type = 'ADJUSTMENT_IN' AND quantity > 0 AND reason IS NOT NULL AND purchase_receipt_item_id IS NULL)
  OR (type = 'ADJUSTMENT_OUT' AND quantity < 0 AND reason IS NOT NULL AND purchase_receipt_item_id IS NULL)
  OR (type = 'PURCHASE_RECEIPT' AND quantity > 0 AND reason IS NULL AND purchase_receipt_item_id IS NOT NULL)
);
CREATE UNIQUE INDEX inventory_movements_purchase_receipt_item_id_key ON inventory_movements(purchase_receipt_item_id);
CREATE UNIQUE INDEX purchase_order_items_id_product_id_key ON purchase_order_items(id, product_id);
CREATE UNIQUE INDEX purchase_receipt_items_id_product_id_key ON purchase_receipt_items(id, product_id);
CREATE UNIQUE INDEX purchase_receipt_items_id_product_id_warehouse_id_quantity_key ON purchase_receipt_items(id, product_id, warehouse_id, quantity);
ALTER TABLE purchase_receipt_items DROP CONSTRAINT purchase_receipt_items_purchase_order_item_id_fkey;
ALTER TABLE purchase_receipt_items ADD CONSTRAINT purchase_receipt_items_purchase_order_item_id_product_id_fkey FOREIGN KEY (purchase_order_item_id, product_id) REFERENCES purchase_order_items(id, product_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE lots DROP CONSTRAINT lots_purchase_receipt_item_id_fkey;
ALTER TABLE lots ADD CONSTRAINT lots_purchase_receipt_item_id_product_id_fkey FOREIGN KEY (purchase_receipt_item_id, product_id) REFERENCES purchase_receipt_items(id, product_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_purchase_receipt_item_id_fkey;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_receipt_line_fkey FOREIGN KEY (purchase_receipt_item_id, product_id, warehouse_id, quantity) REFERENCES purchase_receipt_items(id, product_id, warehouse_id, quantity) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_values_check CHECK (quantity_ordered > 0 AND unit_price >= 0 AND line_total = round(quantity_ordered * unit_price, 2));
ALTER TABLE purchase_receipt_items ADD CONSTRAINT purchase_receipt_items_quantity_check CHECK (quantity > 0);
CREATE INDEX purchase_orders_status_created_at_idx ON purchase_orders(status, created_at);
CREATE INDEX purchase_orders_supplier_id_idx ON purchase_orders(supplier_id);
CREATE INDEX purchase_order_items_purchase_order_id_idx ON purchase_order_items(purchase_order_id);
CREATE INDEX purchase_receipts_purchase_order_id_received_at_idx ON purchase_receipts(purchase_order_id, received_at);
CREATE INDEX purchase_receipt_items_purchase_order_item_id_idx ON purchase_receipt_items(purchase_order_item_id);
CREATE INDEX purchase_receipt_items_purchase_receipt_id_idx ON purchase_receipt_items(purchase_receipt_id);
CREATE UNIQUE INDEX lots_purchase_receipt_item_id_product_id_key ON lots(purchase_receipt_item_id, product_id);
CREATE UNIQUE INDEX inventory_movements_receipt_line_key ON inventory_movements(purchase_receipt_item_id, product_id, warehouse_id, quantity);
COMMIT;
