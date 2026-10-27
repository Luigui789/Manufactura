import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { SessionUser } from '@/features/auth/types';
import { SaleOrderDetailPage } from './SaleOrderDetailPage';

const user: SessionUser = {
  id: 'sales-user',
  email: 'sales@example.test',
  fullName: 'Ventas',
  role: 'VENTAS',
  isActive: true,
  mustChangePassword: false,
  createdAt: '',
  updatedAt: '',
};
const order = {
  id: '00000000-0000-4000-8000-000000000019',
  number: 'OV-2026-000019',
  status: 'DRAFT',
  orderedAt: '2026-10-26T12:00:00.000Z',
  total: '12.00',
  itemsCount: 1,
  customer: { id: '00000000-0000-4000-8000-000000000001', code: 'CLI-01', name: 'Cliente Alfa' },
  items: [
    {
      id: 'item-1',
      productId: '00000000-0000-4000-8000-000000000002',
      productCode: 'PT-01',
      productName: 'Jabón',
      productUnit: 'UNIT',
      isLotTracked: false,
      quantity: '2.0000',
      unitPrice: '6.0000',
      lineTotal: '12.00',
      availableQuantity: '5.0000',
    },
  ],
  createdAt: '',
  updatedAt: '',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
let queryClient: ReturnType<typeof createAppQueryClient>;
let current = { ...order };
let requests: { url: URL; method: string }[];
let failCancel = false;
function mount(role: SessionUser['role'] = 'VENTAS') {
  queryClient = createAppQueryClient();
  queryClient.setQueryData(SESSION_KEY, { ...user, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sales/orders/' + order.id]}>
        <Routes>
          <Route path="/sales/orders/:id" element={<SaleOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  current = { ...order };
  requests = [];
  failCancel = false;
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost',
      );
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      if (url.pathname.endsWith('/confirm')) current = { ...current, status: 'CONFIRMED' };
      if (url.pathname.endsWith('/cancel')) {
        if (failCancel) return response({ message: 'No se pudo cancelar' }, 500);
        current = { ...current, status: 'CANCELLED' };
      }
      return response({ data: current });
    }),
  );
});
afterEach(() => {
  cleanup();
  queryClient?.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SaleOrderDetailPage', () => {
  it('DRAFT confirma solo tras mostrar el aviso y actualiza el estado', async () => {
    mount();
    await screen.findByText('PT-01 · Jabón');
    expect(screen.getByRole('button', { name: 'Editar borrador' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByText(/no reservará inventario/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, confirmar orden' }));
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.url.pathname.endsWith('/confirm') && request.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText(
        'Pendiente de despacho. El inventario no está reservado y se validará nuevamente al despachar.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar orden' })).toBeTruthy();
  });

  it('confirma cancelación y oculta acciones tras la transición', async () => {
    mount();
    await screen.findByText('PT-01 · Jabón');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar orden' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, cancelar' }));
    await waitFor(() =>
      expect(requests.some((request) => request.url.pathname.endsWith('/cancel'))).toBe(true),
    );
    expect(await screen.findByText('Orden cancelada.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
  });

  it('maneja focus, doble submit y error al cancelar', async () => {
    mount();
    await screen.findByText('PT-01 · Jabón');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar orden' }));
    const confirmButton = await screen.findByRole('button', { name: 'Sí, cancelar' });
    expect(document.activeElement).toBe(confirmButton);
    failCancel = true;
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    expect(await screen.findByText(/Error interno del servidor/)).toBeTruthy();
    expect(requests.filter((request) => request.url.pathname.endsWith('/cancel'))).toHaveLength(1);
    expect(current.status).toBe('DRAFT');
    failCancel = false;
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    const notice = await screen.findByText('Orden cancelada.');
    await waitFor(() => expect(document.activeElement).toBe(notice.parentElement?.parentElement));
  });

  it('CONFIRMED muestra pendiente de despacho y solo permite cancelar', async () => {
    current = { ...current, status: 'CONFIRMED' };
    mount();
    expect(await screen.findByText(/Pendiente de despacho/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar orden' })).toBeTruthy();
  });

  it.each(['COMPRAS', 'INVENTARIO', 'PRODUCCION'] as const)(
    'no ofrece mutaciones al rol %s',
    async (role) => {
      mount(role);
      await screen.findByText('PT-01 · Jabón');
      expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
    },
  );

  it('CANCELLED no muestra acciones mutables', async () => {
    current = { ...current, status: 'CANCELLED' };
    mount();
    await screen.findByText('Cancelada');
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
  });
});
