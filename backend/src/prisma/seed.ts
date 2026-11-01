import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient, RoleCode } from '../generated/prisma/client.js';

// El seed se ejecuta desde backend/. Una DATABASE_URL explícita (pruebas) tiene
// prioridad sobre el .env compartido en la raíz del monorepo.
loadEnv({ path: path.resolve(process.cwd(), '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL es obligatoria para ejecutar el seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const roles = [
  { code: RoleCode.ADMIN, name: 'Administración' },
  { code: RoleCode.COMPRAS, name: 'Compras' },
  { code: RoleCode.INVENTARIO, name: 'Inventario' },
  { code: RoleCode.PRODUCCION, name: 'Producción' },
  { code: RoleCode.VENTAS, name: 'Ventas' },
];

async function seed(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const role of roles) {
      await tx.role.upsert({
        where: { code: role.code },
        create: role,
        update: { name: role.name },
      });
    }

    await tx.warehouse.upsert({
      where: { code: 'ALM-PRINCIPAL' },
      create: {
        code: 'ALM-PRINCIPAL',
        name: 'Almacén principal',
        location: 'Planta principal - Managua',
      },
      // No reemplazar una ubicación más específica configurada después del seed.
      update: { name: 'Almacén principal' },
    });
  });
}

try {
  await seed();
  process.stdout.write('Seed Foundation aplicado: 5 roles y 1 almacén.\n');
} finally {
  await prisma.$disconnect();
}
