-- Commit new enum values before constraints use them in the next migration.
ALTER TYPE "InventoryMovementType" ADD VALUE 'PRODUCTION_CONSUMPTION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'PRODUCTION_OUTPUT';
ALTER TYPE "AuditAction" ADD VALUE 'START';
ALTER TYPE "AuditAction" ADD VALUE 'COMPLETE';
ALTER TYPE "AuditAction" ADD VALUE 'QUALITY_APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'QUALITY_REJECT';
ALTER TYPE "AuditEntityType" ADD VALUE 'QUALITY_INSPECTION';
CREATE TYPE "QualityResult" AS ENUM ('APPROVED', 'REJECTED');
