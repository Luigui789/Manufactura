import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { OrderExecution } from './OrderExecution';
import { LotProductionDetail } from './LotProductionDetail';
import { BusinessReference } from '@/features/inventory/components/BusinessReference';
import type { ProductionOrder, OrderRequirements } from '../api/orders';

const ids = Array.from(
  { length: 5 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);
const product = {
  id: ids[1],
  code: 'ACEITE',
  name: 'Aceite',
  unit: 'KILOGRAM',
  type: 'RAW_MATERIAL',
  isActive: true,
  isLotTracked: true,
};
const order = {
  id: ids[0],
  quantityPlanned: '100.0000',
  warehouseId: ids[2],
  status: 'IN_PROGRESS',
} as ProductionOrder;
const requirements = {
  items: [{ product, required: '200.0000', available: '200.0000', shortage: '0.0000' }],
  canStart: true,
} as OrderRequirements;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const clients: ReturnType<typeof createAppQueryClient>[] = [];
function renderWithClient(node: React.ReactNode, role = 'PRODUCCION') {
  const client = createAppQueryClient();
  clients.push(client);
  client.setQueryData(SESSION_KEY, {
    id: 'actor',
    role,
    isActive: true,
    mustChangePassword: false,
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
  return client;
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost/api'));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('C-2 execution and inventory integration', () => {
  it('uses inventory filters/pagination and retains explicit allocations across pages', async () => {
    const requests: URL[] = [];
    let payload: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        requests.push(url);
        if (init?.method === 'POST') {
          payload = JSON.parse(String(init.body));
          return json({ data: {}, message: 'Completada' });
        }
        const page = Number(url.searchParams.get('page'));
        return json({
          data: [
            { id: page === 1 ? ids[3] : ids[4], code: 'LOT-' + page, quantityOnHand: '100.0000' },
          ],
          meta: { page, limit: 20, total: 21 },
        });
      }),
    );
    renderWithClient(<OrderExecution order={order} requirements={requirements} />);
    fireEvent.change(await screen.findByLabelText('Cantidad de LOT-1'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.change(await screen.findByLabelText('Cantidad de LOT-2'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByLabelText('Cantidad producida real'), { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar finalización' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar finalización' }));
    await waitFor(() =>
      expect(payload).toEqual({
        quantityProduced: '95',
        allocations: [
          {
            productId: ids[1],
            lots: [
              { lotId: ids[3], quantity: '100' },
              { lotId: ids[4], quantity: '100' },
            ],
          },
        ],
      }),
    );
    const lotRequests = requests.filter((url) => url.pathname.endsWith('/inventory/lots'));
    expect(lotRequests.slice(0, 2).map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
    for (const url of lotRequests) {
      expect(url.searchParams.get('productId')).toBe(ids[1]);
      expect(url.searchParams.get('warehouseId')).toBe(ids[2]);
      expect(url.searchParams.get('status')).toBe('RELEASED');
      expect(url.searchParams.get('hasStock')).toBe('true');
    }
    expect(requests.some((url) => url.pathname.includes('available-lots'))).toBe(false);
  });
  it('rejects inexact allocations before any mutation', async () => {
    const fetch = vi.fn(async () =>
      json({
        data: [{ id: ids[3], code: 'LOT-1', quantityOnHand: '200' }],
        meta: { page: 1, limit: 20, total: 1 },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    renderWithClient(<OrderExecution order={order} requirements={requirements} />);
    fireEvent.change(await screen.findByLabelText('Cantidad de LOT-1'), {
      target: { value: '199' },
    });
    expect(screen.getByText('Asignado: 199.0000 · Restante: 1.0000')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Revisar finalización' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: 'Completar producción' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Asigna exactamente 200.0000');
    expect(fetch.mock.calls).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Cantidad de LOT-1'), { target: { value: '201' } });
    expect(screen.getByText('Asignado: 201.0000 · Restante: -1.0000')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Revisar finalización' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('requires reviewing edited quantities again even when submitting with Enter', async () => {
    const fetch = vi.fn(async () => json({ data: {}, message: 'ok' }));
    vi.stubGlobal('fetch', fetch);
    renderWithClient(
      <OrderExecution order={order} requirements={{ ...requirements, items: [] }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revisar finalización' }));
    await screen.findByRole('button', { name: 'Confirmar finalización' });
    fireEvent.change(screen.getByLabelText('Cantidad producida real'), { target: { value: '95' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Completar producción' }));
    await screen.findByRole('button', { name: 'Confirmar finalización' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('shows backend stock conflicts and refreshes lot selection', async () => {
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init?: RequestInit) => {
        if (init?.method === 'POST')
          return json({ message: 'Existencia insuficiente para el lote indicado' }, 409);
        reads++;
        return json({
          data: [{ id: ids[3], code: 'LOT-1', quantityOnHand: '200' }],
          meta: { page: 1, limit: 20, total: 1 },
        });
      }),
    );
    renderWithClient(<OrderExecution order={order} requirements={requirements} />);
    fireEvent.change(await screen.findByLabelText('Cantidad de LOT-1'), {
      target: { value: '200' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar finalización' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar finalización' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Existencia insuficiente');
    await waitFor(() => expect(reads).toBe(2));
  });
  it('renders discriminated Purchase and Production references', () => {
    renderWithClient(
      <>
        <BusinessReference
          reference={{
            type: 'PURCHASE_RECEIPT',
            id: 'rec',
            number: 'REC-1',
            purchaseOrder: { id: 'oc', number: 'OC-1' },
          }}
        />
        <BusinessReference reference={{ type: 'PRODUCTION_ORDER', id: ids[0], number: 'OP-1' }} />
      </>,
    );
    expect(screen.getByText('REC-1').getAttribute('title')).toBe('OC-1');
    expect(screen.getByRole('link', { name: 'OP-1' }).getAttribute('href')).toBe(
      '/production/orders/' + ids[0],
    );
  });
});

describe('C-2 lot quality and traceability UI', () => {
  it('refreshes a concurrent inspection conflict and removes the stale form', async () => {
    let inspected = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          inspected = true;
          return json({ message: 'El lote ya tiene una inspección' }, 409);
        }
        if (new URL(input).pathname.endsWith('/inspection'))
          return json({
            data: inspected
              ? {
                  id: 'inspection',
                  result: 'APPROVED',
                  observations: 'Inspeccionado por otra persona',
                  inspectedAt: '2026-10-14T12:00:00Z',
                  inspectedBy: { id: 'other', fullName: 'Otro responsable' },
                }
              : null,
          });
        return json({ data: { rootLotId: ids[0], lots: [] } });
      }),
    );
    renderWithClient(<LotProductionDetail lotId={ids[0]} status="QUARANTINED" />);
    fireEvent.change(await screen.findByLabelText('Observaciones'), {
      target: { value: 'Revisión' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar inspección' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar inspección' }));
    expect(await screen.findByText('Inspeccionado por otra persona')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Inspeccionar lote' })).toBeNull();
  });
  function setup(role = 'PRODUCCION') {
    const mutations: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        if (init?.method === 'POST') {
          mutations.push(JSON.parse(String(init.body)));
          return json({ data: { id: 'inspection' } });
        }
        if (url.pathname.endsWith('/inspection')) return json({ data: null });
        return json({
          data: {
            rootLotId: ids[0],
            lots: [
              {
                id: ids[0],
                code: 'LOT-OUTPUT',
                product,
                origin: {
                  type: 'PRODUCTION_ORDER',
                  productionOrder: { id: ids[0], number: 'OP-1' },
                },
                consumptions: [],
              },
              {
                id: ids[3],
                code: 'LOT-PURCHASE',
                product,
                origin: {
                  type: 'PURCHASE_RECEIPT',
                  purchaseReceipt: { id: 'r', number: 'REC-1' },
                  purchaseOrder: { id: 'o', number: 'OC-1' },
                  supplier: { id: 's', code: 'SUP-1', name: 'Proveedor' },
                },
                consumptions: [],
              },
            ],
          },
        });
      }),
    );
    renderWithClient(<LotProductionDetail lotId={ids[0]} status="QUARANTINED" />, role);
    return mutations;
  }
  it('shows recursive origins to supplier and gives read-only roles no inspection form', async () => {
    setup('VENTAS');
    expect(await screen.findByText(/Proveedor: SUP-1 Proveedor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revisar inspección' })).toBeNull();
  });
  it('requires nonconformities for rejection and review again after editing observations', async () => {
    const mutations = setup();
    fireEvent.change(await screen.findByLabelText('Resultado'), { target: { value: 'REJECTED' } });
    fireEvent.change(screen.getByLabelText('Observaciones'), { target: { value: 'Inspección' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar inspección' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Describe las no conformidades',
    );
    fireEvent.change(screen.getByLabelText('No conformidades'), { target: { value: 'Defecto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar inspección' }));
    await screen.findByRole('button', { name: 'Confirmar inspección' });
    fireEvent.change(screen.getByLabelText('Observaciones'), {
      target: { value: 'Inspección revisada' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Inspeccionar lote' }));
    await screen.findByRole('button', { name: 'Confirmar inspección' });
    expect(mutations).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar inspección' }));
    await waitFor(() =>
      expect(mutations).toEqual([
        { result: 'REJECTED', observations: 'Inspección revisada', nonConformities: 'Defecto' },
      ]),
    );
  });
});
