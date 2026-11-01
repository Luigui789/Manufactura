import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { AppRoutes } from '@/routes/AppRoutes';
import { navigation } from '@/layouts/navigation';
import { PurchasesDashboardPage } from './PurchasesDashboardPage';
import type { PurchasesDashboard } from '../api/dashboard';

const supplier = { id: 's1', code: 'SUP-1', name: 'Proveedor inactivo' };
const dashboard: PurchasesDashboard = {
  period: { from: '2026-10-01', to: '2026-10-03', timeZone: 'America/Managua', granularity: 'day' },
  selectedSupplier: null,
  suppliers: { active: 3, usedInPeriod: 2 },
  pipeline: { awaitingReceipt: 4, overdue: 1 },
  orders: { total: 5, draft: 1, confirmed: 1, partiallyReceived: 1, received: 1, cancelled: 1 },
  amounts: { committed: '12500.50' },
  receipts: { total: 7, lines: 11 },
  activityByPeriod: [
    { period: '2026-10-01', orders: 5, receipts: 7 },
    { period: '2026-10-02', orders: 0, receipts: 0 },
  ],
  topSuppliers: [{ supplier, orders: 4, committedAmount: '5500.00' }],
  recentOrders: [
    {
      id: 'o1',
      number: 'OC-2026-000001',
      status: 'PARTIALLY_RECEIVED',
      orderedAt: '2026-10-02T06:00:00Z',
      expectedDate: '2026-11-05',
      total: '2500.00',
      itemsCount: 3,
      receiptsCount: 1,
      supplier,
    },
  ],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const catalog = () =>
  response({ data: [{ ...supplier, isActive: false }], meta: { page: 1, limit: 20, total: 1 } });
function mount() {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <PurchasesDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function stub(d = dashboard) {
  const fetch = vi.fn(async (url: string) =>
    url.includes('/suppliers?') ? catalog() : response({ data: d }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PurchasesDashboardPage', () => {
  it('shows loading then current and period KPIs, five statuses, charts, suppliers and recent detail link', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/suppliers?')
          ? Promise.resolve(catalog())
          : new Promise<Response>((done) => {
              resolve = done;
            }),
      ),
    );
    mount();
    expect(screen.getByText('Cargando dashboard de compras…')).toBeTruthy();
    resolve(response({ data: dashboard }));
    await screen.findByText('Proveedores activos');
    for (const label of [
      'Estado actual',
      'Actividad del período',
      'Pendientes de recepción',
      'Vencidas',
      'Órdenes emitidas',
      'Recepciones',
      'Valor comprometido',
      'Proveedores con actividad',
      'Borrador',
      'Confirmada',
      'Recibida parcialmente',
      'Recibida',
      'Cancelada',
    ])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText('12500.50')).toBeTruthy();
    expect(screen.getByText('5500.00')).toBeTruthy();
    expect(screen.getByText('2500.00')).toBeTruthy();
    expect(screen.getByText(/11 líneas recibidas/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Gráfico de órdenes por estado' })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Gráfico de órdenes y recepciones por período' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'OC-2026-000001' }).getAttribute('href')).toBe(
      '/purchases/orders/o1',
    );
    expect(screen.getByText('2026-11-05')).toBeTruthy();
    const table = screen.getByRole('table', {
      name: 'Actividad de compras por período',
      hidden: true,
    });
    expect(within(table).getByText('2026-10-01')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/C\$|NIO|USD|Valor recibido|Cantidad total/);
  });
  it('shows error and retries successfully', async () => {
    let failed = true;
    const fetch = vi.fn(async (url: string) =>
      url.includes('/suppliers?')
        ? catalog()
        : failed
          ? response({ message: 'No disponible' }, 500)
          : response({ data: dashboard }),
    );
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(await screen.findByText('Error interno del servidor')).toBeTruthy();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Proveedores activos')).toBeTruthy();
  });
  it('shows zero metrics and an empty period while retaining the current pipeline', async () => {
    stub({
      ...dashboard,
      suppliers: { active: 0, usedInPeriod: 0 },
      orders: { total: 0, draft: 0, confirmed: 0, partiallyReceived: 0, received: 0, cancelled: 0 },
      amounts: { committed: '0.00' },
      receipts: { total: 0, lines: 0 },
      topSuppliers: [],
      recentOrders: [],
    });
    mount();
    expect(await screen.findByText('Sin actividad de compras en este período.')).toBeTruthy();
    expect(screen.getByText('0.00')).toBeTruthy();
    expect(screen.getByText('Pendientes de recepción')).toBeTruthy();
    expect(screen.getByText('No hay órdenes recientes.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Gráfico de órdenes por estado' })).toBeNull();
  });
  it('keeps receipt-only activity visible', async () => {
    stub({
      ...dashboard,
      orders: { total: 0, draft: 0, confirmed: 0, partiallyReceived: 0, received: 0, cancelled: 0 },
      recentOrders: [],
      topSuppliers: [],
    });
    mount();
    await screen.findByText('Órdenes emitidas');
    expect(
      screen.getByRole('img', { name: 'Gráfico de órdenes y recepciones por período' }),
    ).toBeTruthy();
    expect(screen.queryByText('Sin actividad de compras en este período.')).toBeNull();
  });
  it('applies calendar date filters only on submit', async () => {
    const fetch = stub();
    mount();
    await screen.findByText('Órdenes emitidas');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
    expect(fetch.mock.calls.some(([url]) => url.includes('from='))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('from=2026-09-01&to=2026-09-30'),
        expect.anything(),
      ),
    );
  });
  it('selects an inactive supplier for history and clears back to all suppliers', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('/suppliers?')
        ? catalog()
        : response({
            data: { ...dashboard, selectedSupplier: url.includes('supplierId=') ? supplier : null },
          }),
    );
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText('Órdenes emitidas');
    fireEvent.click(screen.getByText('Proveedor: Todos'));
    fireEvent.click(await screen.findByRole('button', { name: 'SUP-1 · Proveedor inactivo' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('supplierId=s1'),
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Proveedor: SUP-1 · Proveedor inactivo')).toBeTruthy();
    expect(
      fetch.mock.calls
        .filter(([url]) => url.includes('/suppliers?'))
        .every(([url]) => !url.includes('isActive=true')),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Todos los proveedores' }));
    expect(await screen.findByText('Proveedor: Todos')).toBeTruthy();
  });
  it('places dashboard before the unchanged Compras navigation entry for all roles', () => {
    const i = navigation.findIndex((row) => row.to === '/purchases/dashboard');
    expect(navigation[i].label).toBe('Compras · Dashboard');
    expect(navigation[i + 1]).toMatchObject({ to: '/purchases/orders', label: 'Compras' });
    expect(navigation[i].roles).toEqual(navigation[i + 1].roles);
  });
  it('opens the authenticated route for VENTAS and exposes navigation', async () => {
    stub();
    const client = createAppQueryClient();
    client.setQueryData(SESSION_KEY, {
      id: 'u1',
      email: 'test@example.test',
      fullName: 'Prueba',
      role: 'VENTAS',
      isActive: true,
      mustChangePassword: false,
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/purchases/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard de compras' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compras · Dashboard' }).getAttribute('href')).toBe(
      '/purchases/dashboard',
    );
    await screen.findByText('Proveedores activos');
  });
});
