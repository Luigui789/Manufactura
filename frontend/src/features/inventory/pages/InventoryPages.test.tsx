import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode } from '@/features/auth/types';
import { StockPage } from './StockPage';
import { MovementsPage } from './MovementsPage';
import { LotsPage } from './LotsPage';
import { AdjustmentDialog } from '../components/stock/AdjustmentDialog';
import { InventoryEntityPicker } from '../components/InventoryEntityPicker';

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
    pendingAdjustment?: boolean;
    extraProduct?: boolean;
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
      const paginated = (data: unknown[], total = 40) =>
        json({
          data: options.empty ? [] : data,
          meta: {
            page: Number(url.searchParams.get('page') ?? 1),
            limit: 20,
            total: options.empty ? 0 : total,
          },
        });
      if (path.endsWith('/products')) {
        const products = [
          { ...product, isLotTracked: options.tracked ?? false },
          ...(options.extraProduct
            ? [{ ...product, id: 'second-product', code: 'SOSA', name: 'Sosa' }]
            : []),
        ].filter((entry) =>
          (entry.code + ' ' + entry.name)
            .toLowerCase()
            .includes((url.searchParams.get('search') ?? '').toLowerCase()),
        );
        return paginated(products, products.length);
      }
      if (path.endsWith('/warehouses')) return paginated([warehouse], 1);
      if (path.endsWith('/adjustments')) {
        if (options.pendingAdjustment) return new Promise<Response>(() => {});
        return options.failAdjustment
          ? json({ message: 'Saldo insuficiente', code: 'INSUFFICIENT_STOCK' }, 409)
          : json({ data: movement, message: 'Ajuste registrado' }, 201);
      }
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
          {
            ...movement,
            id: 'out-adjustment',
            type: 'ADJUSTMENT_OUT',
            quantity: '-1.2500',
            reason: 'DAMAGE',
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
  const show = (node: React.ReactNode, path = '/inventory/lots') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={client}>{node}</QueryClientProvider>
      </MemoryRouter>,
    );
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
    fireEvent.click(screen.getByRole('button', { name: 'Almacén: Todos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar ALM · Principal' }));
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
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull();
    expect(screen.getByText('0 resultados')).toBeTruthy();
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
    expect(within(table).getByText('Carga inicial')).toBeTruthy();
    expect(within(table).getByText('Daño')).toBeTruthy();
    expect(within(table).getAllByText('+7.2500 Litro')).toHaveLength(2);
    expect(within(table).getByText('-1.2500 Litro')).toBeTruthy();
    expect(
      within(table)
        .getByRole('link', { name: /REC-2026-000012/ })
        .getAttribute('href'),
    ).toBe('/purchases/orders/order');
    expect(within(table).getByRole('link', { name: 'LOT-2026-000001' }).getAttribute('href')).toBe(
      '/inventory/lots?lotId=lot',
    );
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
  it('muestra etiquetas humanas de estado de lote en el selector', async () => {
    const { show } = setup();
    show(
      <InventoryEntityPicker
        kind="lot"
        value=""
        onChange={() => undefined}
        lotFilters={{ status: 'RELEASED' }}
      />,
    );
    expect(await screen.findByText(/Liberado/)).toBeTruthy();
    expect(screen.queryByText(/RELEASED/)).toBeNull();
  });

  it('opens the exact output lot linked from a production order', async () => {
    const { show, requests } = setup();
    show(<LotsPage />, '/inventory/lots?lotId=lot');
    const detail = await screen.findByRole('dialog');
    expect(await within(detail).findByText('Recepción REC-2026-000012')).toBeTruthy();
    expect(requests.some((request) => request.url.pathname.endsWith('/lots/lot'))).toBe(true);
  });
  it('shows REC, OC, supplier and calendar expiry in list and detail', async () => {
    const { show, requests } = setup();
    show(<LotsPage />);
    expect(await screen.findByText('Recepción REC-2026-000012')).toBeTruthy();
    expect(screen.getByText('OC-2026-000007')).toBeTruthy();
    expect(screen.getByText('Proveedor: PROV-001 · Proveedor Uno')).toBeTruthy();
    expect(screen.getByText('14/10/2026')).toBeTruthy();
    const opener = screen.getByRole('button', { name: 'Ver' });
    opener.focus();
    fireEvent.click(opener);
    const detail = screen.getByRole('dialog');
    await waitFor(() => expect(within(detail).getByText('Recepción REC-2026-000012')).toBeTruthy());
    expect(within(detail).getByText('OC-2026-000007')).toBeTruthy();
    expect(within(detail).getByText(/14\/10\/2026/)).toBeTruthy();
    expect(within(detail).getByRole('heading', { name: 'LOT-2026-000001' })).toBeTruthy();
    expect(within(detail).getByText('Liberado')).toBeTruthy();
    const balances = within(detail).getByRole('table', { name: 'Existencia del lote por almacén' });
    expect(within(balances).getByRole('cell', { name: 'ALM · Principal' })).toBeTruthy();
    expect(within(balances).getByRole('cell', { name: '7.2500' })).toBeTruthy();
    expect(within(balances).getByRole('cell', { name: 'Litro' })).toBeTruthy();
    expect(within(detail).getByRole('table', { name: 'Movimientos del lote' })).toBeTruthy();
    expect(within(detail).getByText('+7.2500')).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
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
    expect(await screen.findByText('Sin origen empresarial')).toBeTruthy();
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
    const close = vi.fn();
    result.show(<AdjustmentDialog onClose={close} onSuccess={success} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar ACEITE · Aceite' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar ALM · Principal' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad' }), {
      target: { value: '2.1250' },
    });
    return { ...result, success, close };
  }
  const submit = () =>
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar ajuste' }).closest('form')!);
  it('sends an untracked adjustment, no lot, and refreshes inventory caches', async () => {
    const { requests, client, success } = await dialog();
    client.setQueryData(['inventory', 'stock', 7], {});
    client.setQueryData(['lots', 'detail', 'old'], {});
    expect(screen.queryByRole('group', { name: 'Lote' })).toBeNull();
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
    const selectLot = await screen.findByRole('button', { name: /Seleccionar LOT-2026/ });
    submit();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lote requerido' })).toBeTruthy();
    expect(screen.getByText('Seleccioná un lote para este producto.')).toBeTruthy();
    fireEvent.click(selectLot);
    submit();
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({ lotId: 'lot' });
  });
  it('searches and changes the product without retaining an unrelated lot', async () => {
    const { requests, success } = await dialog({ tracked: true, extraProduct: true });
    fireEvent.click(await screen.findByRole('button', { name: /Seleccionar LOT-2026/ }));
    expect(screen.getByText('Lote seleccionado')).toBeTruthy();
    const picker = screen.getByRole('group', { name: 'Producto' });
    expect(within(picker).getByText('Producto seleccionado')).toBeTruthy();
    expect(
      within(picker).queryByRole('button', { name: 'Seleccionar ACEITE · Aceite' }),
    ).toBeNull();
    fireEvent.click(within(picker).getByRole('button', { name: 'Cambiar' }));
    fireEvent.change(within(picker).getByLabelText('Buscar producto'), {
      target: { value: 'sosa' },
    });
    fireEvent.click(await within(picker).findByRole('button', { name: 'Seleccionar SOSA · Sosa' }));
    expect(
      requests.some(
        (request) =>
          request.url.pathname.endsWith('/products') &&
          request.url.searchParams.get('search') === 'sosa' &&
          request.url.searchParams.get('isActive') === 'true',
      ),
    ).toBe(true);
    expect(screen.queryByRole('group', { name: 'Lote' })).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Cantidad' }) as HTMLInputElement).value).toBe(
      '2.1250',
    );
    submit();
    await waitFor(() => expect(success).toHaveBeenCalledWith('Ajuste registrado'));
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
      productId: 'second-product',
      warehouseId: 'warehouse',
      type: 'ADJUSTMENT_IN',
      quantity: '2.1250',
      reason: 'INITIAL_LOAD',
    });
  });
  it('preserves lot filters for entry and exit and clears the lot when the type changes', async () => {
    const { requests } = await dialog({ tracked: true });
    await screen.findByRole('button', { name: /Seleccionar LOT-2026/ });
    expect(
      requests.some(
        (request) =>
          request.url.pathname.endsWith('/lots') &&
          request.url.searchParams.get('productId') === 'product' &&
          !request.url.searchParams.has('warehouseId') &&
          !request.url.searchParams.has('hasStock'),
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'ADJUSTMENT_OUT' } });
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.url.pathname.endsWith('/lots') &&
            request.url.searchParams.get('productId') === 'product' &&
            request.url.searchParams.get('warehouseId') === 'warehouse' &&
            request.url.searchParams.get('hasStock') === 'true',
        ),
      ).toBe(true),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Seleccionar LOT-2026/ }));
    expect(screen.getByText('Lote seleccionado')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'ADJUSTMENT_IN' } });
    expect(screen.queryByText('Lote seleccionado')).toBeNull();
    submit();
    expect(screen.getByText('Seleccioná un lote para este producto.')).toBeTruthy();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);
  });
  it('cancels without posting and restores focus to the adjustment action', async () => {
    const { show, requests } = setup();
    show(<StockPage />);
    const opener = await screen.findByRole('button', { name: 'Nuevo ajuste' });
    opener.focus();
    fireEvent.click(opener);
    const modal = await screen.findByRole('dialog', { name: 'Nuevo ajuste' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(requests.some((request) => request.method === 'POST')).toBe(false);
  });
  it('prevents duplicate submit and closing while an adjustment is pending', async () => {
    const { requests, success, close } = await dialog({ pendingAdjustment: true });
    submit();
    const saving = await screen.findByRole('button', { name: 'Guardando…' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('textbox', { name: 'Cantidad' }).matches(':disabled')).toBe(true);
    fireEvent.submit(saving.closest('form')!);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Nuevo ajuste' })).toBeTruthy();
    expect(success).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1e3', '1.00001', '100000000000000'])(
    'rejects invalid quantity %s before posting',
    async (quantity) => {
      const { requests } = await dialog();
      fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad' }), {
        target: { value: quantity },
      });
      submit();
      expect(requests.some((r) => r.method === 'POST')).toBe(false);
      expect(screen.getByRole('alert')).toBeTruthy();
    },
  );
  it('shows a failed adjustment and retains input for correction', async () => {
    const options = { failAdjustment: true };
    const { requests, success } = await dialog(options);
    submit();
    expect(await screen.findByText('Saldo insuficiente')).toBeTruthy();
    expect(success).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', { name: 'Cantidad' }) as HTMLInputElement).value).toBe(
      '2.1250',
    );
    expect(
      (screen.getByRole('button', { name: 'Guardar ajuste' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    options.failAdjustment = false;
    submit();
    await waitFor(() => expect(success).toHaveBeenCalledWith('Ajuste registrado'));
    expect(
      requests.filter((request) => request.method === 'POST').map((request) => request.body),
    ).toEqual([
      {
        productId: 'product',
        warehouseId: 'warehouse',
        type: 'ADJUSTMENT_IN',
        quantity: '2.1250',
        reason: 'INITIAL_LOAD',
      },
      {
        productId: 'product',
        warehouseId: 'warehouse',
        type: 'ADJUSTMENT_IN',
        quantity: '2.1250',
        reason: 'INITIAL_LOAD',
      },
    ]);
  });
});
