import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { AppRoutes } from '@/routes/AppRoutes';
import { navigation } from '@/layouts/navigation';
import { SalesDashboardPage } from './SalesDashboardPage';
import type { SalesDashboard } from '../api/dashboard';
import { CatalogPicker } from '@/components/CatalogPicker';

const customer = { id: 's1', code: 'CLI-1', name: 'Cliente inactivo' };
const dashboard: SalesDashboard = {
  period: { from: '2026-10-01', to: '2026-10-03', timeZone: 'America/Managua', granularity: 'day' },
  selectedCustomer: null,
  customers: { active: 3, usedInPeriod: 2 },
  pipeline: { awaitingDispatch: 4 },
  orders: { total: 5, draft: 1, confirmed: 1, partiallyDispatched: 1, dispatched: 1, cancelled: 1 },
  amounts: { confirmed: '12500.50' },
  dispatches: { total: 7, lines: 11 },
  activityByPeriod: [
    { period: '2026-10-01', orders: 5, dispatches: 7 },
    { period: '2026-10-02', orders: 0, dispatches: 0 },
  ],
  topCustomers: [{ customer, orders: 4, confirmedAmount: '5500.00' }],
  recentOrders: [
    {
      id: 'o1',
      number: 'OV-2026-000001',
      status: 'PARTIALLY_DISPATCHED',
      orderedAt: '2026-10-02T06:00:00Z',
      total: '2500.00',
      itemsCount: 3,
      dispatchesCount: 1,
      customer,
    },
  ],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const catalog = () =>
  response({ data: [{ ...customer, isActive: false }], meta: { page: 1, limit: 20, total: 1 } });
function mount() {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <SalesDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function stub(d = dashboard) {
  const fetch = vi.fn(async (url: string) =>
    url.includes('/customers?') ? catalog() : response({ data: d }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SalesDashboardPage', () => {
  it('shows loading then current and period KPIs, five statuses, charts, customers and recent detail link', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/customers?')
          ? Promise.resolve(catalog())
          : new Promise<Response>((done) => {
              resolve = done;
            }),
      ),
    );
    mount();
    expect(screen.getByText('Cargando dashboard de ventas…')).toBeTruthy();
    resolve(response({ data: dashboard }));
    await screen.findByText('Clientes activos');
    for (const label of [
      'Pipeline actual',
      'Actividad del período',
      'Pendientes de despacho',
      'Órdenes emitidas',
      'Despachos',
      'Valor confirmado',
      'Clientes con actividad',
      'Borrador',
      'Confirmada',
      'Parcialmente despachada',
      'Despachada',
      'Cancelada',
    ])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText('12500.50')).toBeTruthy();
    expect(screen.getByText('5500.00')).toBeTruthy();
    expect(screen.getByText('2500.00')).toBeTruthy();
    expect(screen.getByText(/11 líneas despachadas/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Gráfico de órdenes por estado' })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Gráfico de órdenes y despachos por período' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'OV-2026-000001' }).getAttribute('href')).toBe(
      '/sales/orders/o1',
    );
    const table = screen.getByRole('table', {
      name: 'Actividad de ventas por período',
      hidden: true,
    });
    expect(within(table).getByText('2026-10-01')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/C\$|NIO|USD|Valor recibido|Cantidad total/);
  });
  it('shows error and retries successfully', async () => {
    let failed = true;
    const fetch = vi.fn(async (url: string) =>
      url.includes('/customers?')
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
    expect(await screen.findByText('Clientes activos')).toBeTruthy();
  });
  it('shows zero metrics and an empty period while retaining the current pipeline', async () => {
    stub({
      ...dashboard,
      customers: { active: 0, usedInPeriod: 0 },
      orders: {
        total: 0,
        draft: 0,
        confirmed: 0,
        partiallyDispatched: 0,
        dispatched: 0,
        cancelled: 0,
      },
      amounts: { confirmed: '0.00' },
      dispatches: { total: 0, lines: 0 },
      topCustomers: [],
      recentOrders: [],
    });
    mount();
    expect(await screen.findByText('Sin actividad de ventas en este período.')).toBeTruthy();
    expect(screen.getByText('0.00')).toBeTruthy();
    expect(screen.getByText('Pendientes de despacho')).toBeTruthy();
    expect(screen.getByText('No hubo órdenes de venta en este período.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Gráfico de órdenes por estado' })).toBeNull();
  });
  it('keeps dispatch-only activity visible', async () => {
    stub({
      ...dashboard,
      orders: {
        total: 0,
        draft: 0,
        confirmed: 0,
        partiallyDispatched: 0,
        dispatched: 0,
        cancelled: 0,
      },
      recentOrders: [],
      topCustomers: [],
    });
    mount();
    await screen.findByText('Órdenes emitidas');
    expect(
      screen.getByRole('img', { name: 'Gráfico de órdenes y despachos por período' }),
    ).toBeTruthy();
    expect(screen.queryByText('Sin actividad de ventas en este período.')).toBeNull();
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
  it('selects an inactive customer for history and clears back to all customers', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('/customers?')
        ? catalog()
        : response({
            data: { ...dashboard, selectedCustomer: url.includes('customerId=') ? customer : null },
          }),
    );
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText('Órdenes emitidas');
    fireEvent.click(screen.getByText('Cliente: Todos'));
    fireEvent.click(await screen.findByRole('button', { name: 'CLI-1 · Cliente inactivo' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('customerId=s1'),
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Cliente: CLI-1 · Cliente inactivo')).toBeTruthy();
    expect(
      fetch.mock.calls
        .filter(([url]) => url.includes('/customers?'))
        .every(([url]) => !url.includes('isActive=true')),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Cliente: Todos')).toBeTruthy();
  });
  it('places dashboard before the unchanged Ventas navigation entry for all roles', () => {
    const i = navigation.findIndex((row) => row.to === '/sales/dashboard');
    expect(navigation[i]).toMatchObject({ label: 'Resumen', module: 'Ventas' });
    expect(navigation[i + 1]).toMatchObject({
      to: '/sales/orders',
      label: 'Órdenes',
      module: 'Ventas',
    });
    expect(navigation[i].roles).toEqual(navigation[i + 1].roles);
  });
  it('selects an active customer', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('/customers?')
        ? response({
            data: [{ id: 'active', code: 'CLI-A', name: 'Cliente activo', isActive: true }],
            meta: { page: 1, limit: 20, total: 1 },
          })
        : response({ data: dashboard }),
    );
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText('Clientes activos');
    fireEvent.click(screen.getByText('Cliente: Todos'));
    fireEvent.click(await screen.findByRole('button', { name: 'CLI-A · Cliente activo' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('customerId=active'),
        expect.anything(),
      ),
    );
  });
  it('preserves active-only customer selection for existing writer forms', async () => {
    const fetch = vi.fn().mockResolvedValue(catalog());
    vi.stubGlobal('fetch', fetch);
    render(
      <QueryClientProvider client={createAppQueryClient()}>
        <CatalogPicker kind="customer" value="" onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByText('No hay cliente disponibles en esta página.');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('isActive=true'), expect.anything());
    expect(screen.queryByRole('button', { name: 'CLI-1 · Cliente inactivo' })).toBeNull();
  });
  it('opens the authenticated route for COMPRAS and exposes navigation', async () => {
    stub();
    const client = createAppQueryClient();
    client.setQueryData(SESSION_KEY, {
      id: 'u1',
      email: 'test@example.test',
      fullName: 'Prueba',
      role: 'COMPRAS',
      isActive: true,
      mustChangePassword: false,
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/sales/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard de ventas' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ventas · Resumen' }).getAttribute('href')).toBe(
      '/sales/dashboard',
    );
    await screen.findByText('Clientes activos');
  });
});
