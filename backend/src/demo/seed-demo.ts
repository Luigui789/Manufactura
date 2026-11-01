import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { DemoDatasetDriftError } from './demo-context.js';
import { DemoInputError, readDemoPassword, seedDemoDataset } from './demo-seeder.js';

/**
 * pnpm demo:seed — dataset oficial EcoSoap sobre una base con Foundation.
 * No borra ni trunca nada. Nunca imprime la contraseña ni su hash.
 */
loadEnv({ path: path.resolve(process.cwd(), '..', '.env') });

async function main(): Promise<number> {
  let password: string;
  try {
    // Se valida antes de abrir cualquier conexión: sin contraseña la base no se toca.
    password = readDemoPassword(process.env);
  } catch (error) {
    if (error instanceof DemoInputError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL es obligatoria para ejecutar demo:seed\n');
    return 1;
  }
  const passwordHash = await new PasswordHasherService().hash(password);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const stats = await seedDemoDataset(prisma, passwordHash);
    const created = Object.entries(stats.created);
    process.stdout.write(
      created.length
        ? `Dataset EcoSoap aplicado. Creado: ${created.map(([k, v]) => `${k}=${v}`).join(', ')}.\n`
        : 'Dataset EcoSoap ya estaba completo: no se modificó nada.\n',
    );
    return 0;
  } catch (error) {
    if (error instanceof DemoDatasetDriftError) {
      process.stderr.write(`${error.message}\nNo se aplicó ningún cambio (rollback).\n`);
      return 2;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main();
