ALTER TYPE "AuditEntityType" ADD VALUE 'PRODUCTION_ROUTE';

CREATE TABLE "production_routes" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "production_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_routes_code_check" CHECK (length(btrim(code)) > 0),
  CONSTRAINT "production_routes_name_check" CHECK (length(btrim(name)) > 0)
);
CREATE TABLE "route_operations" (
  "id" UUID NOT NULL,
  "route_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "standard_minutes" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "route_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "route_operations_name_check" CHECK (length(btrim(name)) > 0),
  CONSTRAINT "route_operations_sequence_check" CHECK (sequence > 0),
  CONSTRAINT "route_operations_minutes_check" CHECK (standard_minutes > 0)
);
CREATE UNIQUE INDEX "production_routes_product_id_key" ON "production_routes"("product_id");
CREATE UNIQUE INDEX "production_routes_code_key" ON "production_routes"("code");
CREATE INDEX "production_routes_is_active_idx" ON "production_routes"("is_active");
CREATE UNIQUE INDEX "route_operations_route_id_sequence_key" ON "route_operations"("route_id", "sequence");
CREATE INDEX "route_operations_route_id_idx" ON "route_operations"("route_id");
ALTER TABLE "production_routes" ADD CONSTRAINT "production_routes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "route_operations" ADD CONSTRAINT "route_operations_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "production_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
