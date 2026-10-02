import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { BootstrapRefusedError, UsersService } from '../users/users.service.js';
import { AdminInputError, readAdminInput } from './admin-input.js';

/**
 * Alta del PRIMER administrador (pnpm --filter backend admin:create).
 *
 * Solo sirve como bootstrap: falla si ya existe algún ADMIN activo o si el correo
 * existe, y nunca modifica un usuario existente. Una vez hay un administrador,
 * los demás se crean desde el ERP por un ADMIN autenticado, con RBAC y AuditLog.
 *
 * Lee ADMIN_EMAIL, ADMIN_FULL_NAME y ADMIN_PASSWORD del entorno del proceso.
 * Reutiliza UsersService: misma validación, mismo hash y misma auditoría que
 * cualquier alta. Nunca imprime la contraseña ni el hash.
 */
async function main(): Promise<number> {
  let input;
  try {
    input = readAdminInput(process.env);
  } catch (error) {
    if (error instanceof AdminInputError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const admin = await app.get(UsersService).createInitialAdmin(input);
    process.stdout.write(
      `Administrador creado: ${admin.email}.\n` +
        'Elimina ADMIN_PASSWORD de tu entorno y de tu .env local.\n',
    );
    return 0;
  } catch (error) {
    if (error instanceof BootstrapRefusedError) {
      process.stderr.write(`No se creó ningún usuario: ${error.message}\n`);
      return 1;
    }
    throw error;
  } finally {
    await app.close();
  }
}

process.exitCode = await main();
