-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CHANGE_ROLE';
ALTER TYPE "AuditAction" ADD VALUE 'CHANGE_PASSWORD';
ALTER TYPE "AuditAction" ADD VALUE 'RESET_PASSWORD';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- Prisma no representa estas reglas en schema.prisma. Se añaden antes de
-- compartir la migración, como en Foundation, para que también se recreen en la
-- base sombra.

-- La versión de sesión solo crece desde 0 (ADR 008).
ALTER TABLE "users" ADD CONSTRAINT "users_token_version_check"
  CHECK ("token_version" >= 0);

-- Con el índice único existente, garantiza la unicidad del correo sin distinguir
-- mayúsculas. No se normalizan datos existentes: si hubiera un correo sin
-- normalizar, la migración falla en lugar de fusionar cuentas en silencio.
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" = lower(btrim("email")));
