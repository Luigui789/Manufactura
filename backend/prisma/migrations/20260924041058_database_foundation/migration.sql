-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'COMPRAS', 'INVENTARIO', 'PRODUCCION', 'VENTAS');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED_GOOD', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('UNIT', 'GRAM', 'KILOGRAM', 'MILLILITER', 'LITER');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('QUARANTINED', 'RELEASED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('INITIAL_LOAD', 'PHYSICAL_COUNT', 'DAMAGE', 'LOSS', 'EXPIRY', 'CORRECTION');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ENABLE', 'DISABLE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'ADJUST_STOCK');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('USER', 'ROLE', 'PRODUCT', 'WAREHOUSE', 'LOT', 'INVENTORY_MOVEMENT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LOT');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "is_lot_tracked" BOOLEAN NOT NULL DEFAULT false,
    "requires_quality_inspection" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "LotStatus" NOT NULL,
    "originated_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" DATE,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "lot_id" UUID,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performed_by_user_id" UUID NOT NULL,
    "request_id" TEXT,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" "AuditEntityType",
    "entity_id" UUID,
    "previous_values" JSONB,
    "new_values" JSONB,
    "request_id" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_type_idx" ON "products"("type");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lots_code_key" ON "lots"("code");

-- CreateIndex
CREATE INDEX "lots_product_id_idx" ON "lots"("product_id");

-- CreateIndex
CREATE INDEX "lots_status_idx" ON "lots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lots_id_product_id_key" ON "lots"("id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_product_id_warehouse_id_key" ON "stock_balances"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_occurred_at_idx" ON "inventory_movements"("product_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_lot_id_warehouse_id_idx" ON "inventory_movements"("lot_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_movements_warehouse_id_occurred_at_idx" ON "inventory_movements"("warehouse_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_request_id_idx" ON "inventory_movements"("request_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_document_type_year_key" ON "document_sequences"("document_type", "year");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_product_id_fkey" FOREIGN KEY ("lot_id", "product_id") REFERENCES "lots"("id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma no representa estas reglas en schema.prisma. Forman parte de la
-- migración versionada para que también se recreen en la base sombra.
ALTER TABLE "products" ADD CONSTRAINT "products_quality_requires_lot_check"
  CHECK (NOT "requires_quality_inspection" OR "is_lot_tracked");

ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_nonnegative_check"
  CHECK ("quantity" >= 0);

-- Foundation solo puede registrar ajustes. El enum se amplía junto con la
-- columna FK y esta matriz cuando se introduzca cada dominio empresarial.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_adjustment_check"
  CHECK (
    ("type" = 'ADJUSTMENT_IN' AND "quantity" > 0 AND "reason" IS NOT NULL)
    OR ("type" = 'ADJUSTMENT_OUT' AND "quantity" < 0 AND "reason" IS NOT NULL)
  );

ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_range_check"
  CHECK ("year" >= 1 AND "last_number" >= 0);

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_check"
  CHECK (
    ("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL)
    OR ("actor_type" IN ('SYSTEM', 'ANONYMOUS') AND "actor_user_id" IS NULL)
  );

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_entity_pair_check"
  CHECK (("entity_type" IS NULL) = ("entity_id" IS NULL));

-- LOGIN_FAILED nunca identifica al actor, ni siquiera si la cuenta indicada
-- existe. En ese caso USER/id es el objetivo. LOGIN acredita al mismo usuario
-- como actor y entidad. IS TRUE impide que la lógica ternaria de SQL acepte NULL.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_context_check"
  CHECK ((
    ("action" = 'LOGIN_FAILED'
      AND "actor_type" = 'ANONYMOUS'
      AND ("entity_type" IS NULL OR "entity_type" = 'USER'))
    OR ("action" = 'LOGIN'
      AND "actor_type" = 'USER'
      AND "entity_type" = 'USER'
      AND "entity_id" = "actor_user_id")
    OR ("action" NOT IN ('LOGIN_FAILED', 'LOGIN')
      AND "actor_type" IN ('USER', 'SYSTEM')
      AND "entity_type" IS NOT NULL)
  ) IS TRUE);

CREATE FUNCTION prevent_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % rejects %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER inventory_movements_no_truncate
  BEFORE TRUNCATE ON "inventory_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_mutation();
