import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RoleCode, type Warehouse } from '../src/generated/prisma/client.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';

type WarehouseItem = Pick<Warehouse, 'id' | 'code' | 'name' | 'location' | 'isActive'>;
type WarehousesList = {
  data: WarehouseItem[];
  meta: { page: number; limit: number; total: number };
};

let kit: TestApp;
let cookie: string;
let fixtures: {
  centralActive: WarehouseItem;
  centralInactive: WarehouseItem;
  reserveActive: WarehouseItem;
  reserveInactive: WarehouseItem;
};

const token = randomUUID().replaceAll('-', '').toUpperCase();
const codePrefix = `FILT-${token}`;

async function createWarehouse(suffix: string, name: string, location: string, isActive: boolean) {
  const response = await kit
    .http()
    .post('/api/warehouses')
    .set('Cookie', cookie)
    .send({ code: `${codePrefix}-${suffix}`, name, location, isActive })
    .expect(201);

  return (response.body as { data: WarehouseItem }).data;
}

async function list(query: Record<string, string | number> = {}): Promise<WarehousesList> {
  const response = await kit
    .http()
    .get('/api/warehouses')
    .set('Cookie', cookie)
    .query(query)
    .expect(200);

  return response.body as WarehousesList;
}

function ids(warehouses: WarehouseItem[]) {
  return warehouses.map((warehouse) => warehouse.id).sort();
}

beforeAll(async () => {
  kit = await createTestApp();
  cookie = await login(kit, await createUser(kit, RoleCode.INVENTARIO));

  fixtures = {
    centralActive: await createWarehouse('01', `Central ${token} Norte`, `Nave ${token} A`, true),
    centralInactive: await createWarehouse('02', `Central ${token} Sur`, `Patio ${token} B`, false),
    reserveActive: await createWarehouse('03', `Reserva ${token} Norte`, `Nave ${token} C`, true),
    reserveInactive: await createWarehouse('04', `Reserva ${token} Sur`, `Patio ${token} D`, false),
  };
});

afterAll(async () => {
  if (kit) await kit.close();
});

describe('Almacenes: filtros y paginación', () => {
  it('conserva la paginación predeterminada cuando no se envían filtros', async () => {
    const total = await kit.prisma.warehouse.count();
    const result = await list();

    expect(result.meta).toEqual({ page: 1, limit: 20, total });
    expect(result.data).toHaveLength(Math.min(20, total));
  });

  it.each([true, false])('filtra solo por isActive=%s y calcula su total', async (isActive) => {
    const total = await kit.prisma.warehouse.count({ where: { isActive } });
    const result = await list({ isActive: String(isActive), limit: 100 });

    expect(total).toBeGreaterThan(0);
    expect(result.meta).toEqual({ page: 1, limit: 100, total });
    expect(result.data).toHaveLength(Math.min(100, total));
    expect(result.data.every((warehouse) => warehouse.isActive === isActive)).toBe(true);
  });

  it('busca por código sin distinguir mayúsculas y recorta los espacios', async () => {
    const result = await list({ search: `  ${codePrefix.toLowerCase()}  ` });

    expect(ids(result.data)).toEqual(ids(Object.values(fixtures)));
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 4 });
  });

  it('busca por nombre e incluye activos e inactivos si no se indica estado', async () => {
    const result = await list({ search: `cEnTrAl ${token.toLowerCase()}` });

    expect(ids(result.data)).toEqual(ids([fixtures.centralActive, fixtures.centralInactive]));
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 2 });
    expect(result.data.map((warehouse) => warehouse.isActive)).toEqual([true, false]);
  });

  it('busca por ubicación sin distinguir mayúsculas', async () => {
    const result = await list({ search: `nAvE ${token.toLowerCase()}` });

    expect(ids(result.data)).toEqual(ids([fixtures.centralActive, fixtures.reserveActive]));
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 2 });
  });

  it.each([
    { isActive: 'true', key: 'centralActive' as const },
    { isActive: 'false', key: 'centralInactive' as const },
  ])('combina búsqueda e isActive=$isActive', async ({ isActive, key }) => {
    const result = await list({ search: `Central ${token}`, isActive });

    expect(ids(result.data)).toEqual([fixtures[key].id]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it('pagina los resultados filtrados y mantiene el total incluso en una página vacía', async () => {
    const query = { search: codePrefix, isActive: 'false', limit: 1 };
    const first = await list({ ...query, page: 1 });
    const second = await list({ ...query, page: 2 });
    const third = await list({ ...query, page: 3 });

    expect(first.meta).toEqual({ page: 1, limit: 1, total: 2 });
    expect(second.meta).toEqual({ page: 2, limit: 1, total: 2 });
    expect(third.meta).toEqual({ page: 3, limit: 1, total: 2 });
    expect(ids(first.data)).toEqual([fixtures.centralInactive.id]);
    expect(ids(second.data)).toEqual([fixtures.reserveInactive.id]);
    expect(third.data).toEqual([]);
  });

  it('devuelve lista vacía y total cero cuando la combinación no coincide', async () => {
    const result = await list({ search: `INEXISTENTE-${token}`, isActive: 'false' });

    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0 },
    });
  });

  it('acepta una búsqueda de exactamente 100 caracteres', async () => {
    const result = await list({ search: `INEXISTENTE-${token}`.padEnd(100, 'X') });

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it.each([
    { field: 'isActive', value: 'yes' },
    { field: 'isActive', value: '1' },
    { field: 'isActive', value: '0' },
    { field: 'isActive', value: '' },
    { field: 'search', value: '' },
    { field: 'search', value: '   ' },
    { field: 'search', value: 'X'.repeat(101) },
  ])('rechaza con 400 el filtro $field="$value"', async ({ field, value }) => {
    const response = await kit
      .http()
      .get('/api/warehouses')
      .set('Cookie', cookie)
      .query({ [field]: value })
      .expect(400);

    expect(response.body).toMatchObject({ statusCode: 400 });
  });
});
