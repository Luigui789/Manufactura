import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { SessionUser } from '@/features/auth/types';
import type { Product, Warehouse } from '../types';
import { ProductsPage } from './ProductsPage';
import { WarehousesPage } from './WarehousesPage';

const product: Product = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'MP-ACEITE',
  name: 'Aceite de prueba',
  category: 'Aceites',
  type: 'RAW_MATERIAL',
  unit: 'LITER',
  isActive: true,
  isLotTracked: false,
  requiresQualityInspection: false,
  createdAt: '2026-10-09T12:00:00.000Z',
  updatedAt: '2026-10-09T12:00:00.000Z',
};

const warehouse: Warehouse = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'ALM-CENTRAL',
  name: 'Almacén de prueba',
  location: 'Planta central',
  isActive: true,
  createdAt: '2026-10-09T12:00:00.000Z',
  updatedAt: '2026-10-09T12:00:00.000Z',
};

const catalogs = [
  {
    label: 'Productos',
    path: '/api/products',
    searchLabel: 'Buscar producto',
    Page: ProductsPage,
    item: product,
  },
  {
    label: 'Almacenes',
    path: '/api/warehouses',
    searchLabel: 'Buscar almacén',
    Page: WarehousesPage,
    item: warehouse,
  },
];

const clients: ReturnType<typeof createAppQueryClient>[] = [];

function mount(catalog: (typeof catalogs)[number]) {
  // Se simula HTTP; las páginas, los hooks y la caché son los reales.
  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const address = new URL(url);
    if (address.pathname !== catalog.path || (options.method ?? 'GET') !== 'GET') {
      return new Response(null, { status: 404 });
    }

    const params = address.searchParams;
    const page = Number(params.get('page'));
    const limit = Number(params.get('limit'));
    const filtered = ['isActive', 'type', 'search'].some((key) => params.has(key));
    const total = params.get('search') === 'sin coincidencias' ? 0 : filtered ? 21 : 42;
    const items = Array.from({ length: total }, (_, index) => ({
      ...catalog.item,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      code: `${filtered ? 'FILTRADO' : 'ORIGINAL'}-${index + 1}`,
      isActive: params.get('isActive') !== 'false',
    }));

    return new Response(
      JSON.stringify({
        data: items.slice((page - 1) * limit, page * limit),
        meta: { page, limit, total },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetch);

  const client = createAppQueryClient();
  const user: SessionUser = {
    id: 'test-user',
    email: 'inventory@example.test',
    fullName: 'Persona de prueba',
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
    createdAt: '',
    updatedAt: '',
  };
  client.setQueryData(SESSION_KEY, user);
  clients.push(client);
  const Page = catalog.Page;
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  return fetch;
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function expectQuery(
  fetch: ReturnType<typeof mount>,
  filters: Record<string, string>,
  page = '1',
) {
  await waitFor(() => {
    const last = fetch.mock.calls.at(-1);
    expect(last).toBeDefined();

    const params: Record<string, string> = {};

    new URL(last![0]).searchParams.forEach((value, key) => {
      params[key] = value;
    });

    expect(params).toEqual({
      page,
      limit: '20',
      ...filters,
    });
  });
}

async function nextPage() {
  const next = screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement;
  await waitFor(() => expect(next.disabled).toBe(false));
  fireEvent.click(next);
  await screen.findByText(/^Página 2 de/);
}

beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe.each(catalogs)('$label: filtros del listado', (catalog) => {
  it('consulta sin enviar filtros vacíos', async () => {
    const fetch = mount(catalog);
    await screen.findByRole('table', { name: catalog.label });
    await expectQuery(fetch, {});
  });

  it.each([
    ['active', 'true'],
    ['inactive', 'false'],
  ])('envía el estado %s y vuelve a la primera página', async (status, value) => {
    const fetch = mount(catalog);
    await screen.findByRole('table', { name: catalog.label });
    await nextPage();
    fill('Filtrar por estado', status);
    await expectQuery(fetch, { isActive: value });
    await screen.findByText(/^Página 1 de 2 · 21 /);
    const table = within(screen.getByRole('table', { name: catalog.label }));
    expect(table.getAllByText(value === 'true' ? 'Activo' : 'Inactivo')).toHaveLength(20);
  });

  it('consulta de nuevo al cambiar de activos a inactivos en la misma página', async () => {
    const fetch = mount(catalog);
    await screen.findByRole('table', { name: catalog.label });
    fill('Filtrar por estado', 'active');
    await expectQuery(fetch, { isActive: 'true' });
    await screen.findByText('FILTRADO-1');
    fill('Filtrar por estado', 'inactive');
    await expectQuery(fetch, { isActive: 'false' });
    await waitFor(() => expect(screen.getAllByText('Inactivo')).toHaveLength(20));
  });

  it('recorta y codifica la búsqueda, reiniciando la página', async () => {
    const fetch = mount(catalog);
    await screen.findByRole('table', { name: catalog.label });
    await nextPage();
    fill(catalog.searchLabel, '  aceite & jabón + 50%  ');
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await expectQuery(fetch, { search: 'aceite & jabón + 50%' });
    await screen.findByText(/^Página 1 de 2 · 21 /);
  });

  it('combina filtros, los conserva al paginar y los elimina al limpiar', async () => {
    const fetch = mount(catalog);
    await screen.findByRole('table', { name: catalog.label });
    const filters: Record<string, string> = { isActive: 'false' };
    fill('Filtrar por estado', 'inactive');
    await expectQuery(fetch, filters);
    if (catalog.label === 'Productos') {
      filters.type = 'FINISHED_GOOD';
      fill('Filtrar por tipo', filters.type);
      await expectQuery(fetch, filters);
    }
    filters.search = 'jabón';
    fill(catalog.searchLabel, filters.search);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await expectQuery(fetch, filters);
    await nextPage();
    await expectQuery(fetch, filters, '2');
    await screen.findByText('FILTRADO-21');

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    // Puede reutilizar la respuesta sin filtros que ya está en caché.
    await screen.findByText(/^Página 1 de 3 · 42 /);
    expect(screen.getByText('ORIGINAL-1')).toBeTruthy();
    expect((screen.getByLabelText(catalog.searchLabel) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Filtrar por estado') as HTMLSelectElement).value).toBe('all');
    if (catalog.label === 'Productos') {
      expect((screen.getByLabelText('Filtrar por tipo') as HTMLSelectElement).value).toBe('');
    }
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
  });

  it('omite una búsqueda de espacios y vuelve a la primera página', async () => {
    const fetch = mount(catalog);
    await screen.findByRole('table', { name: catalog.label });
    await nextPage();
    fill(catalog.searchLabel, '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(/^Página 1 de 3 · 42 /);
    expect(fetch.mock.calls.every(([url]) => !new URL(url).searchParams.has('search'))).toBe(true);
  });

  it('muestra el resultado vacío y el total devuelto para la búsqueda', async () => {
    mount(catalog);
    await screen.findByRole('table', { name: catalog.label });
    fill(catalog.searchLabel, 'sin coincidencias');
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(`No hay ${catalog.label.toLowerCase()} que coincidan con los filtros.`);
    expect(screen.getByText(/^Página 1 de 1 · 0 /)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('Productos: filtro por tipo', () => {
  it.each(['RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED_GOOD', 'CONSUMABLE'])(
    'envía %s y vuelve a la primera página',
    async (type) => {
      const fetch = mount(catalogs[0]);
      await screen.findByRole('table', { name: 'Productos' });
      await nextPage();
      fill('Filtrar por tipo', type);
      await expectQuery(fetch, { type });
      await screen.findByText(/^Página 1 de 2 · 21 /);
    },
  );
});
