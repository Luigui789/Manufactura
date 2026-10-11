-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntityType" ADD VALUE 'BILL_OF_MATERIAL';
ALTER TYPE "AuditEntityType" ADD VALUE 'BOM_VERSION';

-- CreateTable
CREATE TABLE "bills_of_material" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bills_of_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_versions" (
    "id" UUID NOT NULL,
    "bom_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "output_quantity" DECIMAL(18,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "bom_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_items" (
    "id" UUID NOT NULL,
    "bom_version_id" UUID NOT NULL,
    "component_product_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_material_product_id_key" ON "bills_of_material"("product_id");

-- CreateIndex
CREATE INDEX "bills_of_material_is_active_idx" ON "bills_of_material"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "bom_versions_bom_id_version_key" ON "bom_versions"("bom_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "bom_items_bom_version_id_component_product_id_key" ON "bom_items"("bom_version_id", "component_product_id");

-- AddForeignKey
ALTER TABLE "bills_of_material" ADD CONSTRAINT "bills_of_material_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_versions" ADD CONSTRAINT "bom_versions_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bills_of_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_versions" ADD CONSTRAINT "bom_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bom_version_id_fkey" FOREIGN KEY ("bom_version_id") REFERENCES "bom_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no expresa: cantidades positivas y una sola versión activa.
ALTER TABLE "bills_of_material" ADD CONSTRAINT "bills_of_material_name_check"
    CHECK (length(btrim("name")) > 0);
ALTER TABLE "bom_versions" ADD CONSTRAINT "bom_versions_positive_check"
    CHECK ("version" > 0 AND "output_quantity" > 0);
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_quantity_positive_check"
    CHECK ("quantity" > 0);
CREATE UNIQUE INDEX "bom_versions_one_active_per_bom"
    ON "bom_versions" ("bom_id") WHERE "is_active" = true;

-- El contenido guardado no se edita: una modificación crea otra versión.
CREATE FUNCTION protect_bom_version_content() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'BOM versions cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW.bom_id, NEW.version, NEW.output_quantity,
           NEW.created_at, NEW.created_by_user_id)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.bom_id, OLD.version, OLD.output_quantity,
           OLD.created_at, OLD.created_by_user_id) THEN
        RAISE EXCEPTION 'BOM version content is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER bom_versions_content_immutable
    BEFORE UPDATE OR DELETE ON "bom_versions"
    FOR EACH ROW EXECUTE FUNCTION protect_bom_version_content();
CREATE TRIGGER bom_items_content_immutable
    BEFORE UPDATE OR DELETE ON "bom_items"
    FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
