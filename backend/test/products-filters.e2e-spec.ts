import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ProductType,
  RoleCode,
  UnitOfMeasure,
  type Product,
} from '../src/generated/prisma/client.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';

type ProductItem = Pick<Product, 'id' | 'code' | 'name' | 'type' | 'isActive'>;
type ProductsList = {
  data: ProductItem[];
  meta: { page: number; limit: number; total: number };
};

let kit: TestApp;
let cookie: string;
let fixtures: {
  rawActive: ProductItem;
  rawInactive: ProductItem;
  intermediate: ProductItem;
  finishedActive: ProductItem;
  finishedInactive: ProductItem;
  consumable: ProductItem;
};

const token = randomUUID().replaceAll('-', '').toUpperCase();
const codePrefix = `FILT-${token}`;

async function createProduct(suffix: string, name: string, type: ProductType, isActive = true) {
  const response = await kit
    .http()
    .post('/api/products')
    .set('Cookie', cookie)
    .send({
      code: `${codePrefix}-${suffix}`,
      name,
      category: 'Pruebas de filtros',
      type,
      unit: UnitOfMeasure.UNIT,
    })
    .expect(201);

  const product = (response.body as { data: ProductItem }).data;

  if (!isActive) {
    const disabled = await kit
      .http()
      .patch(`/api/products/${product.id}/status`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(200);

    return (disabled.body as { data: ProductItem }).data;
  }

  return product;
}

async function list(query: Record<string, string | number> = {}): Promise<ProductsList> {
  const response = await kit
    .http()
    .get('/api/products')
    .set('Cookie', cookie)
    .query(query)
    .expect(200);

  return response.body as ProductsList;
}

function ids(products: ProductItem[]) {
  return products.map((product) => product.id).sort();
}

beforeAll(async () => {
  kit = await createTestApp();
  cookie = await login(kit, await createUser(kit, RoleCode.INVENTARIO));

  fixtures = {
    rawActive: await createProduct('01', `Aceite ${token} Alfa`, ProductType.RAW_MATERIAL),
    rawInactive: await createProduct('02', `Aceite ${token} Beta`, ProductType.RAW_MATERIAL, false),
    intermediate: await createProduct('03', `Filtrado ${token}`, ProductType.INTERMEDIATE),
    finishedActive: await createProduct('04', `Jabón ${token} Alfa`, ProductType.FINISHED_GOOD),
    finishedInactive: await createProduct(
      '05',
      `Jabón ${token} Beta`,
      ProductType.FINISHED_GOOD,
      false,
    ),
    consumable: await createProduct('06', `Esencia ${token}`, ProductType.CONSUMABLE),
  };
});

afterAll(async () => {
  if (kit) await kit.close();
});

describe('Productos: filtros y paginación', () => {
  it('conserva la paginación predeterminada cuando no se envían filtros', async () => {
    const total = await kit.prisma.product.count();
    const result = await list();

    expect(result.meta).toEqual({ page: 1, limit: 20, total });
    expect(result.data).toHaveLength(Math.min(20, total));
  });

  it.each([true, false])('filtra solo por isActive=%s y calcula su total', async (isActive) => {
    const total = await kit.prisma.product.count({ where: { isActive } });
    const result = await list({ isActive: String(isActive), limit: 100 });

    expect(total).toBeGreaterThan(0);
    expect(result.meta).toEqual({ page: 1, limit: 100, total });
    expect(result.data).toHaveLength(Math.min(100, total));
    expect(result.data.every((product) => product.isActive === isActive)).toBe(true);
  });

  it.each(Object.values(ProductType))(
    'filtra solo por type=%s y calcula su total',
    async (type) => {
      const total = await kit.prisma.product.count({ where: { type } });
      const result = await list({ type, limit: 100 });

      expect(total).toBeGreaterThan(0);
      expect(result.meta).toEqual({ page: 1, limit: 100, total });
      expect(result.data).toHaveLength(Math.min(100, total));
      expect(result.data.every((product) => product.type === type)).toBe(true);
    },
  );

  it('busca por código sin distinguir mayúsculas y recorta los espacios', async () => {
    const result = await list({ search: `  ${codePrefix.toLowerCase()}  ` });

    expect(ids(result.data)).toEqual(ids(Object.values(fixtures)));
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 6 });
  });

  it('busca por nombre e incluye activos e inactivos si no se indica estado', async () => {
    const result = await list({ search: `aCeItE ${token.toLowerCase()}` });

    expect(ids(result.data)).toEqual(ids([fixtures.rawActive, fixtures.rawInactive]));
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 2 });
    expect(result.data.map((product) => product.isActive)).toEqual([true, false]);
  });

  it.each([
    { isActive: 'true', type: ProductType.RAW_MATERIAL, key: 'rawActive' as const },
    { isActive: 'false', type: ProductType.FINISHED_GOOD, key: 'finishedInactive' as const },
  ])('combina búsqueda, isActive=$isActive y type=$type', async ({ isActive, type, key }) => {
    const result = await list({ search: codePrefix, isActive, type });

    expect(ids(result.data)).toEqual([fixtures[key].id]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it('pagina los resultados filtrados y mantiene el total incluso en una página vacía', async () => {
    const query = { search: codePrefix, type: ProductType.RAW_MATERIAL, limit: 1 };
    const first = await list({ ...query, page: 1 });
    const second = await list({ ...query, page: 2 });
    const third = await list({ ...query, page: 3 });

    expect(first.meta).toEqual({ page: 1, limit: 1, total: 2 });
    expect(second.meta).toEqual({ page: 2, limit: 1, total: 2 });
    expect(third.meta).toEqual({ page: 3, limit: 1, total: 2 });
    expect(ids(first.data)).toEqual([fixtures.rawActive.id]);
    expect(ids(second.data)).toEqual([fixtures.rawInactive.id]);
    expect(third.data).toEqual([]);
  });

  it('devuelve lista vacía y total cero cuando la combinación no coincide', async () => {
    const result = await list({
      search: `INEXISTENTE-${token}`,
      isActive: 'false',
      type: ProductType.RAW_MATERIAL,
    });

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
    { field: 'type', value: 'DESCONOCIDO' },
    { field: 'type', value: '' },
    { field: 'search', value: '' },
    { field: 'search', value: '   ' },
    { field: 'search', value: 'X'.repeat(101) },
  ])('rechaza con 400 el filtro $field="$value"', async ({ field, value }) => {
    const response = await kit
      .http()
      .get('/api/products')
      .set('Cookie', cookie)
      .query({ [field]: value })
      .expect(400);

    expect(response.body).toMatchObject({ statusCode: 400 });
  });
});
