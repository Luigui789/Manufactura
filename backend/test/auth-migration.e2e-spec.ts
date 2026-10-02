import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';

import {
  ActorType,
  AuditAction,
  AuditEntityType,
  PrismaClient,
  RoleCode,
} from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Las pruebas de la migración auth_rbac requieren una DATABASE_URL *_test');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const suffix = randomUUID().slice(0, 8);

let roleId: string;
let userId: string;

beforeAll(async () => {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.VENTAS } });
  roleId = role.id;
  const user = await prisma.user.create({
    data: {
      email: `auth-migration-${suffix}@example.test`,
      passwordHash: 'test-hash-not-a-real-password',
      fullName: 'Auth Migration Test',
      roleId,
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Migración auth_rbac: columnas, restricciones y acciones', () => {
  it('M1: valores por omisión seguros y token_version no negativa', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Una cuenta que nadie marca explícitamente queda obligada a cambiar la contraseña.
    expect(user.mustChangePassword).toBe(true);
    expect(user.tokenVersion).toBe(0);

    await expect(
      prisma.$executeRaw`UPDATE users SET token_version = -1 WHERE id = ${userId}::uuid`,
    ).rejects.toThrow(/users_token_version_check/);
  });

  it('M2: rechaza correos sin normalizar escritos por cualquier vía', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: `Mayusculas-${suffix}@Example.test`,
          passwordHash: 'test-hash-not-a-real-password',
          fullName: 'Correo sin normalizar',
          roleId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE users SET email = ${` auth-migration-${suffix}@example.test`}
        WHERE id = ${userId}::uuid`,
    ).rejects.toThrow(/users_email_normalized_check/);
  });

  it('M3: las acciones nuevas existen y respetan los CHECK de auditoría vigentes', async () => {
    const labels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditAction'`;
    expect(labels.map((row) => row.enumlabel)).toEqual(
      expect.arrayContaining(['CHANGE_ROLE', 'CHANGE_PASSWORD', 'RESET_PASSWORD']),
    );

    const roleChange = await prisma.auditLog.create({
      data: {
        actorType: ActorType.USER,
        actorUserId: userId,
        action: AuditAction.CHANGE_ROLE,
        entityType: AuditEntityType.USER,
        entityId: userId,
        previousValues: { role: RoleCode.VENTAS },
        newValues: { role: RoleCode.INVENTARIO },
      },
    });
    expect(roleChange.action).toBe(AuditAction.CHANGE_ROLE);

    // Fuera de LOGIN_FAILED, toda acción exige entidad y un actor USER o SYSTEM.
    await expect(
      prisma.auditLog.create({
        data: { actorType: ActorType.SYSTEM, action: AuditAction.RESET_PASSWORD },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.create({
        data: {
          actorType: ActorType.ANONYMOUS,
          action: AuditAction.CHANGE_PASSWORD,
          entityType: AuditEntityType.USER,
          entityId: userId,
        },
      }),
    ).rejects.toThrow();
  });
});
