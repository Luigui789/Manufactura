import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode, SessionUser } from '@/features/auth/types';
import type { PurchaseOrder } from '../api/orders';
import { PurchaseOrdersPage } from './PurchaseOrdersPage';
import { NewPurchaseOrderPage } from './NewPurchaseOrderPage';
import { PurchaseOrderDetailPage } from './PurchaseOrderDetailPage';
const ids = Array.from(
  { length: 7 },
  (_, i) => '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
);
const supplier = { id: ids[0], code: 'PRV', name: 'Proveedor', isActive: true };
const product = {
  id: ids[1],
  code: 'ACEITE',
  name: 'Aceite',
  unit: 'LITER',
  type: 'RAW_MATERIAL',
  isActive: true,
  isLotTracked: true,
  requiresQualityInspection: true,
};
const warehouses = [
  { id: ids[3], code: 'ALM-A', name: 'Principal', isActive: true },
  { id: ids[4], code: 'ALM-B', name: 'Secundario', isActive: true },
];
const clients: ReturnType<typeof createAppQueryClient>[] = [];
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function setup(
  role: RoleCode,
  path = '/purchases/orders',
  options: {
    status?: PurchaseOrder['status'];
    empty?: boolean;
    failList?: boolean;
    failReceive?: boolean;
  } = {},
) {
  let order: PurchaseOrder = {
    id: ids[5],
    number: 'OC-2026-000001',
    supplier,
    status: options.status ?? 'DRAFT',
    orderedAt: '2026-10-13T12:00:00Z',
    expectedDate: '2026-12-01',
    total: '100.00',
    itemsCount: 1,
    items: [
      {
        id: ids[2],
        productId: product.id,
        productCode: 'ACEITE',
        productName: 'Aceite',
        productUnit: 'LITER',
        isLotTracked: true,
        requiresQualityInspection: true,
        quantityOrdered: '100.0000',
        quantityReceived: '0.0000',
        quantityPending: '100.0000',
        unitPrice: '1.0000',
        lineTotal: '100.00',
      },
    ],
    receipts: [],
  };
  const requests: { path: string; method: string; body: unknown }[] = [];
  const client = createAppQueryClient();
  clients.push(client);
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  client.setQueryData(SESSION_KEY, {
    id: 'actor',
    email: 'purchases@example.test',
    fullName: 'Compras',
    role,
    isActive: true,
    mustChangePassword: false,
    createdAt: '',
    updatedAt: '',
  } satisfies SessionUser);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost',
      );
      const method = init?.method ?? 'GET';
      const payload = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      requests.push({ path: url.pathname + url.search, method, body: payload });
      if (url.pathname.endsWith('/auth/me'))
        return response({ data: client.getQueryData(SESSION_KEY) });
      if (url.pathname.endsWith('/suppliers'))
        return response({ data: [supplier], meta: { page: 1, limit: 20, total: 1 } });
      if (url.pathname.endsWith('/products'))
        return response({ data: [product], meta: { page: 1, limit: 20, total: 1 } });
      if (url.pathname.endsWith('/warehouses'))
        return response({ data: warehouses, meta: { page: 1, limit: 20, total: 2 } });
      if (url.pathname.endsWith('/purchase-orders') && method === 'GET')
        return options.failList
          ? response({ message: 'No se pudo cargar' }, 500)
          : response({
              data: options.empty ? [] : [order],
              meta: {
                page: Number(url.searchParams.get('page') ?? 1),
                limit: 20,
                total: options.empty ? 0 : 40,
              },
            });
      if (method === 'PATCH') {
        const value = payload as {
          expectedDate: string | null;
          items: { quantity: string; unitPrice: string }[];
        };
        order = {
          ...order,
          expectedDate: value.expectedDate,
          items: [{ ...order.items[0], quantityOrdered: value.items[0].quantity }],
        };
      }
      if (url.pathname.endsWith('/confirm')) order = { ...order, status: 'CONFIRMED' };
      if (url.pathname.endsWith('/cancel')) order = { ...order, status: 'CANCELLED' };
      if (url.pathname.endsWith('/receive')) {
        if (options.failReceive)
          return response(
            { message: 'La cantidad excede el pendiente', code: 'RECEIPT_EXCEEDS_PENDING' },
            409,
          );
        order = {
          ...order,
          status: 'PARTIALLY_RECEIVED',
          items: [{ ...order.items[0], quantityReceived: '50.0000', quantityPending: '50.0000' }],
          receipts: [
            {
              id: ids[6],
              number: 'REC-2026-000001',
              receivedAt: '2026-10-13T20:00:00Z',
              receivedByFullName: 'Compras',
              notes: 'Entrega',
              items: [
                {
                  id: ids[6],
                  purchaseOrderItemId: ids[2],
                  productId: product.id,
                  warehouse: warehouses[0],
                  quantity: '30.0000',
                  lot: {
                    id: ids[6],
                    code: 'LOT-2026-000001',
                    status: 'QUARANTINED',
                    expiresAt: '2027-12-31',
                  },
                },
              ],
            },
          ],
        };
      }
      return response(
        { data: order },
        method === 'POST' && url.pathname.endsWith('/purchase-orders') ? 201 : 200,
      );
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/purchases/orders" element={<PurchaseOrdersPage />} />
          <Route path="/purchases/orders/new" element={<NewPurchaseOrderPage />} />
          <Route path="/purchases/orders/:id" element={<PurchaseOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.unstubAllGlobals();
});
describe('Purchase UI', () => {
  it('lists, filters by number/status/supplier and paginates', async () => {
    const requests = setup('COMPRAS');
    await screen.findByText('OC-2026-000001');
    fireEvent.change(screen.getByLabelText('Número de orden'), { target: { value: 'OC-2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'CONFIRMED' } });
    fireEvent.click(await screen.findByRole('button', { name: 'PRV · Proveedor' }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.path.includes('status=CONFIRMED') &&
            r.path.includes('supplierId=' + supplier.id) &&
            r.path.includes('search=OC-2026'),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(requests.some((r) => r.path.includes('page=2'))).toBe(true));
  });
  it.each(['INVENTARIO', 'PRODUCCION', 'VENTAS'] as const)(
    'read-only role %s sees list/detail without mutation actions',
    async (role) => {
      setup(role, '/purchases/orders/' + ids[5], { status: 'CONFIRMED' });
      await screen.findByText('OC-2026-000001');
      expect(screen.queryByRole('button', { name: 'Recibir compra' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
      expect(screen.getByText('Sin recepciones.')).toBeTruthy();
    },
  );
  it('shows empty and error states with retry', async () => {
    setup('COMPRAS', '/purchases/orders', { empty: true });
    await screen.findByText('No hay órdenes que coincidan.');
    cleanup();
    setup('COMPRAS', '/purchases/orders', { failList: true });
    await screen.findByText('Error interno del servidor');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
  it('creates a draft with strings using catalog selection and calendar date', async () => {
    const requests = setup('COMPRAS', '/purchases/orders/new');
    fireEvent.click(await screen.findByRole('button', { name: 'PRV · Proveedor' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ACEITE · Aceite' }));
    fireEvent.change(screen.getByLabelText('Cantidad ordenada'), { target: { value: '100.0000' } });
    fireEvent.change(screen.getByLabelText('Precio unitario'), { target: { value: '1.0050' } });
    fireEvent.change(screen.getByLabelText('Fecha esperada'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText('OC-2026-000001');
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      supplierId: supplier.id,
      expectedDate: '2026-12-01',
      items: [{ productId: product.id, quantity: '100.0000', unitPrice: '1.0050' }],
    });
  });
  it('edits draft and clears expected date without losing historical product/supplier selection', async () => {
    const requests = setup('ADMIN', '/purchases/orders/' + ids[5]);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar borrador' }));
    fireEvent.change(screen.getByLabelText('Cantidad ordenada'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Fecha esperada'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(requests.some((r) => r.method === 'PATCH')).toBe(true));
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      supplierId: supplier.id,
      expectedDate: null,
      items: [{ productId: product.id, quantity: '90', unitPrice: '1.0000' }],
    });
  });
  it.each(['confirm', 'cancel'] as const)(
    'executes explicit %s action and refreshes status',
    async (action) => {
      const requests = setup('COMPRAS', '/purchases/orders/' + ids[5]);
      fireEvent.click(
        await screen.findByRole('button', {
          name: action === 'confirm' ? 'Confirmar orden' : 'Cancelar orden',
        }),
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: action === 'confirm' ? 'Confirmar compra' : 'Confirmar cancelación',
        }),
      );
      await waitFor(() =>
        expect(requests.some((r) => r.path.endsWith('/' + action) && r.method === 'POST')).toBe(
          true,
        ),
      );
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull(),
      );
    },
  );
  it('receives split lines into warehouses, sends Managua timestamp and shows lot history', async () => {
    const requests = setup('COMPRAS', '/purchases/orders/' + ids[5], { status: 'CONFIRMED' });
    fireEvent.click(await screen.findByRole('button', { name: 'Recibir compra' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ALM-A · Principal' }));
    fireEvent.change(screen.getByLabelText('Cantidad recibida'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Vencimiento del lote (opcional)'), {
      target: { value: '2027-12-31' },
    });
    fireEvent.change(screen.getByLabelText('Fecha y hora de recepción (Managua, opcional)'), {
      target: { value: '2026-10-13T14:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila de recepción' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'ALM-B · Secundario' })[1]);
    fireEvent.change(screen.getAllByLabelText('Cantidad recibida')[1], { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    await screen.findByText('REC-2026-000001');
    const body = requests.find((r) => r.path.endsWith('/receive'))?.body;
    expect(body).toEqual({
      receivedAt: '2026-10-13T14:00:00-06:00',
      notes: '',
      items: [
        {
          purchaseOrderItemId: ids[2],
          warehouseId: ids[3],
          quantity: '30',
          expiresAt: '2027-12-31',
        },
        { purchaseOrderItemId: ids[2], warehouseId: ids[4], quantity: '20' },
      ],
    });
    expect(screen.getByText(/LOT-2026-000001/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
  });
  it('keeps receipt form and quantities on overreceipt error', async () => {
    setup('COMPRAS', '/purchases/orders/' + ids[5], { status: 'CONFIRMED', failReceive: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Recibir compra' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ALM-A · Principal' }));
    fireEvent.change(screen.getByLabelText('Cantidad recibida'), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    await screen.findByText('La cantidad excede el pendiente');
    expect((screen.getByLabelText('Cantidad recibida') as HTMLInputElement).value).toBe('101');
  });
  it.each(['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const)(
    'hides invalid transitions for %s',
    async (status) => {
      setup('COMPRAS', '/purchases/orders/' + ids[5], { status });
      await screen.findByText('OC-2026-000001');
      expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
      if (status !== 'PARTIALLY_RECEIVED')
        expect(screen.queryByRole('button', { name: 'Recibir compra' })).toBeNull();
    },
  );
});
