import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '@/app/query-client';
import { SaleOrderForm } from '../components/SaleOrderForm';
import type { SaleOrderValues } from '../api/sales-orders';

const client = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'CLI-01',
  name: 'Cliente de prueba',
  isActive: true,
};
const product = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'JAB-01',
  name: 'Jabón terminado',
  type: 'FINISHED_GOOD',
  unit: 'UNIT',
  isActive: true,
  isLotTracked: false,
  requiresQualityInspection: false,
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const clients: ReturnType<typeof createAppQueryClient>[] = [];
function setup(onSubmit: (value: SaleOrderValues) => void = vi.fn()) {
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
      if (url.pathname.endsWith('/customers'))
        return response({ data: [client], meta: { page: 1, limit: 100, total: 1 } });
      if (url.pathname.endsWith('/products'))
        return response({ data: [product], meta: { page: 1, limit: 100, total: 1 } });
      return response({ message: 'No encontrado' }, 404);
    }),
  );
  render(
    <QueryClientProvider client={query}>
      <SaleOrderForm
        initial={{ customerId: '', items: [{ productId: '', quantity: '', unitPrice: '0' }] }}
        pending={false}
        error={null}
        onSubmit={onSubmit}
      />
    </QueryClientProvider>,
  );
  return onSubmit;
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const query of clients) query.clear();
  clients.length = 0;
});

describe('Formulario de órdenes de venta', () => {
  it('elige cliente y producto terminado, conserva decimales exactos y muestra total estimado', async () => {
    const submit = setup();
    const customerSelect = await screen.findByLabelText('Cliente');
    const productSelect = await screen.findByLabelText('Producto terminado');
    fireEvent.change(customerSelect, { target: { value: client.id } });
    fireEvent.change(productSelect, { target: { value: product.id } });
    const quantity = screen.getByLabelText('Cantidad');
    const price = screen.getByLabelText('Precio unitario');
    fireEvent.change(quantity, { target: { value: '2.5' } });
    fireEvent.change(price, { target: { value: '1.235' } });
    expect(screen.getByText('Total estimado: 3.09')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        customerId: client.id,
        items: [{ productId: product.id, quantity: '2.5', unitPrice: '1.235' }],
      }),
    );
    expect(screen.getByText(/no reserva inventario/i)).toBeTruthy();
  });
  it('no permite guardar sin cliente, producto o cantidades válidas', async () => {
    setup();
    await screen.findByLabelText('Cliente');
    expect(screen.getByRole('button', { name: 'Guardar borrador' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
