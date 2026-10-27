import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { SessionUser } from '@/features/auth/types';
import { SalesOrdersPage } from './SalesOrdersPage';

const user = (role: SessionUser['role']): SessionUser => ({
  id: 'user-test',
  email: 'user@example.test',
  fullName: 'Usuario',
  role,
  isActive: true,
  mustChangePassword: false,
  createdAt: '',
  updatedAt: '',
});
const order = {
  id: '00000000-0000-4000-8000-000000000019',
  number: 'OV-2026-000019',
  status: 'DRAFT',
  orderedAt: '2026-10-26T12:00:00.000Z',
  total: '12.00',
  itemsCount: 1,
  customer: { id: '00000000-0000-4000-8000-000000000001', code: 'CLI-01', name: 'Cliente Alfa' },
  items: [],
  createdAt: '',
  updatedAt: '',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let queryClient: ReturnType<typeof createAppQueryClient>;
let requests: URL[];
let handler: (url: URL) => Response | Promise<Response>;
function mount(role: SessionUser['role'] = 'ADMIN') {
  queryClient = createAppQueryClient();
  queryClient.setQueryData(SESSION_KEY, user(role));
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SalesOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  requests = [];
  handler = () => response({ data: [order], meta: { page: 1, limit: 20, total: 21 } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost',
      );
      requests.push(url);
      return handler(url);
    }),
  );
});
afterEach(() => {
  cleanup();
  queryClient?.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SalesOrdersPage', () => {
  it('muestra el estado de carga mientras consulta las órdenes', async () => {
    let resolve: ((value: Response) => void) | undefined;
    handler = () =>
      new Promise<Response>((done) => {
        resolve = done;
      });
    mount();
    expect(await screen.findByText('Cargando órdenes de venta…')).toBeTruthy();
    resolve?.(response({ data: [order], meta: { page: 1, limit: 20, total: 1 } }));
    expect(await screen.findByText('OV-2026-000019')).toBeTruthy();
  });
  it.each(['ADMIN', 'VENTAS'] as const)('muestra la acción de nueva orden a %s', async (role) => {
    mount(role);
    expect(await screen.findByRole('link', { name: 'Nueva orden de venta' })).toBeTruthy();
    expect(await screen.findByText('OV-2026-000019')).toBeTruthy();
  });

  it.each(['COMPRAS', 'INVENTARIO', 'PRODUCCION'] as const)(
    'oculta la acción de nueva orden para el rol de solo lectura %s',
    async (role) => {
      mount(role);
      await screen.findByText('OV-2026-000019');
      expect(screen.queryByRole('link', { name: 'Nueva orden de venta' })).toBeNull();
    },
  );

  it('filtra por número y estado, pagina resultados y enlaza al detalle', async () => {
    mount();
    await screen.findByText('OV-2026-000019');
    fireEvent.change(screen.getByLabelText('Número de orden'), { target: { value: 'OV-2026' } });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'DRAFT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.searchParams.get('search') === 'OV-2026' &&
            url.searchParams.get('status') === 'DRAFT',
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/21 resultados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(requests.some((url) => url.searchParams.get('page') === '2')).toBe(true),
    );
    expect((await screen.findByRole('link', { name: 'OV-2026-000019' })).getAttribute('href')).toBe(
      '/sales/orders/' + order.id,
    );
  });

  it('muestra estado vacío y permite reintentar cuando falla la consulta', async () => {
    let attempts = 0;
    handler = () =>
      ++attempts === 1
        ? response({ message: 'Fallo' }, 500)
        : response({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    mount();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay órdenes de venta que coincidan.')).toBeTruthy();
  });
});
