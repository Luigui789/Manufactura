import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { AppRoutes } from '@/routes/AppRoutes';
import { navigation } from '@/layouts/navigation';
import { CatalogPicker } from '@/components/CatalogPicker';
import { QualityDashboardPage } from './QualityDashboardPage';
import type { QualityDashboard } from '../api/quality-dashboard';

const product = { id: 'p1', code: 'INT-1', name: 'Intermedio inactivo' };
const order = { id: 'o1', number: 'OP-2026-000001' };
const dashboard: QualityDashboard = {
  period: { from: '2026-10-01', to: '2026-10-03', timeZone: 'America/Managua', granularity: 'day' },
  selectedProduct: null,
  current: { pendingInspection: 3, rejectedAwaitingDisposition: 2, rework: 1 },
  inspections: { total: 4, approved: 1, rejected: 3, approvalRatePct: '25.00' },
  dispositions: { total: 3, release: 1, rework: 1, scrap: 1 },
  inspectionsByPeriod: [{ period: '2026-10-01', approved: 1, rejected: 3 }],
  dispositionsByPeriod: [{ period: '2026-10-01', release: 1, rework: 1, scrap: 1 }],
  attention: [
    {
      kind: 'REJECTED_AWAITING_DISPOSITION',
      lot: { id: 'l1', code: 'LOT-R' },
      product,
      productionOrder: order,
      since: '2026-10-01T12:00:00Z',
    },
    {
      kind: 'PENDING_INSPECTION',
      lot: { id: 'l2', code: 'LOT-P' },
      product,
      productionOrder: order,
      since: '2026-10-01T12:00:00Z',
    },
  ],
  recentInspections: [
    {
      id: 'i1',
      result: 'REJECTED',
      inspectedAt: '2026-10-01T12:00:00Z',
      lot: { id: 'l3', code: 'LOT-REL', status: 'RELEASED' },
      product,
      productionOrder: order,
      inspectedBy: { id: 'u1', fullName: 'Inspectora D5' },
      disposition: { type: 'RELEASE', decidedAt: '2026-11-01T12:00:00Z' },
    },
    {
      id: 'i2',
      result: 'REJECTED',
      inspectedAt: '2026-10-01T12:00:00Z',
      lot: { id: 'l4', code: 'LOT-REW', status: 'REWORK' },
      product,
      productionOrder: order,
      inspectedBy: { id: 'u1', fullName: 'Inspectora D5' },
      disposition: { type: 'REWORK', decidedAt: '2026-10-01T12:00:00Z' },
    },
    {
      id: 'i3',
      result: 'REJECTED',
      inspectedAt: '2026-10-01T12:00:00Z',
      lot: { id: 'l5', code: 'LOT-SCR', status: 'SCRAPPED' },
      product,
      productionOrder: order,
      inspectedBy: { id: 'u1', fullName: 'Inspectora D5' },
      disposition: { type: 'SCRAP', decidedAt: '2026-10-01T12:00:00Z' },
    },
    {
      id: 'i4',
      result: 'APPROVED',
      inspectedAt: '2026-10-01T12:00:00Z',
      lot: { id: 'l6', code: 'LOT-APP', status: 'RELEASED' },
      product,
      productionOrder: order,
      inspectedBy: { id: 'u1', fullName: 'Inspectora D5' },
      disposition: null,
    },
  ],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const catalog = () =>
  response({
    data: [{ ...product, type: 'INTERMEDIATE', isActive: false, unit: 'UNIT' }],
    meta: { page: 1, limit: 20, total: 1 },
  });
function mount() {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <QualityDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function stub(d = dashboard) {
  const fetch = vi.fn(async (url: string) =>
    url.includes('/products?') ? catalog() : response({ data: d }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('QualityDashboardPage', () => {
  it('shows loading then separate current queues, period metrics and accessible charts', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/products?')
          ? Promise.resolve(catalog())
          : new Promise<Response>((done) => {
              resolve = done;
            }),
      ),
    );
    mount();
    expect(screen.getByText('Cargando dashboard de calidad…')).toBeTruthy();
    resolve(response({ data: dashboard }));
    await screen.findByText('Pendientes de inspección');
    for (const label of [
      'Estado actual',
      'Actividad del período',
      'Rechazados sin disposición',
      'Lotes marcados para reproceso',
      'Inspecciones',
      'Aprobadas',
      'Rechazadas',
      'Tasa de aprobación',
      'Disposiciones',
    ])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText('25.00%')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Aprobadas vs rechazadas por período' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Disposiciones por período' })).toBeTruthy();
    const table = screen.getByRole('table', {
      name: 'Aprobadas vs rechazadas por período',
      hidden: true,
    });
    expect(within(table).getByText('2026-10-01')).toBeTruthy();
  });
  it('preserves rejected result with RELEASE, REWORK and SCRAP context and links lot and OP', async () => {
    stub();
    mount();
    const table = await screen.findByRole('table', { name: 'Inspecciones recientes del período' });
    for (const [code, label] of [
      ['LOT-REL', 'Liberación excepcional'],
      ['LOT-REW', 'Reproceso'],
      ['LOT-SCR', 'Descarte'],
    ]) {
      const row = within(table).getByRole('link', { name: code }).closest('tr')!;
      expect(within(row).getByText('Rechazada')).toBeTruthy();
      expect(within(row).getByText(new RegExp(label + ' ·'))).toBeTruthy();
    }
    expect(within(table).getByText('Aprobada')).toBeTruthy();
    expect(within(table).getAllByText('Liberado')).toHaveLength(2);
    expect(within(table).getByText('Descartado')).toBeTruthy();
    expect(within(table).getAllByText('Inspectora D5')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'LOT-REL' }).getAttribute('href')).toBe(
      '/inventory/lots?lotId=l3',
    );
    expect(
      screen
        .getAllByRole('link', { name: order.number })
        .every((a) => a.getAttribute('href') === '/production/orders/o1'),
    ).toBe(true);
    const attention = screen.getByRole('table', { name: 'Cola actual de calidad' });
    expect(within(attention).getByText('Rechazado sin disposición')).toBeTruthy();
    expect(within(attention).getByText('Pendiente de inspección')).toBeTruthy();
    expect(within(attention).getByRole('link', { name: 'LOT-P' }).getAttribute('href')).toBe(
      '/inventory/lots?lotId=l2',
    );
  });
  it('shows an error and retries', async () => {
    let failed = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/products?')
          ? catalog()
          : failed
            ? response({ message: 'No disponible' }, 500)
            : response({ data: dashboard }),
      ),
    );
    mount();
    expect(await screen.findByText('Error interno del servidor')).toBeTruthy();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Pendientes de inspección')).toBeTruthy();
  });
  it('shows zero/null empty period with independent current attention', async () => {
    stub({
      ...dashboard,
      inspections: { total: 0, approved: 0, rejected: 0, approvalRatePct: null },
      dispositions: { total: 0, release: 0, rework: 0, scrap: 0 },
      inspectionsByPeriod: [],
      dispositionsByPeriod: [],
      recentInspections: [],
    });
    mount();
    expect(await screen.findByText('Sin actividad de calidad en este período.')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0.00%')).toBeNull();
    expect(screen.getByRole('link', { name: 'LOT-R' })).toBeTruthy();
    expect(screen.getByText('No hay inspecciones en este período.')).toBeTruthy();
  });
  it('shows empty attention and an actual 0% rate', async () => {
    stub({
      ...dashboard,
      current: { pendingInspection: 0, rejectedAwaitingDisposition: 0, rework: 0 },
      inspections: { total: 1, approved: 0, rejected: 1, approvalRatePct: '0.00' },
      attention: [],
    });
    mount();
    expect(await screen.findByText('0.00%')).toBeTruthy();
    expect(screen.getByText('No hay lotes pendientes de atención.')).toBeTruthy();
  });
  it('applies date filters on submit', async () => {
    const fetch = stub();
    mount();
    await screen.findByText('Pendientes de inspección');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
    expect(fetch.mock.calls.some(([url]) => url.includes('from='))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('from=2026-09-01&to=2026-09-30'),
        expect.anything(),
      ),
    );
  });
  it('selects an inactive INTERMEDIATE without forcing type or active filters and clears selection', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('/products?')
        ? catalog()
        : response({
            data: { ...dashboard, selectedProduct: url.includes('productId=') ? product : null },
          }),
    );
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText('Pendientes de inspección');
    fireEvent.click(screen.getByText('Producto: Todos'));
    fireEvent.click(await screen.findByRole('button', { name: 'INT-1 · Intermedio inactivo' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('productId=p1'),
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Producto: INT-1 · Intermedio inactivo')).toBeTruthy();
    expect(
      fetch.mock.calls
        .filter(([url]) => url.includes('/products?'))
        .every(([url]) => !url.includes('isActive=') && !url.includes('type=')),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Producto: Todos')).toBeTruthy();
  });
  it('preserves active-only and type defaults for existing product writer forms', async () => {
    const fetch = vi.fn().mockResolvedValue(catalog());
    vi.stubGlobal('fetch', fetch);
    render(
      <QueryClientProvider client={createAppQueryClient()}>
        <CatalogPicker kind="product" value="" onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByText('No hay producto disponibles en esta página.');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('isActive=true'), expect.anything());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('type=RAW_MATERIAL'),
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'INT-1 · Intermedio inactivo' })).toBeNull();
  });
  it('places quality in operations after production for all authenticated roles', () => {
    const i = navigation.findIndex((row) => row.to === '/quality/dashboard');
    expect(navigation[i]).toMatchObject({
      label: 'Resumen',
      module: 'Calidad',
      group: 'Operaciones',
    });
    expect(navigation[i].roles).toEqual(
      navigation.find((row) => row.to === '/production/orders')?.roles,
    );
    expect(i).toBeGreaterThan(navigation.findIndex((row) => row.to === '/production/orders'));
    expect(i).toBeLessThan(navigation.findIndex((row) => row.group === 'Análisis'));
  });
  it('opens authenticated route for COMPRAS', async () => {
    stub();
    const client = createAppQueryClient();
    client.setQueryData(SESSION_KEY, {
      id: 'u1',
      email: 'test@example.test',
      fullName: 'Prueba',
      role: 'COMPRAS',
      isActive: true,
      mustChangePassword: false,
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/quality/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard de calidad' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Calidad · Resumen' }).getAttribute('href')).toBe(
      '/quality/dashboard',
    );
    await screen.findByText('Pendientes de inspección');
  });
});
