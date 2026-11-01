import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { PasswordHasherService } from '../../src/auth/password-hasher.service.js';
import { SESSION_COOKIE } from '../../src/auth/session-cookie.js';
import { RoleCode } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/** Las pruebas de autenticación escriben usuarios y auditoría: nunca en la base de trabajo. */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error('Las pruebas de autenticación requieren una DATABASE_URL *_test');
  }
}

export type TestApp = {
  app: INestApplication<Server>;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
};

/**
 * Aplicación real (AppModule con sus guards, APP_PIPE y middlewares). Por defecto
 * se desactiva el límite de intentos para que las suites no reciban 429 por
 * acumulación; la suite del límite lo deja activo.
 */
export async function createTestApp(options: { throttle?: boolean } = {}): Promise<TestApp> {
  assertTestDatabase();
  // DiscoveryModule permite a la prueba de arquitectura recorrer todas las rutas.
  const builder = Test.createTestingModule({ imports: [AppModule, DiscoveryModule] });
  if (!options.throttle) {
    builder.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  app.setGlobalPrefix('api');
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

export type UserBody = {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  isActive: boolean;
  mustChangePassword: boolean;
};

/** Cuerpo de respuesta del contrato { data, message } / { data, meta } / error de NestJS. */
export type ApiBody = {
  data: UserBody;
  meta: { page: number; limit: number; total: number };
  message: string;
  error?: string;
  statusCode?: number;
};

/** supertest tipa el cuerpo como any; este helper fija el contrato de la API. */
export function body(response: { body: unknown }): ApiBody {
  return response.body as ApiBody;
}

/** Contraseña aleatoria de la política (15 a 128): ninguna credencial fija en el repositorio. */
export function randomPassword(): string {
  return `prueba ${randomBytes(18).toString('base64url')}`;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  role: RoleCode;
};

/** Crea un usuario directamente en la base, con hash real y sin cambio pendiente. */
export async function createUser(
  kit: TestApp,
  role: RoleCode,
  options: { isActive?: boolean; mustChangePassword?: boolean; prefix?: string } = {},
): Promise<TestUser> {
  const password = randomPassword();
  const email = uniqueEmail(options.prefix ?? role.toLowerCase());
  const passwordHash = await kit.app.get(PasswordHasherService).hash(password);
  const user = await kit.prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: `Prueba ${role}`,
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
      role: { connect: { code: role } },
    },
  });
  return { id: user.id, email, password, role };
}

export function sessionCookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const cookie = cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) {
    throw new Error('La respuesta no emitió la cookie de sesión');
  }
  return cookie.split(';')[0];
}

/** Inicia sesión y devuelve el valor de Cookie listo para enviarse. */
export async function login(kit: TestApp, user: Pick<TestUser, 'email' | 'password'>) {
  const response = await kit
    .http()
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);
  return sessionCookieFrom(response);
}

/**
 * La base _test acumula datos y los usuarios no pueden borrarse (la auditoría los
 * referencia). Para escenarios que exigen un conjunto concreto de ADMIN activos,
 * se desactivan los demás administradores de la base de pruebas.
 */
export async function deactivateOtherAdmins(kit: TestApp, keepIds: string[]): Promise<void> {
  await kit.prisma.user.updateMany({
    where: { role: { code: RoleCode.ADMIN }, isActive: true, id: { notIn: keepIds } },
    data: { isActive: false },
  });
}
