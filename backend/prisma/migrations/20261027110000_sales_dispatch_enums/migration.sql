-- PostgreSQL requires each added enum value to be committed before another
-- migration can use it in constraints or expressions.
ALTER TYPE "DocumentType" ADD VALUE 'SALE_DISPATCH';
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_DISPATCH';
ALTER TYPE "AuditAction" ADD VALUE 'DISPATCH';
ALTER TYPE "AuditEntityType" ADD VALUE 'SALE_DISPATCH';
