import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { QueryClientProvider } from '@tanstack/react-query';

import { MemoryRouter } from 'react-router';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';

import { RoutesPage } from './RoutesPage';

import { RouteDetailPage } from './RouteDetailPage';

import { NewRoutePage } from './NewRoutePage';

import type { RoleCode, SessionUser } from '@/features/auth/types';

const product = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'PT-JABON',
  name: 'Jabón',
  type: 'FINISHED_GOOD',
  unit: 'UNIT',
  isActive: true,
  isLotTracked: false,
};

const route = {
  id: 'route',
  code: 'RT-JABON',
  name: 'Ruta jabón',
  productId: product.id,
  product,
  isActive: true,
  description: 'Estándar',
  operationCount: 2,
  totalStandardMinutes: '21615.00',
  operations: [
    { id: 'b', sequence: 30, name: 'Curado', standardMinutes: '21600.00' },
    { id: 'a', sequence: 10, name: 'Mezclado', standardMinutes: '15.00' },
  ],
};

const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const clients: ReturnType<typeof createAppQueryClient>[] = [];

function mount(
  page: 'list' | 'detail' | 'new',
  role: RoleCode = 'ADMIN',
  handler?: (url: string, options?: RequestInit) => Promise<Response>,
) {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  const client = createAppQueryClient();
  clients.push(client);

  client.setQueryData(SESSION_KEY, { id: 'actor', role, mustChangePassword: false } as SessionUser);

  const fetch = vi.fn(
    handler ??
      (async (url: string) =>
        response(
          url.includes('/products')
            ? { data: [product], meta: { page: 1, limit: 20, total: 1 } }
            : page === 'list'
              ? { data: [route], meta: { page: 1, limit: 20, total: 1 } }
              : { data: route },
        )),
  );

  vi.stubGlobal('fetch', fetch);

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {page === 'list' ? <RoutesPage /> : page === 'new' ? <NewRoutePage /> : <RouteDetailPage />}
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return fetch;
}

afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

describe('Production routes UI', () => {
  it('shows loading', () => {
    mount('list', 'ADMIN', () => new Promise(() => {}));
    expect(screen.getByText('Cargando rutas…')).toBeTruthy();
  });

  it('shows list, duration and filters', async () => {
    const fetch = mount('list');
    expect(await screen.findByText('RT-JABON')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Buscar ruta o producto'), {
      target: { value: 'jabón' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes('search=jab%C3%B3n'))).toBe(true),
    );

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'inactive' } });

    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes('isActive=false'))).toBe(true),
    );
  });

  it('shows empty and error states', async () => {
    mount('list', 'VENTAS', async () =>
      response({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
    );

    expect(await screen.findByText('No hay rutas de producción configuradas.')).toBeTruthy();
    expect(screen.queryByText('Crear ruta')).toBeNull();
  });

  it('offers retry on failure', async () => {
    mount('list', 'ADMIN', async () => response({ message: 'Error de prueba' }, 500));
    expect(await screen.findByText('Error interno del servidor')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  it.each(['ADMIN', 'PRODUCCION'] as const)('allows %s to manage', async (role) => {
    const fetch = mount('detail', role);
    expect(await screen.findByText('Editar datos')).toBeTruthy();

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1].textContent).toContain('Mezclado');
    expect(rows[2].textContent).toContain('Curado');
    expect(rows[2].textContent).toContain('15 días');

    fireEvent.click(screen.getByText('Desactivar'));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([, o]) => o?.method === 'PATCH' && o.body === '{"isActive":false}'),
      ).toBe(true),
    );

    fireEvent.click(screen.getByText('Editar datos'));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo nombre' } });
    fireEvent.click(screen.getByText('Guardar datos'));

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([, o]) => o?.method === 'PATCH' && String(o.body).includes('Nuevo nombre'),
        ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByText('Editar operaciones'));
    fireEvent.change(screen.getByLabelText('Minutos estándar 1'), { target: { value: '20.00' } });
    fireEvent.click(screen.getByText('Guardar operaciones'));

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([, o]) => o?.method === 'PUT' && String(o.body).includes('20.00')),
      ).toBe(true),
    );
  });

  it('read-only users can inspect but cannot mutate', async () => {
    mount('detail', 'VENTAS');
    expect(await screen.findByText('Ruta jabón')).toBeTruthy();
    for (const label of ['Editar datos', 'Editar operaciones', 'Activar', 'Desactivar'])
      expect(screen.queryByText(label)).toBeNull();
  });

  it('creates with a non-lot-tracked product, adds/removes operations and validates duplicate sequence', async () => {
    const fetch = mount('new');
    expect(await screen.findByText('Jabón')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Seleccionar/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear ruta' }));
    expect(await screen.findByText('Introduce un código')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'rt-1' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ruta nueva' } });
    fireEvent.change(screen.getByLabelText('Operación 1'), { target: { value: 'Mezclado' } });
    fireEvent.change(screen.getByLabelText('Minutos estándar 1'), { target: { value: '15.00' } });

    fireEvent.click(screen.getByText('Agregar operación'));
    fireEvent.change(screen.getByLabelText('Secuencia 2'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear ruta' }));
    expect(await screen.findByText('La secuencia no puede repetirse')).toBeTruthy();

    fireEvent.click(screen.getByText('Quitar operación 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear ruta' }));

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([, o]) => o?.method === 'POST' && String(o.body).includes('RT-1')),
      ).toBe(true),
    );
  });
});
