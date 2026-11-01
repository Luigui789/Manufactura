import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../generated/prisma/client.js';
import { formatChecks, verifyDemoDataset } from './demo-checks.js';

/** pnpm demo:verify — solo lectura: no crea, actualiza, elimina ni repone nada. */
loadEnv({ path: path.resolve(process.cwd(), '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL es obligatoria para ejecutar demo:verify\n');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const { text, ready } = formatChecks(await verifyDemoDataset(prisma));
    process.stdout.write(text);
    process.exitCode = ready ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}
