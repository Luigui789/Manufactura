import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode } from '@/features/auth/types';
import { StockPage } from './StockPage';
import { MovementsPage } from './MovementsPage';
import { LotsPage } from './LotsPage';
import { AdjustmentDialog } from '../components/stock/AdjustmentDialog';

const product = {
  id: 'product',
  code: 'ACEITE',
  name: 'Aceite',
  unit: 'LITER',
  type: 'RAW_MATERIAL',
  isActive: true,
  isLotTracked: false,
  requiresQualityInspection: false,
};
const warehouse = { id: 'warehouse', code: 'ALM', name: 'Principal', isActive: true };
const instant = '2026-10-13T20:00:00Z';
const origin = {
  type: 'PURCHASE_RECEIPT',
  purchaseReceiptItemId: 'receipt-item',
  purchaseReceipt: { id: 'receipt', number: 'REC-2026-000012', receivedAt: instant },
  purchaseOrder: { id: 'order', number: 'OC-2026-000007' },
  supplier: { id: 'supplier', code: 'PROV-001', name: 'Proveedor Uno' },
};
const lot = {
  id: 'lot',
  code: 'LOT-2026-000001',
  product,
  status: 'RELEASED',
  expiresAt: '2026-10-14',
  originatedAt: instant,
  quantityOnHand: '7.2500',
  origin,
};
const movement = {
  id: 'movement',
  type: 'PURCHASE_RECEIPT',
  product,
  warehouse,
  lot,
  quantity: '7.2500',
  reason: null,
  occurredAt: instant,
  requestId: null,
  purchaseReceiptItemId: 'receipt-item',
  businessReference: {
    type: 'PURCHASE_RECEIPT',
    ...origin.purchaseReceipt,
    purchaseOrder: origin.purchaseOrder,
  },
  performedByUser: { id: 'actor', fullName: 'Compras Uno' },
};
const clients: ReturnType<typeof createAppQueryClient>[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function setup(
  options: {
    role?: RoleCode;
    empty?: boolean;
    fail?: boolean;
    tracked?: boolean;
    failAdjustment?: boolean;
    pending?: boolean;
    legacyOrigin?: boolean;
  } = {},
) {
  const client = createAppQueryClient();
  clients.push(client);
  const session = {
    id: 'actor',
    fullName: 'Actor',
    role: options.role ?? 'ADMIN',
    isActive: true,
    mustChangePassword: false,
  };
  client.setQueryData(SESSION_KEY, session);
  const requests: { url: URL; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const method = init?.method ?? 'GET';
      requests.push({
        url,
        method,
        body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
      });
      const path = url.pathname;
      if (path.endsWith('/auth/me')) return json({ data: session });
      const paginated = (data: unknown[]) =>
        json({
          data: options.empty ? [] : data,
          meta: {
            page: Number(url.searchParams.get('page') ?? 1),
            limit: 20,
            total: options.empty ? 0 : 40,
          },
        });
      if (path.endsWith('/products'))
        return paginated([{ ...product, isLotTracked: options.tracked ?? false }]);
      if (path.endsWith('/warehouses')) return paginated([warehouse]);
      if (path.endsWith('/adjustments'))
        return options.failAdjustment
          ? json({ message: 'Saldo insuficiente', code: 'INSUFFICIENT_STOCK' }, 409)
          : json({ data: movement, message: 'Ajuste registrado' }, 201);
      if (options.pending) return new Promise<Response>(() => {});
      if (options.fail) return json({ message: 'Consulta falló' }, 422);
      if (path.endsWith('/stock'))
        return paginated([
          { id: 'balance', product, warehouse, quantity: '7.2500', updatedAt: instant },
        ]);
      if (path.endsWith('/movements'))
        return paginated([
          movement,
          {
            ...movement,
            id: 'adjustment',
            type: 'ADJUSTMENT_IN',
            reason: 'INITIAL_LOAD',
            businessReference: null,
            purchaseReceiptItemId: null,
            lot: null,
          },
        ]);
      if (path.endsWith('/lots/lot'))
        return json({
          ...lot,
          origin: options.legacyOrigin ? null : origin,
          balances: [{ warehouse, quantity: '7.2500' }],
          movements: [movement],
        });
      if (path.endsWith('/lots'))
        return paginated([{ ...lot, origin: options.legacyOrigin ? null : origin }]);
      throw new Error('Unexpected request: ' + path);
    }),
  );
  const show = (node: React.ReactNode) =>
    render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return { client, requests, show };
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost/api'));
afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.unstubAllGlobals();
});

describe('StockPage', () => {
  it('loads, renders stock, filters and paginates', async () => {
    const { show, requests } = setup();
    show(<StockPage />);
    expect(screen.getByText('Cargando existencias…')).toBeTruthy();
    expect(await screen.findByText('ACEITE · Aceite')).toBeTruthy();
    expect(screen.getByText(/7.2500/)).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.url.pathname.endsWith('/stock') && r.url.searchParams.get('page') === '2',
        ),
      ).toBe(true),
    );
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'aceite' } });
    fireEvent.change(screen.getByLabelText('Almacén'), { target: { value: 'warehouse' } });
    fireEvent.click(screen.getByLabelText('Solo con existencia'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.url.searchParams.get('search') === 'aceite' &&
            r.url.searchParams.get('warehouseId') === 'warehouse' &&
            r.url.searchParams.get('hasStock') === 'true' &&
            r.url.searchParams.get('page') === '1',
        ),
      ).toBe(true),
    );
  });
  it.each(['ADMIN', 'INVENTARIO', 'COMPRAS', 'PRODUCCION', 'VENTAS'] as RoleCode[])(
    'only permits adjustment controls for authorized role %s',
    async (role) => {
      const { show } = setup({ role });
      show(<StockPage />);
      await screen.findByText('ACEITE · Aceite');
      expect(Boolean(screen.queryByRole('button', { name: 'Nuevo ajuste' }))).toBe(
        role === 'ADMIN' || role === 'INVENTARIO',
      );
    },
  );
  it('shows empty results', async () => {
    const { show } = setup({ empty: true });
    show(<StockPage />);
    expect(await screen.findByText(/No hay/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
describe('MovementsPage', () => {
  it('shows adjustment and purchase labels, REC and the purchase type filter', async () => {
    const { show, requests } = setup();
    show(<MovementsPage />);
    const table = await screen.findByRole('table', { name: 'Movimientos' });
    await waitFor(() => expect(within(table).getByText('Recepción de compra')).toBeTruthy());
    expect(within(table).getByText('Ajuste entrada')).toBeTruthy();
    expect(within(table).getByText('REC-2026-000012')).toBeTruthy();
    expect(within(table).getByText('INITIAL_LOAD')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'PURCHASE_RECEIPT' } });
    await waitFor(() =>
      expect(requests.some((r) => r.url.searchParams.get('type') === 'PURCHASE_RECEIPT')).toBe(
        true,
      ),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.url.pathname.endsWith('/movements') && r.url.searchParams.get('page') === '2',
        ),
      ).toBe(true),
    );
  });
  it('shows empty results', async () => {
    const { show } = setup({ empty: true });
    show(<MovementsPage />);
    expect(await screen.findByText('No hay movimientos para estos filtros.')).toBeTruthy();
  });
});
describe('LotsPage', () => {
  it('shows REC, OC, supplier and calendar expiry in list and detail', async () => {
    const { show, requests } = setup();
    show(<LotsPage />);
    expect(await screen.findByText('Recepción REC-2026-000012')).toBeTruthy();
    expect(screen.getByText('OC-2026-000007')).toBeTruthy();
    expect(screen.getByText('Proveedor: PROV-001 · Proveedor Uno')).toBeTruthy();
    expect(screen.getByText('14/10/2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    const detail = screen.getByRole('dialog');
    await waitFor(() => expect(within(detail).getByText('Recepción REC-2026-000012')).toBeTruthy());
    expect(within(detail).getByText('OC-2026-000007')).toBeTruthy();
    expect(within(detail).getByText(/14\/10\/2026/)).toBeTruthy();
    expect(within(detail).getByText(/ALM · Principal: 7.2500/)).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.url.pathname.endsWith('/lots') && r.url.searchParams.get('page') === '2',
        ),
      ).toBe(true),
    );
  });
  it('handles empty results', async () => {
    const { show } = setup({ empty: true });
    show(<LotsPage />);
    expect(await screen.findByText('No hay lotes para estos filtros.')).toBeTruthy();
  });
  it('handles nullable legacy origin safely', async () => {
    const { show } = setup({ legacyOrigin: true });
    show(<LotsPage />);
    expect(await screen.findByText('Sin origen de compra')).toBeTruthy();
  });
  it('retries a failed detail query', async () => {
    const options = { fail: false };
    const { show } = setup(options);
    show(<LotsPage />);
    await screen.findByText('Recepción REC-2026-000012');
    options.fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    const detail = screen.getByRole('dialog');
    await within(detail).findByText('Consulta falló');
    options.fail = false;
    fireEvent.click(within(detail).getByRole('button', { name: 'Reintentar' }));
    expect(await within(detail).findByText('Recepción REC-2026-000012')).toBeTruthy();
  });
});
describe('query errors and retries', () => {
  it.each([
    ['stock', StockPage],
    ['movements', MovementsPage],
    ['lots', LotsPage],
  ] as const)('retries a failed page %s', async (_name, Page) => {
    const options = { fail: true };
    const { show } = setup(options);
    show(<Page />);
    await screen.findByText('Consulta falló');
    options.fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByText('Consulta falló')).toBeNull());
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});
describe('AdjustmentDialog', () => {
  async function dialog(options: Parameters<typeof setup>[0] = {}) {
    const result = setup(options);
    const success = vi.fn();
    result.show(<AdjustmentDialog onClose={vi.fn()} onSuccess={success} />);
    await screen.findByRole('option', { name: 'ACEITE · Aceite' });
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'product' } });
    fireEvent.change(screen.getByLabelText('Almacén'), { target: { value: 'warehouse' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2.1250' } });
    return { ...result, success };
  }
  const submit = () =>
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar ajuste' }).closest('form')!);
  it('sends an untracked adjustment, no lot, and refreshes inventory caches', async () => {
    const { requests, client, success } = await dialog();
    client.setQueryData(['inventory', 'stock', 7], {});
    client.setQueryData(['lots', 'detail', 'old'], {});
    expect(screen.queryByLabelText('Lote')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Recepción de compra' })).toBeNull();
    submit();
    await waitFor(() => expect(success).toHaveBeenCalledWith('Ajuste registrado'));
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      productId: 'product',
      warehouseId: 'warehouse',
      type: 'ADJUSTMENT_IN',
      quantity: '2.1250',
      reason: 'INITIAL_LOAD',
    });
    expect(client.getQueryState(['inventory', 'stock', 7])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['lots', 'detail', 'old'])?.isInvalidated).toBe(true);
  });
  it('requires a lot for tracked products and sends the selected lot', async () => {
    const { requests, success } = await dialog({ tracked: true });
    await screen.findByRole('option', { name: /LOT-2026/ });
    submit();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Lote') as HTMLSelectElement).required).toBe(true);
    fireEvent.change(screen.getByLabelText('Lote'), { target: { value: 'lot' } });
    submit();
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({ lotId: 'lot' });
  });
  it.each(['0', '-1', '1e3', '1.00001', '100000000000000'])(
    'rejects invalid quantity %s before posting',
    async (quantity) => {
      const { requests } = await dialog();
      fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: quantity } });
      submit();
      expect(requests.some((r) => r.method === 'POST')).toBe(false);
      expect(screen.getByRole('alert')).toBeTruthy();
    },
  );
  it('shows a failed adjustment and retains input for correction', async () => {
    const { success } = await dialog({ failAdjustment: true });
    submit();
    expect(await screen.findByText('Saldo insuficiente')).toBeTruthy();
    expect(success).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Cantidad') as HTMLInputElement).value).toBe('2.1250');
    expect(
      (screen.getByRole('button', { name: 'Guardar ajuste' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
