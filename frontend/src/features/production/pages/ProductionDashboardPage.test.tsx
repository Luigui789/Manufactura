import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '@/app/query-client';
import { ProductionDashboardPage } from './ProductionDashboardPage';

const dashboard = {
  period: { from: '2026-10-01', to: '2026-10-03', timeZone: 'America/Managua', granularity: 'day' },
  selectedProduct: { id: 'product-1', code: 'PT-001', name: 'Jabón ecológico', unit: 'UNIT' },
  orders: { draft: 1, inProgress: 2, completed: 3, cancelled: 0, total: 6 },
  quantity: { planned: '120.5000', produced: '90.2500', completionRate: '74.90', unit: 'UNIT' },
  productionByPeriod: [{ period: '2026-10-01', planned: '120.5000', produced: '90.2500' }],
  recentOrders: [
    {
      id: 'order-1',
      number: 'OP-2026-000001',
      status: 'COMPLETED',
      quantityPlanned: '10.0000',
      quantityProduced: '9.0000',
      activityAt: '2026-10-03T18:00:00.000Z',
      plannedStartAt: null,
      startedAt: null,
      completedAt: '2026-10-03T18:00:00.000Z',
      product: { id: 'product-1', code: 'PT-001', name: 'Jabón ecológico' },
      unit: 'UNIT',
    },
  ],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mount() {
  const client = createAppQueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductionDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));

describe('ProductionDashboardPage', () => {
  it('muestra carga y después KPIs, charts y navegación a órdenes recientes', async () => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(screen.getByText('Cargando dashboard de producción…')).toBeTruthy();
    resolve(response({ data: dashboard }));
    expect(await screen.findByText('120.5 Unidad')).toBeTruthy();
    expect(screen.getByText('90.25 Unidad')).toBeTruthy();
    expect(screen.getByText('74.9%')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Gráfico de órdenes por estado' })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Gráfico de cantidades planificadas y producidas' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'OP-2026-000001' }).getAttribute('href')).toBe(
      '/production/orders/order-1',
    );
  });

  it('explica el estado vacío y evita dibujar gráficas con datos simulados', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            ...dashboard,
            selectedProduct: null,
            orders: { draft: 0, inProgress: 0, completed: 0, cancelled: 0, total: 0 },
            quantity: null,
            productionByPeriod: [],
            recentOrders: [],
          },
        }),
      ),
    );
    mount();
    expect(await screen.findByText('Sin actividad en este período')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByRole('img', { name: /Gráfico/ })).toBeNull();
  });

  it('muestra error, reintenta y pasa filtros de fecha al servidor', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ message: 'servicio no disponible' }, 503))
      .mockResolvedValue(response({ data: dashboard }));
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(await screen.findByText(/Error interno del servidor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('120.5 Unidad')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/production/dashboard?from=2026-10-01&to=2026-10-03'),
        expect.objectContaining({ credentials: 'include' }),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard de producción' })).toBeTruthy();
  });

  it('busca un producto terminado activo y vuelve a consultar cantidades con su UUID', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/products?')) {
        const params = new URL(url).searchParams;
        const onSecondPage = params.get('page') === '2';
        return response({
          data: onSecondPage
            ? [
                {
                  id: 'product-2',
                  code: 'PT-002',
                  name: 'Jabón de avena',
                  type: 'FINISHED_GOOD',
                  unit: 'LITER',
                  isActive: true,
                },
              ]
            : [],
          meta: { page: onSecondPage ? 2 : 1, limit: 20, total: 21 },
        });
      }
      return response({
        data: {
          ...dashboard,
          selectedProduct: {
            id: 'product-2',
            code: 'PT-002',
            name: 'Jabón de avena',
            unit: 'LITER',
          },
          quantity: {
            planned: '11.0000',
            produced: '8.0000',
            completionRate: '72.73',
            unit: 'LITER',
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByRole('heading', { name: 'Dashboard de producción' });

    fireEvent.click(screen.getByRole('button', { name: 'Producto: Todos' }));
    fireEvent.change(await screen.findByLabelText('Buscar producto'), {
      target: { value: 'avena' },
    });
    expect(await screen.findByText('Página 1 de 2 · 21 resultados')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Página 2 de 2 · 21 resultados')).toBeTruthy();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Seleccionar PT-002 · Jabón de avena' }),
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/production/dashboard?productId=product-2'),
        expect.anything(),
      ),
    );
    expect(await screen.findByText('11 Litro')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('type=FINISHED_GOOD'),
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('isActive=true'), expect.anything());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('search=avena'), expect.anything());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.anything());
  });
});
