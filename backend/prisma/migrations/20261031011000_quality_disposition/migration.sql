CREATE UNIQUE INDEX "quality_inspections_id_lot_id_key" ON "quality_inspections"("id", "lot_id");
CREATE TABLE "quality_dispositions" (
  "id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "inspection_id" UUID NOT NULL,
  "type" "QualityDispositionType" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_dispositions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quality_dispositions_reason_check" CHECK (reason ~ '[^[:space:]]')
);
CREATE UNIQUE INDEX "quality_dispositions_lot_id_key" ON "quality_dispositions"("lot_id");
CREATE UNIQUE INDEX "quality_dispositions_inspection_id_key" ON "quality_dispositions"("inspection_id");
CREATE INDEX "quality_dispositions_type_decided_at_idx" ON "quality_dispositions"("type", "decided_at");
CREATE INDEX "quality_dispositions_decided_by_user_id_decided_at_idx" ON "quality_dispositions"("decided_by_user_id", "decided_at");
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_inspection_id_lot_id_fkey" FOREIGN KEY ("inspection_id", "lot_id") REFERENCES "quality_inspections"("id", "lot_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION reject_quality_disposition_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Quality dispositions are immutable' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER quality_dispositions_immutable BEFORE UPDATE OR DELETE ON "quality_dispositions"
  FOR EACH ROW EXECUTE FUNCTION reject_quality_disposition_changes();

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_origin_check";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_origin_check" CHECK (
  ("type" = 'ADJUSTMENT_IN' AND "quantity" > 0 AND "reason" IS NOT NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'ADJUSTMENT_OUT' AND "quantity" < 0 AND "reason" IS NOT NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'PURCHASE_RECEIPT' AND "quantity" > 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NOT NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'PRODUCTION_CONSUMPTION' AND "quantity" < 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NOT NULL AND "sale_dispatch_item_id" IS NULL)
  OR ("type" = 'PRODUCTION_OUTPUT' AND "quantity" > 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NOT NULL AND "sale_dispatch_item_id" IS NULL AND "lot_id" IS NOT NULL)
  OR ("type" = 'SALE_DISPATCH' AND "quantity" < 0 AND "reason" IS NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NOT NULL)
  OR ("type" = 'QUALITY_SCRAP' AND "quantity" < 0 AND "reason" IS NULL AND "lot_id" IS NOT NULL AND "purchase_receipt_item_id" IS NULL AND "production_order_id" IS NULL AND "sale_dispatch_item_id" IS NULL)
);


CREATE UNIQUE INDEX "quality_dispositions_inspection_id_lot_id_key" ON "quality_dispositions"("inspection_id", "lot_id");
