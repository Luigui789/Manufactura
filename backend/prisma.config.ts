import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

/**
 * El archivo .env vive en la raiz del monorepo, no dentro de backend/, para que
 * exista una sola fuente de verdad compartida por docker-compose, el backend y
 * Vite. La CLI de Prisma solo busca .env junto al esquema y en el directorio de
 * trabajo, asi que hay que cargarlo explicitamente antes de resolver la URL.
 */
loadEnv({ path: path.resolve(import.meta.dirname, '..', '.env') });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'pnpm db:seed',
  },

  // Desde Prisma 7 la URL de conexion de los comandos de Migrate se declara
  // aqui en lugar de dentro del bloque datasource del esquema.
  datasource: {
    url: env('DATABASE_URL'),
  },
});
