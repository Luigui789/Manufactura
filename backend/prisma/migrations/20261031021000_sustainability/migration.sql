-- CreateEnum
CREATE TYPE "CarbonActivityUnit" AS ENUM ('UNIT', 'GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'KWH', 'KILOMETER', 'TON_KILOMETER');

-- CreateEnum
CREATE TYPE "CarbonActivityCategory" AS ENUM ('RAW_MATERIAL', 'ENERGY', 'INBOUND_TRANSPORT', 'PACKAGING', 'WASTE');

-- CreateEnum
CREATE TYPE "CarbonActivitySource" AS ENUM ('PRODUCTION_CONSUMPTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "CarbonFootprintStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "CarbonFootprintScope" AS ENUM ('PARTIAL_CRADLE_TO_GATE');

-- CreateTable
CREATE TABLE "emission_factors" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" "CarbonActivityCategory" NOT NULL,
    "activity_unit" "CarbonActivityUnit" NOT NULL,
    "kg_co2e_per_unit" DECIMAL(20,8) NOT NULL,
    "product_id" UUID,
    "source_name" VARCHAR(200) NOT NULL,
    "source_reference" VARCHAR(1000) NOT NULL,
    "source_year" INTEGER,
    "notes" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "emission_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_footprints" (
    "id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "status" "CarbonFootprintStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "CarbonFootprintScope" NOT NULL,
    "total_kg_co2e" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "quantity_produced_snapshot" DECIMAL(18,4) NOT NULL,
    "output_unit_snapshot" "UnitOfMeasure" NOT NULL,
    "kg_co2e_per_output_unit" DECIMAL(20,8),
    "boundary_notes" VARCHAR(2000),
    "calculated_at" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),
    "finalized_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_footprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carbon_activities" (
    "id" UUID NOT NULL,
    "footprint_id" UUID NOT NULL,
    "category" "CarbonActivityCategory" NOT NULL,
    "source" "CarbonActivitySource" NOT NULL,
    "description" VARCHAR(250) NOT NULL,
    "activity_quantity" DECIMAL(20,8) NOT NULL,
    "activity_unit" "CarbonActivityUnit" NOT NULL,
    "original_quantity" DECIMAL(20,8),
    "original_unit" "CarbonActivityUnit",
    "emission_factor_id" UUID NOT NULL,
    "factor_code_snapshot" VARCHAR(50) NOT NULL,
    "factor_name_snapshot" VARCHAR(150) NOT NULL,
    "factor_value_snapshot" DECIMAL(20,8) NOT NULL,
    "factor_source_name_snapshot" VARCHAR(200) NOT NULL,
    "factor_source_reference_snapshot" VARCHAR(1000) NOT NULL,
    "factor_source_year_snapshot" INTEGER,
    "emissions_kg_co2e" DECIMAL(20,8) NOT NULL,
    "inventory_movement_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carbon_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circular_material_profiles" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "metric_code" VARCHAR(80) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "reporting_unit" "CarbonActivityUnit" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "circular_material_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emission_factors_code_key" ON "emission_factors"("code");

-- CreateIndex
CREATE INDEX "emission_factors_category_is_active_idx" ON "emission_factors"("category", "is_active");

-- CreateIndex
CREATE INDEX "emission_factors_product_id_is_active_idx" ON "emission_factors"("product_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "production_footprints_production_order_id_key" ON "production_footprints"("production_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_footprints_lot_id_key" ON "production_footprints"("lot_id");

-- CreateIndex
CREATE INDEX "production_footprints_status_idx" ON "production_footprints"("status");

-- CreateIndex
CREATE UNIQUE INDEX "production_footprints_lot_id_production_order_id_key" ON "production_footprints"("lot_id", "production_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "carbon_activities_inventory_movement_id_key" ON "carbon_activities"("inventory_movement_id");

-- CreateIndex
CREATE INDEX "carbon_activities_footprint_id_category_idx" ON "carbon_activities"("footprint_id", "category");

-- CreateIndex
CREATE INDEX "carbon_activities_emission_factor_id_idx" ON "carbon_activities"("emission_factor_id");

-- CreateIndex
CREATE UNIQUE INDEX "circular_material_profiles_product_id_key" ON "circular_material_profiles"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "circular_material_profiles_metric_code_key" ON "circular_material_profiles"("metric_code");

-- CreateIndex
CREATE UNIQUE INDEX "lots_id_production_order_id_key" ON "lots"("id", "production_order_id");

-- AddForeignKey
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_footprints" ADD CONSTRAINT "production_footprints_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_footprints" ADD CONSTRAINT "production_footprints_lot_order_fkey" FOREIGN KEY ("lot_id", "production_order_id") REFERENCES "lots"("id", "production_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_footprints" ADD CONSTRAINT "production_footprints_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbon_activities" ADD CONSTRAINT "carbon_activities_footprint_id_fkey" FOREIGN KEY ("footprint_id") REFERENCES "production_footprints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbon_activities" ADD CONSTRAINT "carbon_activities_emission_factor_id_fkey" FOREIGN KEY ("emission_factor_id") REFERENCES "emission_factors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbon_activities" ADD CONSTRAINT "carbon_activities_inventory_movement_id_fkey" FOREIGN KEY ("inventory_movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbon_activities" ADD CONSTRAINT "carbon_activities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circular_material_profiles" ADD CONSTRAINT "circular_material_profiles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Reglas físicas C3 (Prisma no las representa; no generan drift).
-- ---------------------------------------------------------------------------

-- Factores: coeficiente no negativo (sin "emisiones evitadas"), textos y fuente no vacíos.
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_value_check"
  CHECK ("kg_co2e_per_unit" >= 0);
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_text_check"
  CHECK ("code" ~ '[^[:space:]]' AND "name" ~ '[^[:space:]]');
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_source_check"
  CHECK ("source_name" ~ '[^[:space:]]' AND "source_reference" ~ '[^[:space:]]');
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_source_year_check"
  CHECK ("source_year" IS NULL OR "source_year" BETWEEN 1900 AND 2100);

-- Como máximo un factor activo por producto; los históricos inactivos se conservan.
CREATE UNIQUE INDEX "emission_factors_one_active_per_product_key"
  ON "emission_factors"("product_id") WHERE "is_active" = true AND "product_id" IS NOT NULL;

-- Huella: cantidad producida positiva, valores no negativos y finalización completa.
ALTER TABLE "production_footprints" ADD CONSTRAINT "production_footprints_values_check"
  CHECK (
    "quantity_produced_snapshot" > 0
    AND "total_kg_co2e" >= 0
    AND ("kg_co2e_per_output_unit" IS NULL OR "kg_co2e_per_output_unit" >= 0)
  );
ALTER TABLE "production_footprints" ADD CONSTRAINT "production_footprints_finalization_check"
  CHECK ((
    ("status" = 'DRAFT'
      AND "finalized_at" IS NULL
      AND "finalized_by_user_id" IS NULL
      AND "kg_co2e_per_output_unit" IS NULL)
    OR ("status" = 'FINALIZED'
      AND "finalized_at" IS NOT NULL
      AND "finalized_by_user_id" IS NOT NULL
      AND "calculated_at" IS NOT NULL
      AND "kg_co2e_per_output_unit" IS NOT NULL
      AND "boundary_notes" IS NOT NULL
      AND char_length(btrim("boundary_notes")) >= 10)
  ) IS TRUE);

-- Actividades: cantidades y emisiones no negativas; origen coherente.
ALTER TABLE "carbon_activities" ADD CONSTRAINT "carbon_activities_values_check"
  CHECK (
    "activity_quantity" > 0
    AND "factor_value_snapshot" >= 0
    AND "emissions_kg_co2e" >= 0
    AND ("original_quantity" IS NULL OR "original_quantity" > 0)
  );
ALTER TABLE "carbon_activities" ADD CONSTRAINT "carbon_activities_text_check"
  CHECK (
    "description" ~ '[^[:space:]]'
    AND "factor_source_name_snapshot" ~ '[^[:space:]]'
    AND "factor_source_reference_snapshot" ~ '[^[:space:]]'
  );
ALTER TABLE "carbon_activities" ADD CONSTRAINT "carbon_activities_source_check"
  CHECK ((
    ("source" = 'PRODUCTION_CONSUMPTION'
      AND "inventory_movement_id" IS NOT NULL
      AND "original_quantity" IS NOT NULL
      AND "original_unit" IS NOT NULL)
    OR ("source" = 'MANUAL'
      AND "inventory_movement_id" IS NULL
      AND "original_quantity" IS NULL
      AND "original_unit" IS NULL
      AND "created_by_user_id" IS NOT NULL)
  ) IS TRUE);

ALTER TABLE "circular_material_profiles" ADD CONSTRAINT "circular_material_profiles_text_check"
  CHECK ("metric_code" ~ '[^[:space:]]' AND "display_name" ~ '[^[:space:]]');

-- Una huella FINALIZED es inmutable y ninguna huella se borra.
CREATE FUNCTION guard_production_footprint() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Production footprints cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" = 'FINALIZED' THEN
    RAISE EXCEPTION 'Finalized production footprint is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."production_order_id" <> OLD."production_order_id" OR NEW."lot_id" <> OLD."lot_id"
    OR NEW."quantity_produced_snapshot" <> OLD."quantity_produced_snapshot"
    OR NEW."output_unit_snapshot" <> OLD."output_unit_snapshot" OR NEW."scope" <> OLD."scope" THEN
    RAISE EXCEPTION 'Production footprint identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER production_footprints_guard BEFORE UPDATE OR DELETE ON "production_footprints"
  FOR EACH ROW EXECUTE FUNCTION guard_production_footprint();

-- Ninguna actividad cambia en una huella FINALIZED; las automáticas provienen de un
-- consumo real de la misma OP (el ledger es la fuente de verdad, no la BOM).
CREATE FUNCTION guard_carbon_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  footprint_status "CarbonFootprintStatus";
  footprint_order UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status" INTO footprint_status FROM "production_footprints" WHERE "id" = OLD."footprint_id";
    IF footprint_status = 'FINALIZED' THEN
      RAISE EXCEPTION 'Activities of a finalized footprint are immutable' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
  END IF;
  SELECT "status", "production_order_id" INTO footprint_status, footprint_order
    FROM "production_footprints" WHERE "id" = NEW."footprint_id";
  IF footprint_status = 'FINALIZED' THEN
    RAISE EXCEPTION 'Activities of a finalized footprint are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."inventory_movement_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "inventory_movements" m
    WHERE m."id" = NEW."inventory_movement_id"
      AND m."type" = 'PRODUCTION_CONSUMPTION'
      AND m."production_order_id" = footprint_order
  ) THEN
    RAISE EXCEPTION 'Automatic carbon activity requires a PRODUCTION_CONSUMPTION movement of the same order'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER carbon_activities_guard BEFORE INSERT OR UPDATE OR DELETE ON "carbon_activities"
  FOR EACH ROW EXECUTE FUNCTION guard_carbon_activity();
