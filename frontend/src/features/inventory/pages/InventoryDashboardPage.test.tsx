import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { AppRoutes } from '@/routes/AppRoutes';
import { navigation } from '@/layouts/navigation';
import { InventoryDashboardPage } from './InventoryDashboardPage';
import type { InventoryDashboard } from '../api/dashboard';

const dashboard: InventoryDashboard = {
  period: { from: '2026-10-01', to: '2026-10-03', timeZone: 'America/Managua', granularity: 'day' },
  selectedProduct: null,
  selectedWarehouse: null,
  catalog: {
    activeProducts: 4,
    activeWarehouses: 1,
    productsByType: { rawMaterial: 1, intermediate: 1, finishedGood: 1, consumable: 1 },
  },
  stockPositions: { withOnHand: 3 },
  lotsOnHand: { total: 5, quarantined: 1, released: 1, rejected: 1, rework: 1, scrapped: 1 },
  stock: null,
  movementQuantity: null,
  movements: {
    total: 1,
    byType: {
      adjustmentIn: 0,
      adjustmentOut: 0,
      purchaseReceipt: 0,
      productionConsumption: 0,
      productionOutput: 0,
      saleDispatch: 0,
      qualityScrap: 1,
    },
  },
  movementsByPeriod: [{ period: '2026-10-01', count: 1 }],
  recentMovements: [
    {
      id: 'm1',
      type: 'QUALITY_SCRAP',
      quantity: '-25.0000',
      reason: null,
      occurredAt: '2026-10-03T18:00:00Z',
      requestId: null,
      purchaseReceiptItemId: null,
      productionOrderId: null,
      saleDispatchItemId: null,
      businessReference: null,
      product: { id: 'p1', code: 'P1', name: 'Producto prueba', unit: 'UNIT' },
      warehouse: { id: 'w1', code: 'W1', name: 'Almacén prueba' },
      lot: { id: 'l1', code: 'L1', status: 'SCRAPPED' },
      performedByUser: { id: 'u1', fullName: 'Operador' },
    },
  ],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function mount() {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <InventoryDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => vi.unstubAllGlobals());

describe('InventoryDashboardPage', () => {
  it('loads KPIs, four product types, five lot states, charts and quality scrap with no global quantities', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    mount();
    expect(screen.getByText('Cargando dashboard de inventario…')).toBeTruthy();
    resolve(response({ data: dashboard }));
    expect(await screen.findByText('Productos activos')).toBeTruthy();
    for (const name of [
      'Materia prima',
      'Producto intermedio',
      'Producto terminado',
      'Consumible',
      'En cuarentena',
      'Liberado',
      'Rechazado',
      'Reproceso',
    ])
      expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getAllByText('Descarte por calidad')).toHaveLength(2);
    expect(screen.getByText('Operador')).toBeTruthy();
    expect(screen.getByText('-25 Unidad')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('saldo físico positivo'),
    );
    expect(screen.getByRole('img', { name: 'Gráfico de productos activos por tipo' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Gráfico de lotes actuales por estado' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Gráfico de movimientos por período' })).toBeTruthy();
    expect(screen.queryByText('Entradas')).toBeNull();
    expect(screen.getByText('Existencia actual')).toBeTruthy();
    expect(screen.getByText('Actividad del período')).toBeTruthy();
  });
  it('shows empty catalog and activity without hiding current KPIs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            ...dashboard,
            catalog: { ...dashboard.catalog, activeProducts: 0 },
            movements: { ...dashboard.movements, total: 0 },
            recentMovements: [],
          },
        }),
      ),
    );
    mount();
    expect(await screen.findByText('Sin productos activos')).toBeTruthy();
    expect(screen.getByText('Sin actividad en este período')).toBeTruthy();
    expect(screen.getByText('No hay movimientos recientes.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Gráfico de movimientos por período' })).toBeNull();
  });
  it('retries errors and sends calendar filters', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ message: 'unavailable' }, 503))
      .mockResolvedValue(response({ data: dashboard }));
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(await screen.findByText(/Error interno del servidor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Productos activos');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/inventory/dashboard?from=2026-10-01&to=2026-10-03'),
        expect.anything(),
      ),
    );
  });
  it('selects inactive products of any type and warehouses, showing physical and consumable quantities and warehouse chart', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/products?'))
        return response({
          data: [
            {
              id: 'p1',
              code: 'P1',
              name: 'Producto inactivo',
              type: 'INTERMEDIATE',
              unit: 'UNIT',
              isActive: false,
            },
          ],
          meta: { page: 1, limit: 20, total: 1 },
        });
      if (url.includes('/warehouses?'))
        return response({
          data: [{ id: 'w1', code: 'W1', name: 'Almacén inactivo', isActive: false }],
          meta: { page: 1, limit: 20, total: 1 },
        });
      return response({
        data: {
          ...dashboard,
          ...(url.includes('productId=')
            ? {
                selectedProduct: {
                  id: 'p1',
                  name: 'Producto inactivo',
                  code: 'P1',
                  unit: 'UNIT',
                  isLotTracked: true,
                },
                stock: {
                  onHand: '100.1250',
                  consumable: '80.2500',
                  unit: 'UNIT',
                  byWarehouse: [
                    {
                      warehouse: { id: 'w1', code: 'W1', name: 'Almacén inactivo' },
                      onHand: '100.1250',
                      consumable: '80.2500',
                    },
                  ],
                },
                movementQuantity: { in: '125.0000', out: '25.0000', net: '100.0000', unit: 'UNIT' },
              }
            : {}),
        },
      });
    });
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText('Productos activos');
    fireEvent.click(screen.getByRole('button', { name: 'Producto: Todos' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Seleccionar P1 · Producto inactivo' }),
    );
    expect((await screen.findAllByText('100.125 Unidad')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('80.25 Unidad').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Gráfico de stock por almacén' })).toBeTruthy();
    expect(screen.getByText('Entradas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Almacén: Todos' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Seleccionar W1 · Almacén inactivo' }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('productId=p1&warehouseId=w1'),
        expect.anything(),
      ),
    );
    const catalogCalls = fetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => /\/(products|warehouses)\?/.test(url));
    expect(catalogCalls.length).toBeGreaterThan(0);
    expect(catalogCalls.every((url) => !url.includes('isActive=') && !url.includes('type='))).toBe(
      true,
    );
  });
  it('places dashboard before stock in inventory navigation', () => {
    const inventory = navigation.filter((row) => row.module === 'Inventario');
    expect(inventory.slice(0, 2).map((row) => row.to)).toEqual([
      '/inventory/dashboard',
      '/inventory/stock',
    ]);
  });
  it('opens the authenticated dashboard route and exposes the inventory navigation link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ data: dashboard })));
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
        <MemoryRouter initialEntries={['/inventory/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard de inventario' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Inventario · Resumen' }).getAttribute('href')).toBe(
      '/inventory/dashboard',
    );
    await screen.findByText('Productos activos');
  });
});
