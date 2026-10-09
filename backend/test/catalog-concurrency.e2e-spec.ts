import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ActorType,
  AuditAction,
  AuditEntityType,
  ProductType,
  RoleCode,
  UnitOfMeasure,
} from '../src/generated/prisma/client.js';
import {
  createTestApp,
  createUser,
  login,
  type TestApp,
  type TestUser,
} from './support/auth-test-kit.js';

let kit: TestApp;
let actor: TestUser;
let cookie: string;

beforeAll(async () => {
  kit = await createTestApp();
  actor = await createUser(kit, RoleCode.INVENTARIO);
  cookie = await login(kit, actor);
});

afterAll(async () => {
  if (kit) await kit.close();
});

const catalogs = [
  { label: 'Productos', path: '/api/products', entityType: AuditEntityType.PRODUCT },
  { label: 'Almacenes', path: '/api/warehouses', entityType: AuditEntityType.WAREHOUSE },
] as const;

type CatalogEntity = (typeof catalogs)[number]['entityType'];

type ApiResponse = {
  status: number;
  body: unknown;
  headers: Record<string, unknown>;
};

type CatalogData = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

function dataOf(response: { body: unknown }): CatalogData {
  return (response.body as { data: CatalogData }).data;
}

function newData(entityType: CatalogEntity) {
  const code = `CONC-${randomUUID()}`.toUpperCase();

  if (entityType === AuditEntityType.PRODUCT) {
    return {
      code,
      name: 'Producto para probar concurrencia',
      category: 'Pruebas',
      type: ProductType.RAW_MATERIAL,
      unit: UnitOfMeasure.LITER,
    };
  }

  return {
    code,
    name: 'Almacén para probar concurrencia',
    location: 'Zona de pruebas',
  };
}

function recordsWithCode(entityType: CatalogEntity, code: string) {
  return entityType === AuditEntityType.PRODUCT
    ? kit.prisma.product.findMany({ where: { code } })
    : kit.prisma.warehouse.findMany({ where: { code } });
}

function recordById(entityType: CatalogEntity, id: string) {
  return entityType === AuditEntityType.PRODUCT
    ? kit.prisma.product.findUniqueOrThrow({ where: { id } })
    : kit.prisma.warehouse.findUniqueOrThrow({ where: { id } });
}

function requestId(response: ApiResponse): string {
  const value = response.headers['x-request-id'];
  expect(value).toEqual(expect.any(String));
  return value as string;
}

async function expectSingleAudit(
  responses: ApiResponse[],
  successStatus: number,
  expected: {
    entityType: CatalogEntity;
    entityId: string;
    action: AuditAction;
    previousValues: unknown;
    newValues: unknown;
  },
) {
  const winner = responses.find((response) => response.status === successStatus);
  expect(winner).toBeDefined();
  if (!winner) throw new Error('No hubo una petición exitosa');

  expect(new Set(responses.map(requestId)).size).toBe(responses.length);

  const logs = await kit.prisma.auditLog.findMany({
    where: {
      entityType: expected.entityType,
      entityId: expected.entityId,
      action: expected.action,
    },
  });

  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    actorType: ActorType.USER,
    actorUserId: actor.id,
    entityType: expected.entityType,
    entityId: expected.entityId,
    action: expected.action,
    requestId: requestId(winner),
  });
  expect(logs[0].previousValues).toEqual(expected.previousValues);
  expect(logs[0].newValues).toEqual(expected.newValues);

  // Las peticiones que reciben 409 no deben dejar eventos de auditoría.
  for (const response of responses) {
    const count = await kit.prisma.auditLog.count({
      where: { requestId: requestId(response) },
    });
    expect(count).toBe(response.status === successStatus ? 1 : 0);
  }
}

describe.each(catalogs)('$label: concurrencia y auditoría', ({ path, entityType }) => {
  it('tres altas con el mismo código normalizado crean un solo registro', async () => {
    const payload = newData(entityType);
    const codes = [payload.code, payload.code.toLowerCase(), ` ${payload.code.toLowerCase()} `];

    const responses = await Promise.all(
      codes.map((code) =>
        kit
          .http()
          .post(path)
          .set('Cookie', cookie)
          .send({ ...payload, code }),
      ),
    );

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([
      201, 409, 409,
    ]);

    const winner = responses.find((response) => response.status === 201)!;
    const created = dataOf(winner);
    expect(created).toMatchObject({ ...payload, isActive: true });

    const records = await recordsWithCode(entityType, payload.code);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: created.id, ...payload, isActive: true });

    await expectSingleAudit(responses, 201, {
      entityType,
      entityId: created.id,
      action: AuditAction.CREATE,
      previousValues: null,
      newValues: { ...payload, isActive: true },
    });
  });

  it.each([false, true])(
    'tres cambios a isActive=%s aplican una sola transición',
    async (isActive) => {
      const payload = newData(entityType);
      const created = await kit.http().post(path).set('Cookie', cookie).send(payload).expect(201);
      const { id } = dataOf(created);

      // Para probar reactivación, primero dejamos el recurso inactivo.
      if (isActive) {
        await kit
          .http()
          .patch(`${path}/${id}/status`)
          .set('Cookie', cookie)
          .send({ isActive: false })
          .expect(200);
      }

      const before = await recordById(entityType, id);
      expect(before.isActive).toBe(!isActive);

      const responses = await Promise.all(
        [1, 2, 3].map(() =>
          kit.http().patch(`${path}/${id}/status`).set('Cookie', cookie).send({ isActive }),
        ),
      );

      expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([
        200, 409, 409,
      ]);

      const winner = responses.find((response) => response.status === 200)!;
      expect(dataOf(winner)).toMatchObject({ id, ...payload, isActive });
      expect(await recordById(entityType, id)).toMatchObject({
        id,
        ...payload,
        isActive,
        createdAt: before.createdAt,
      });

      await expectSingleAudit(responses, 200, {
        entityType,
        entityId: id,
        action: isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        previousValues: { isActive: !isActive },
        newValues: { isActive },
      });
    },
  );
});
