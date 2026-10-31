import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode, SessionUser } from '@/features/auth/types';
import type { ProductionOrder } from '../api/orders';
import { OrdersPage } from './OrdersPage';
import { NewOrderPage } from './NewOrderPage';
import { OrderDetailPage } from './OrderDetailPage';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
];
const product = {
  id: ids[0],
  code: 'JABON',
  name: 'Jabón',
  type: 'FINISHED_GOOD' as const,
  unit: 'UNIT' as const,
  isActive: true,
};
const warehouse = { id: ids[2], code: 'ALM', name: 'Principal', isActive: true };
const bom = {
  id: ids[3],
  name: 'Fórmula jabón',
  productId: product.id,
  product,
  isActive: true,
  versions: [
    {
      id: ids[1],
      version: 1,
      isActive: true,
      items: [],
      outputQuantity: '1.0000',
      createdAt: '2026-10-10T12:00:00Z',
      createdByUserId: 'actor',
    },
  ],
};
const component = { ...product, id: 'component', code: 'ACEITE', name: 'Aceite', unit: 'GRAM' };
const clients: ReturnType<typeof createAppQueryClient>[] = [];
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(
  role: RoleCode,
  path = '/production/orders',
  {
    empty = false,
    failList = false,
    status = 'DRAFT',
  }: { empty?: boolean; failList?: boolean; status?: ProductionOrder['status'] } = {},
) {
  const order = {
    id: 'order',
    number: 'OP-2026-000001',
    productId: product.id,
    bomVersionId: ids[1],
    warehouseId: warehouse.id,
    product,
    warehouse,
    bomVersion: { ...bom.versions[0], bomId: bom.id, bom },
    quantityPlanned: '10.0000',
    quantityProduced: '0.0000',
    lot: null,
    status,
    plannedStartAt: '2026-10-10T14:30:45.123Z',
    plannedEndAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T12:00:00Z',
    createdByUserId: 'actor',
  } as ProductionOrder;
  const client = createAppQueryClient();
  const user = {
    id: 'actor',
    email: 'production@example.test',
    fullName: 'Producción',
    role,
    isActive: true,
    mustChangePassword: false,
    createdAt: '',
    updatedAt: '',
  } satisfies SessionUser;
  client.setQueryData(SESSION_KEY, user);
  clients.push(client);
  let failed = failList;
  let requirementRevision: string | undefined;
  const base = '/api/production/orders';
  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const parsed = new URL(url);
    const method = options.method ?? 'GET';
    if (parsed.pathname === '/api/products')
      return response({ data: [product], meta: { page: 1, limit: 20, total: 1 } });
    if (parsed.pathname === '/api/production/boms')
      return response({ data: [bom], meta: { page: 1, limit: 20, total: 1 } });
    if (parsed.pathname === '/api/warehouses')
      return response({ data: [warehouse], meta: { page: 1, limit: 20, total: 1 } });
    if (parsed.pathname === base && method === 'GET') {
      if (failed) return response({ message: 'Error de consulta' }, 500);
      return response({
        data: empty ? [] : [order],
        meta: { page: 1, limit: 20, total: empty ? 0 : 1 },
      });
    }
    if (parsed.pathname === base && method === 'POST') {
      Object.assign(order, JSON.parse(String(options.body)));
      return response({ data: order }, 201);
    }
    if (parsed.pathname === base + '/order' && method === 'GET') return response({ data: order });
    if (parsed.pathname === base + '/order' && method === 'PATCH') {
      Object.assign(order, JSON.parse(String(options.body)), { updatedAt: '2026-10-10T12:01:00Z' });
      return response({ data: order });
    }
    if (parsed.pathname === base + '/order/cancel') {
      order.status = 'CANCELLED';
      order.updatedAt = '2026-10-10T12:02:00Z';
      return response({ data: order });
    }
    if (parsed.pathname === base + '/order/requirements')
      return response({
        data: {
          orderId: order.id,
          bomVersionId: order.bomVersionId,
          version: 1,
          quantityPlanned: order.quantityPlanned,
          warehouseId: order.warehouseId,
          updatedAt: requirementRevision ?? order.updatedAt,
          canStart: false,
          eligibilityIssues: order.status === 'DRAFT' ? [] : ['La orden no está en borrador'],
          items: [
            {
              product: component,
              required: '5000.0000',
              available: '2000.0000',
              shortage: '3000.0000',
            },
          ],
        },
      });
    return response({ message: 'Ruta no simulada' }, 404);
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/production/orders" element={<OrdersPage />} />
          <Route path="/production/orders/new" element={<NewOrderPage />} />
          <Route path="/production/orders/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    client,
    order,
    fetch,
    retry: () => {
      failed = false;
    },
    staleRequirements: (revision: string) => {
      requirementRevision = revision;
    },
  };
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

describe('C-1: órdenes y disponibilidad', () => {
  it.each(['IN_PROGRESS', 'COMPLETED'] as const)(
    'ofrece monitoreo para %s sin perder la consulta de disponibilidad',
    async (status) => {
      setup('PRODUCCION', '/production/orders/order', { status });
      const link = await screen.findByRole('link', { name: 'Monitoreo IIoT' });
      expect(link.getAttribute('href')).toBe('/production/orders/order/iiot');
      expect(screen.getByRole('button', { name: 'Actualizar disponibilidad' })).toBeTruthy();
      if (status === 'IN_PROGRESS')
        expect(await screen.findByRole('form', { name: 'Completar producción' })).toBeTruthy();
    },
  );
  it.each(['DRAFT', 'CANCELLED'] as const)(
    'no ofrece el acceso secundario para %s',
    async (status) => {
      setup('PRODUCCION', '/production/orders/order', { status });
      await screen.findByRole('heading', { name: 'Orden de producción OP-2026-000001' });
      expect(screen.queryByRole('link', { name: 'Monitoreo IIoT' })).toBeNull();
    },
  );
  it('refresca detalle y requisitos cuando otra persona cambia la orden', async () => {
    const { order } = setup('PRODUCCION', '/production/orders/order');
    await screen.findByText('3000.0000');
    order.quantityPlanned = '20.0000';
    order.updatedAt = '2026-10-10T12:03:00Z';
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar disponibilidad' }));
    await waitFor(() =>
      expect(screen.getByText('Cantidad planificada').closest('div')?.textContent).toContain(
        '20.0000',
      ),
    );
    expect(await screen.findByText('3000.0000')).toBeTruthy();
    expect(screen.queryByText('La orden cambió; actualizá la disponibilidad.')).toBeNull();
  });
  it('envía filtros de producto y almacén por UUID sin limitar el selector a la página visible de órdenes', async () => {
    const { fetch } = setup('PRODUCCION');
    fireEvent.click(screen.getByRole('button', { name: 'Producto: Todos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'JABON · Jabón' }));
    fireEvent.click(screen.getByRole('button', { name: 'Almacén: Todos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ALM · Principal' }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) => {
          const query = new URL(url).searchParams;
          return query.get('productId') === product.id && query.get('warehouseId') === warehouse.id;
        }),
      ).toBe(true),
    );
  });
  it('crea desde BOM/almacén y envía instantes UTC elegidos en Managua', async () => {
    const { fetch } = setup('PRODUCCION');
    fireEvent.click(await screen.findByRole('link', { name: 'Nueva orden' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Seleccionar Fórmula jabón · JABON · v1' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar ALM · Principal' }));
    fireEvent.change(screen.getByLabelText('Cantidad planificada'), { target: { value: '10.5' } });
    fireEvent.change(screen.getByLabelText('Inicio planificado'), {
      target: { value: '2026-10-10T08:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => {
      expect(screen.queryAllByRole('alert').map((alert) => alert.textContent)).toEqual([]);
      expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true);
    });
    await screen.findByText('Orden de producción OP-2026-000001', { selector: 'h1' });
    const call = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      productId: product.id,
      bomVersionId: ids[1],
      warehouseId: warehouse.id,
      quantityPlanned: '10.5',
      plannedStartAt: '2026-10-10T14:30:00.000Z',
      plannedEndAt: null,
    });
    expect(await screen.findByText('3000.0000')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Iniciar producción' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('VENTAS consulta disponibilidad sin acciones de escritura y acceso directo a nuevo no crea formulario', async () => {
    const { fetch } = setup('VENTAS', '/production/orders/order');
    expect(await screen.findByText('3000.0000')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
    expect(
      fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET'),
    ).toBe(true);
  });
  it('bloquea alta directa para un rol de consulta', async () => {
    setup('INVENTARIO', '/production/orders/new');
    expect(
      await screen.findByText('No tenés permiso para crear órdenes de producción.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull();
  });
  it('edita cantidades preservando versión e instante exacto; cancela e invalida consulta', async () => {
    const { fetch } = setup('ADMIN', '/production/orders/order');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar borrador' }));
    expect((screen.getByLabelText('Inicio planificado') as HTMLInputElement).value).toBe(
      '2026-10-10T08:30',
    );
    fireEvent.change(screen.getByLabelText('Cantidad planificada'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull(),
    );
    const call = fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      bomVersionId: ids[1],
      quantityPlanned: '20',
      plannedStartAt: '2026-10-10T14:30:45.123Z',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar orden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    await screen.findByText('Cancelada');
    expect(screen.getByText('JABON · Jabón')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
    expect(await screen.findByText('La orden no está en borrador')).toBeTruthy();
  });
  it('rechaza precisión inválida y oculta requisitos de una revisión vieja', async () => {
    const { fetch, staleRequirements } = setup('PRODUCCION', '/production/orders/order');
    await screen.findByText('3000.0000');
    fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' }));
    fireEvent.change(screen.getByLabelText('Cantidad planificada'), {
      target: { value: '1.00001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Cantidad planificada').getAttribute('aria-invalid')).toBe(
        'true',
      ),
    );
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
    staleRequirements('2026-10-10T12:00:00Z');
    fireEvent.change(screen.getByLabelText('Cantidad planificada'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText('La orden cambió; actualizá la disponibilidad.');
    expect(screen.queryByText('3000.0000')).toBeNull();
  });
  it('muestra error recuperable y listado vacío', async () => {
    const { retry } = setup('PRODUCCION', '/production/orders', { empty: true, failList: true });
    const button = await screen.findByRole('button', { name: 'Reintentar' });
    retry();
    fireEvent.click(button);
    expect(await screen.findByText('No hay órdenes de producción todavía.')).toBeTruthy();
  });

  it('resume la fórmula elegida, permite cambiarla y oculta paginación de una sola página', async () => {
    const { fetch } = setup('PRODUCCION', '/production/orders/new');
    const formulas = await screen.findByRole('table', { name: 'Fórmulas disponibles' });
    expect(screen.queryByRole('button', { name: 'Anterior' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull();
    fireEvent.click(
      within(formulas).getByRole('button', { name: 'Seleccionar Fórmula jabón · JABON · v1' }),
    );
    expect(screen.getByText('Fórmula seleccionada')).toBeTruthy();
    expect(screen.getByText(/Cantidad base: 1.0000/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Fórmulas disponibles' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(screen.getByRole('table', { name: 'Fórmulas disponibles' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Conservar selección' }));
    expect(screen.queryByRole('table', { name: 'Fórmulas disponibles' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar ALM · Principal' }));
    expect(screen.getByText('Almacén seleccionado')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Almacenes disponibles' })).toBeNull();
    expect(
      fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET'),
    ).toBe(true);
  });
});
