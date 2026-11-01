-- C3: valores de enum existentes. ALTER TYPE ... ADD VALUE no puede usarse en la
-- misma transacción que los crea, por eso viven en una migración separada.
ALTER TYPE "AuditAction" ADD VALUE 'FINALIZE_CARBON_FOOTPRINT';
ALTER TYPE "AuditEntityType" ADD VALUE 'EMISSION_FACTOR';
ALTER TYPE "AuditEntityType" ADD VALUE 'CARBON_ACTIVITY';
ALTER TYPE "AuditEntityType" ADD VALUE 'PRODUCTION_FOOTPRINT';
ALTER TYPE "AuditEntityType" ADD VALUE 'CIRCULAR_MATERIAL_PROFILE';
