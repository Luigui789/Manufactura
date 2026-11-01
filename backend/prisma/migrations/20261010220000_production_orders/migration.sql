-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CANCEL_PRODUCTION';

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'PRODUCTION_ORDER';

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'OP';

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "product_id" UUID NOT NULL,
    "bom_version_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity_planned" DECIMAL(18,4) NOT NULL,
    "quantity_produced" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "planned_start_at" TIMESTAMPTZ(6),
    "planned_end_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_planned_quantity_positive" CHECK (quantity_planned > 0),
  ADD CONSTRAINT "production_orders_produced_quantity_nonnegative" CHECK (quantity_produced >= 0),
  ADD CONSTRAINT "production_orders_planning_window_valid" CHECK (
    planned_start_at IS NULL OR planned_end_at IS NULL OR planned_end_at >= planned_start_at
  );

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_number_key" ON "production_orders"("number");

-- CreateIndex
CREATE INDEX "production_orders_status_created_at_idx" ON "production_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "production_orders_product_id_idx" ON "production_orders"("product_id");

-- CreateIndex
CREATE INDEX "production_orders_warehouse_id_idx" ON "production_orders"("warehouse_id");

-- CreateIndex
CREATE INDEX "production_orders_bom_version_id_idx" ON "production_orders"("bom_version_id");

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bom_version_id_fkey" FOREIGN KEY ("bom_version_id") REFERENCES "bom_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
