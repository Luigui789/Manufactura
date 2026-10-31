import type { PrismaClient } from '../generated/prisma/client.js';
import { DEMO_DATASET_LOCK_KEY, DEMO_USERS, DEMO_WAREHOUSE_CODE } from './demo-data.js';
import { drift, type SeedStats } from './demo-context.js';
import { ensureDemoBoms, ensureDemoInitialStock, ensureDemoRoutes } from './demo-production.js';
import { ensureDemoParties, ensureDemoProducts } from './demo-products.js';
import { ensureDemoCircularity, ensureDemoFactors } from './demo-sustainability.js';
import { ensureDemoUsers } from './demo-users.js';
export { DemoInputError, readDemoPassword } from './demo-input.js';

/**
 * Aplica el dataset oficial en UNA transacción serializada por advisory lock: dos seeds
 * concurrentes no duplican ni dejan configuración parcial. Reejecutarlo no cambia nada.
 */
export async function seedDemoDataset(prisma: PrismaClient, passwordHash: string) {
  const stats: SeedStats = { created: {} };
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DEMO_DATASET_LOCK_KEY}))`;
      if ((await tx.role.count()) < 5)
        drift('Foundation', 'faltan roles; ejecuta pnpm --filter backend db:seed');
      const warehouse = await tx.warehouse.findUnique({ where: { code: DEMO_WAREHOUSE_CODE } });
      if (!warehouse) drift('Foundation', `falta ${DEMO_WAREHOUSE_CODE}; ejecuta db:seed`);
      if (!warehouse.isActive) drift('Warehouse ' + DEMO_WAREHOUSE_CODE, 'está inactivo');
      const users = await ensureDemoUsers(tx, stats, passwordHash);
      const actorId = users.get(DEMO_USERS[0].email)!;
      const ids = await ensureDemoProducts(tx, stats);
      await ensureDemoParties(tx, stats);
      await ensureDemoBoms(tx, stats, ids, actorId);
      await ensureDemoRoutes(tx, stats, ids);
      await ensureDemoInitialStock(tx, stats, ids, warehouse.id, actorId);
      await ensureDemoFactors(tx, stats, ids, actorId);
      await ensureDemoCircularity(tx, stats, ids);
    },
    { timeout: 60_000, maxWait: 60_000 },
  );
  return stats;
}
