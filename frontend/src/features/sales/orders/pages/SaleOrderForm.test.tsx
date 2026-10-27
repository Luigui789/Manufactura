import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '@/app/query-client';
import { SaleOrderForm } from '../components/SaleOrderForm';
import type { SaleOrderValues } from '../api/sales-orders';

const customer = (id: string, code: string, name: string) => ({
  id,
  code,
  name,
  isActive: true,
});
const product = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'PT-JABON',
  name: 'Jabón ecológico',
  type: 'FINISHED_GOOD',
  unit: 'LITER',
  isActive: true,
  isLotTracked: true,
  requiresQualityInspection: false,
};
const firstCustomer = customer('00000000-0000-4000-8000-000000000001', 'CLI-01', 'Cliente Alfa');
const secondCustomer = customer('00000000-0000-4000-8000-000000000003', 'CLI-02', 'Cliente Beta');
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const clients: ReturnType<typeof createAppQueryClient>[] = [];
let handler: (url: URL) => Response | Promise<Response>;
function page(data: unknown[], pageNumber: number, total: number) {
  return response({ data, meta: { page: pageNumber, limit: 20, total } });
}
function setup(options: { onSubmit?: (value: SaleOrderValues) => void; pending?: boolean } = {}) {
  const query = createAppQueryClient();
  clients.push(query);
  query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost',
      );
      return handler(url);
    }),
  );
  const submit = options.onSubmit ?? vi.fn();
  render(
    <QueryClientProvider client={query}>
      <SaleOrderForm
        initial={{ customerId: '', items: [{ productId: '', quantity: '', unitPrice: '0' }] }}
        pending={options.pending ?? false}
        error={null}
        onSubmit={submit}
      />
    </QueryClientProvider>,
  );
  return submit;
}
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  handler = (url) => {
    if (url.pathname.endsWith('/customers')) {
      const matches = url.searchParams.get('search')?.includes('CLI') ? [firstCustomer] : [];
      return page(matches, Number(url.searchParams.get('page') ?? 1), matches.length);
    }
    if (url.pathname.endsWith('/products')) {
      const matches = url.searchParams.get('search') ? [product] : [];
      return page(matches, Number(url.searchParams.get('page') ?? 1), matches.length);
    }
    return response({ message: 'No encontrado' }, 404);
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const query of clients) query.clear();
  clients.length = 0;
});

describe('Formulario de órdenes de venta', () => {
  it('busca y selecciona cliente y producto activo, mostrando sus detalles y el total exacto', async () => {
    const submit = setup();
    fireEvent.change(await screen.findByLabelText('Buscar cliente'), {
      target: { value: 'CLI-01' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'CLI-01 · Cliente Alfa' }));
    expect(await screen.findByText('CLI-01 · Cliente Alfa')).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Buscar producto'), {
      target: { value: 'PT-JABON' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'PT-JABON · Jabón ecológico' }));
    expect(await screen.findByText('Seguimiento por lote: Sí')).toBeTruthy();
    const requested = vi.mocked(fetch).mock.calls.map(([input]) => {
      const value =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return new URL(value, 'http://localhost');
    });
    expect(
      requested.some(
        (url) =>
          url.pathname.endsWith('/customers') &&
          url.searchParams.get('search') === 'CLI-01' &&
          url.searchParams.get('isActive') === 'true',
      ),
    ).toBe(true);
    expect(
      requested.some(
        (url) =>
          url.pathname.endsWith('/products') &&
          url.searchParams.get('search') === 'PT-JABON' &&
          url.searchParams.get('type') === 'FINISHED_GOOD' &&
          url.searchParams.get('isActive') === 'true' &&
          url.searchParams.get('limit') !== '100',
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Precio unitario'), { target: { value: '1.235' } });
    expect(screen.getByText('Total estimado: 3.09')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        customerId: firstCustomer.id,
        items: [{ productId: product.id, quantity: '2.5', unitPrice: '1.235' }],
      }),
    );
    expect(screen.getByText(/no reserva inventario/i)).toBeTruthy();
  });

  it('permite buscar después de la primera página y seleccionar un producto remoto', async () => {
    handler = (url) => {
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      if (url.pathname.endsWith('/customers')) return page([firstCustomer], pageNumber, 1);
      if (url.pathname.endsWith('/products')) {
        if (url.searchParams.get('search') === 'PT-REMOTO')
          return page([{ ...product, code: 'PT-REMOTO' }], pageNumber, 1);
        return page([], pageNumber, 21);
      }
      return response({}, 404);
    };
    setup();
    fireEvent.change(await screen.findByLabelText('Buscar cliente'), { target: { value: 'CLI' } });
    fireEvent.click(await screen.findByRole('button', { name: 'CLI-01 · Cliente Alfa' }));
    const search = await screen.findByLabelText('Buscar producto');
    await screen.findByText('Página 1 de 2 · 21 resultados');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 2 · 21 resultados');
    fireEvent.change(search, { target: { value: 'PT-REMOTO' } });
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map(([input]) => {
        const value =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        return new URL(value, 'http://localhost');
      });
      expect(
        calls.some(
          (url) =>
            url.pathname.endsWith('/products') && url.searchParams.get('search') === 'PT-REMOTO',
        ),
      ).toBe(true);
    });
    expect(await screen.findByText('Seguimiento por lote: Sí')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'PT-REMOTO · Jabón ecológico' }));
    const productRequests = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => {
        const value =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        return new URL(value, 'http://localhost');
      })
      .filter((url) => url.pathname.endsWith('/products'));
    expect(productRequests.some((url) => url.searchParams.get('page') === '2')).toBe(true);
    expect(productRequests.some((url) => url.searchParams.get('search') === 'PT-REMOTO')).toBe(
      true,
    );
    expect(screen.getByText('PT-REMOTO · Jabón ecológico')).toBeTruthy();
  });

  it('muestra loading y estado vacío al consultar clientes', async () => {
    let resolve: ((value: Response) => void) | undefined;
    handler = (url) =>
      url.pathname.endsWith('/customers')
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : page([], 1, 0);
    setup();
    expect(await screen.findByText('Cargando cliente…')).toBeTruthy();
    resolve?.(page([], 1, 0));
    expect(await screen.findByText('No hay cliente disponibles en esta página.')).toBeTruthy();
  });

  it('muestra loading, vacío y error del selector de productos, y permite reintentar', async () => {
    let resolveInitial: ((value: Response) => void) | undefined;
    let failSearch = true;
    handler = (url) => {
      if (url.pathname.endsWith('/customers')) return page([firstCustomer], 1, 1);
      if (!url.pathname.endsWith('/products')) return response({}, 404);
      if (!url.searchParams.get('search'))
        return new Promise<Response>((done) => {
          resolveInitial = done;
        });
      if (failSearch) return response({ message: 'Fallo del catálogo' }, 500);
      return page([product], 1, 1);
    };
    setup();
    expect(await screen.findByText('Cargando producto…')).toBeTruthy();
    resolveInitial?.(page([], 1, 0));
    expect(await screen.findByText('No hay producto disponibles en esta página.')).toBeTruthy();

    const search = await screen.findByLabelText('Buscar producto');
    fireEvent.change(search, { target: { value: 'PT-JABON' } });
    const retry = await screen.findByRole('button', { name: 'Reintentar catálogo' });
    failSearch = false;
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'PT-JABON · Jabón ecológico' })).toBeTruthy();
  });

  it('permite reintentar un error del catálogo y cambiar el cliente elegido', async () => {
    let fail = true;
    handler = (url) => {
      if (!url.pathname.endsWith('/customers')) return page([], 1, 0);
      if (fail) return response({ message: 'Fallo del catálogo' }, 500);
      const matches =
        url.searchParams.get('search') === 'CLI-02' ? [secondCustomer] : [firstCustomer];
      return page(matches, Number(url.searchParams.get('page') ?? 1), matches.length);
    };
    setup();
    expect(await screen.findByRole('button', { name: 'Reintentar catálogo' })).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar catálogo' }));
    fireEvent.change(await screen.findByLabelText('Buscar cliente'), {
      target: { value: 'CLI-01' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'CLI-01 · Cliente Alfa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    fireEvent.change(await screen.findByLabelText('Buscar cliente'), {
      target: { value: 'CLI-02' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'CLI-02 · Cliente Beta' }));
    expect(await screen.findByText('CLI-02 · Cliente Beta')).toBeTruthy();
  });

  it('deshabilita los selectores mientras se envía el formulario', async () => {
    handler = (url) =>
      url.pathname.endsWith('/customers') ? page([firstCustomer], 1, 1) : page([product], 1, 1);
    setup({ pending: true });
    expect(await screen.findByRole('button', { name: 'CLI-01 · Cliente Alfa' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByLabelText('Buscar cliente')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Guardando…' })).toHaveProperty('disabled', true);
  });

  it('no permite guardar sin cliente, producto o cantidades válidas', async () => {
    setup();
    await screen.findByLabelText('Buscar cliente');
    expect(screen.getByRole('button', { name: 'Guardar borrador' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
