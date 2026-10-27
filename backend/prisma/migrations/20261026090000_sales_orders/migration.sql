-- Sales Orders (RF-VEN-002). Confirmation is informational and does not mutate inventory.
CREATE TYPE "SaleOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'CANCELLED');
ALTER TYPE "AuditEntityType" ADD VALUE 'SALES_ORDER';
ALTER TYPE "DocumentType" ADD VALUE 'SALE_ORDER';

CREATE TABLE "sale_orders" (
  "id" UUID NOT NULL,
  "number" VARCHAR(32) NOT NULL,
  "customer_id" UUID NOT NULL,
  "status" "SaleOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "ordered_at" TIMESTAMPTZ(6) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sale_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_order_items" (
  "id" UUID NOT NULL,
  "sale_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit_price" DECIMAL(14,4) NOT NULL,
  "line_total" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "sale_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_order_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "sale_order_items_unit_price_nonnegative" CHECK ("unit_price" >= 0),
  CONSTRAINT "sale_order_items_line_total_nonnegative" CHECK ("line_total" >= 0),
  CONSTRAINT "sale_order_items_line_total_matches" CHECK ("line_total" = round("quantity" * "unit_price", 2))
);

CREATE UNIQUE INDEX "sale_orders_number_key" ON "sale_orders"("number");
CREATE INDEX "sale_orders_status_ordered_at_idx" ON "sale_orders"("status", "ordered_at");
CREATE INDEX "sale_orders_customer_id_ordered_at_idx" ON "sale_orders"("customer_id", "ordered_at");
CREATE INDEX "sale_order_items_sale_order_id_idx" ON "sale_order_items"("sale_order_id");
CREATE INDEX "sale_order_items_product_id_idx" ON "sale_order_items"("product_id");

ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_sale_order_id_fkey"
  FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
