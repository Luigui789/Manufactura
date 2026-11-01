import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { HomePage } from '@/routes/HomePage';
import { AppRoutes } from '@/routes/AppRoutes';
import { navigation } from '@/layouts/navigation';
import { ROLE_CODES } from '@/features/auth/types';
import { commercialActivity } from './commercial-activity';
import { compatibleHomePeriods, defaultHomePeriod, homePeriodError } from './period';
import { account, dashboardResponse, fixtures, paths, period, response } from './test/fixtures';

function mount(role = account.role, route = false) {
  const client = createAppQueryClient();
  client.setQueryData(SESSION_KEY, { ...account, role });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>{route ? <AppRoutes /> : <HomePage />}</MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
function stub(source = fixtures()) {
  const fetch = vi.fn(
    async (url: string) => dashboardResponse(url, source) ?? response({ data: account }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const region = (name: string) => within(screen.getByRole('region', { name }));
function metric(module: string, label: string, value: string) {
  const term = region(module).getByText(label);
  expect(term.nextElementSibling?.textContent).toBe(value);
}
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T05:59:59Z'));
});
afterEach(() => vi.useRealTimers());

describe('D6 Home composition', () => {
  it('keeps welcome, role and Inicio at / while rendering five independent sources and sustainability', async () => {
    const fetch = stub();
    mount('COMPRAS', true);
    expect(
      await screen.findByRole('heading', { name: 'Bienvenido, Persona EcoSoap' }),
    ).toBeTruthy();
    expect(screen.getByText('Resumen operativo de EcoSoap · Compras')).toBeTruthy();
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
    for (const module of [
      'Producción',
      'Inventario',
      'Compras',
      'Ventas',
      'Calidad',
      'Sostenibilidad',
    ])
      expect(screen.getByRole('region', { name: module })).toBeTruthy();
    const menu = within(screen.getByRole('navigation', { name: 'Menú principal' }));
    expect(menu.getByRole('link', { name: 'Inicio' }).getAttribute('href')).toBe('/');
    expect(navigation.filter((n) => n.to === '/')).toHaveLength(1);
    expect(screen.queryByText('General · Dashboard')).toBeNull();
    expect(fetch.mock.calls.filter(([url]) => /dashboard/.test(url))).toHaveLength(5);
  });
  it('uses one Managua calendar period for all five requests even after UTC/local midnight on refresh', async () => {
    const fetch = stub();
    mount();
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
    for (const path of paths)
      expect(fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api${path}?from=2026-10-03&to=2026-11-01`,
        expect.anything(),
      );
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-10-03');
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-11-01');
    vi.setSystemTime(new Date('2026-11-02T06:00:01Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(10));
    expect(fetch.mock.calls.every(([url]) => url.includes('from=2026-10-03&to=2026-11-01'))).toBe(
      true,
    );
  });
  it('applies only valid common dates to all five dashboards on submit', async () => {
    const fetch = stub();
    mount();
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
    expect(fetch).toHaveBeenCalledTimes(5);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(10));
    expect(
      fetch.mock.calls.slice(5).every(([url]) => url.includes('from=2026-09-01&to=2026-09-30')),
    ).toBe(true);
    expect(
      fetch.mock.calls.every(([url]) => !/productId|warehouseId|supplierId|customerId/.test(url)),
    ).toBe(true);
  });
  it.each([
    ['', '2026-11-01', 'Ingresá fechas válidas'],
    ['2026-11-02', '2026-11-01', 'Desde no puede ser posterior'],
    ['2025-01-01', '2026-11-01', 'no puede superar 366'],
  ])(
    'does not dispatch invalid range %s–%s and retains the last valid data',
    async (from, to, error) => {
      const fetch = stub();
      mount();
      await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: from } });
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: to } });
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
      expect(screen.getByRole('alert').textContent).toContain(error);
      expect(fetch).toHaveBeenCalledTimes(5);
      metric('Producción', 'Órdenes de producción', '8');
    },
  );
  it('renders only native-domain counts and exact Decimal strings without combined money, physical stock or production', async () => {
    stub();
    mount();
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
    metric('Producción', 'Órdenes de producción', '8');
    metric('Producción', 'Completadas', '4');
    metric('Producción', 'En proceso', '2');
    metric('Inventario', 'Posiciones con existencia', '11');
    metric('Inventario', 'Lotes con existencia', '7');
    metric('Inventario', 'Lotes liberados', '4');
    metric('Compras', 'Pendientes de recepción', '6');
    metric('Compras', 'Órdenes vencidas', '2');
    metric('Compras', 'Órdenes del período', '9');
    metric('Compras', 'Recepciones', '4');
    metric('Compras', 'Valor comprometido', '1234.56');
    metric('Ventas', 'Pendientes de despacho', '5');
    metric('Ventas', 'Órdenes del período', '10');
    metric('Ventas', 'Despachos', '8');
    metric('Ventas', 'Valor confirmado', '9876.54');
    metric('Calidad', 'Pendientes de inspección', '3');
    metric('Calidad', 'Rechazados sin disposición', '1');
    metric('Calidad', 'Marcados para reproceso', '2');
    metric('Calidad', 'Tasa de aprobación', '80.00%');
    metric('Calidad', 'Disposiciones de descarte', '1');
    expect(document.body.textContent).not.toMatch(
      /C\$|\b(?:NIO|USD)\b|11111\.10|Stock total|Producción total|totalOperations|globalHealthScore|ERPScore|OEE|margen|beneficio|huella corporativa|académic|Aviso metodológico/i,
    );
    expect(screen.getByRole('link', { name: 'Ver sostenibilidad' }).getAttribute('href')).toBe(
      '/sustainability',
    );
    expect(screen.getByText('Huella parcial de carbono y circularidad')).toBeTruthy();
    expect(screen.queryByText(/kg CO2e/)).toBeNull();
  });
  it('keeps all six attention metrics separate and links each domain', async () => {
    stub();
    mount();
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
    const attention = region('Requieren atención');
    for (const [label, count, path] of [
      ['Compras · Pendientes de recepción', '6', '/purchases/dashboard'],
      ['Compras · Vencidas', '2', '/purchases/dashboard'],
      ['Ventas · Pendientes de despacho', '5', '/sales/dashboard'],
      ['Calidad · Pendientes de inspección', '3', '/quality/dashboard'],
      ['Calidad · Rechazados sin disposición', '1', '/quality/dashboard'],
      ['Calidad · Marcados para reproceso', '2', '/quality/dashboard'],
    ]) {
      const link = attention.getByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe(path);
      expect(link.closest('dt')?.nextElementSibling?.textContent).toBe(count);
    }
    expect(attention.getAllByRole('definition')).toHaveLength(6);
    for (const [name, path] of [
      ['producción', '/production/dashboard'],
      ['inventario', '/inventory/dashboard'],
      ['compras', '/purchases/dashboard'],
      ['ventas', '/sales/dashboard'],
      ['calidad', '/quality/dashboard'],
    ])
      expect(
        screen.getByRole('link', { name: `Ver dashboard de ${name}` }).getAttribute('href'),
      ).toBe(path);
  });
  it('shows null approval as a dash, with zeros preserved', async () => {
    const d = fixtures();
    d.quality.inspections = { total: 0, approved: 0, rejected: 0, approvalRatePct: null };
    stub(d);
    mount();
    await waitFor(() => metric('Calidad', 'Tasa de aprobación', '—'));
    metric('Calidad', 'Inspecciones', '0');
    expect(screen.queryByText('0.00%')).toBeNull();
  });
  it('does not block successful modules, header, filters and links while Sales is loading', async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/sales/dashboard')
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(dashboardResponse(url)!),
      ),
    );
    mount();
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
    expect(region('Ventas').getByRole('status').textContent).toBe('Cargando ventas…');
    metric('Producción', 'Completadas', '4');
    metric('Compras', 'Recepciones', '4');
    metric('Inventario', 'Lotes liberados', '4');
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeTruthy();
    finish(response({ data: fixtures().sales }));
    await waitFor(() => metric('Ventas', 'Despachos', '8'));
  });
  it('isolates a Sales failure and retries only Sales', async () => {
    let failed = true;
    const fetch = vi.fn(async (url: string) =>
      url.includes('/sales/dashboard') && failed
        ? response({ message: 'Ventas no disponible' }, 500)
        : dashboardResponse(url)!,
    );
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(await region('Ventas').findByText('Error interno del servidor')).toBeTruthy();
    metric('Producción', 'Completadas', '4');
    metric('Compras', 'Recepciones', '4');
    metric('Inventario', 'Lotes liberados', '4');
    metric('Calidad', 'Inspecciones', '5');
    failed = false;
    fireEvent.click(region('Ventas').getByRole('button', { name: 'Reintentar ventas' }));
    await waitFor(() => metric('Ventas', 'Despachos', '8'));
    expect(fetch.mock.calls.filter(([url]) => url.includes('/sales/dashboard'))).toHaveLength(2);
    for (const path of paths.filter((p) => p !== '/sales/dashboard'))
      expect(
        fetch.mock.calls.filter(([url]) => new URL(url).pathname === '/api' + path),
      ).toHaveLength(1);
  });
  it('keeps loading and retry independent for Quality as well', async () => {
    let failed = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/production/quality/dashboard') && failed
          ? response({ message: 'Error' }, 500)
          : dashboardResponse(url)!,
      ),
    );
    mount();
    expect(
      await region('Calidad').findByRole('button', { name: 'Reintentar calidad' }),
    ).toBeTruthy();
    metric('Ventas', 'Despachos', '8');
    failed = false;
    fireEvent.click(region('Calidad').getByRole('button', { name: 'Reintentar calidad' }));
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
  });
  it('renders commercial and quality chart alternatives without coupling to SVG internals', async () => {
    stub();
    mount();
    const commercial = await screen.findByRole('table', {
      name: 'Actividad comercial',
      hidden: true,
    });
    expect(within(commercial).getByText('Órdenes de compra')).toBeTruthy();
    expect(within(commercial).getByText('Órdenes de venta')).toBeTruthy();
    const cells = within(commercial).getAllByRole('row', { hidden: true })[1].textContent;
    expect(cells).toBe('2026-10-0394108');
    const quality = screen.getByRole('table', { name: 'Inspecciones de calidad', hidden: true });
    expect(within(quality).getAllByRole('row', { hidden: true })[1].textContent).toBe(
      '2026-10-0341',
    );
    expect(screen.getByRole('img', { name: 'Actividad comercial' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Inspecciones de calidad' })).toBeTruthy();
  });
  it.each(['from', 'to', 'timeZone', 'granularity'] as const)(
    'reports incompatible %s explicitly and refuses a mixed commercial chart',
    async (key) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (!url.includes('/sales/dashboard')) return dashboardResponse(url)!;
          const sales = fixtures().sales;
          sales.period = { ...sales.period, [key]: key === 'granularity' ? 'week' : 'wrong' };
          return response({ data: sales });
        }),
      );
      mount();
      expect(await screen.findByText(/Los dashboards devolvieron períodos/)).toBeTruthy();
      expect(screen.queryByRole('img', { name: 'Actividad comercial' })).toBeNull();
      metric('Calidad', 'Inspecciones', '5');
    },
  );
  it.each(ROLE_CODES)('preserves account access shortcuts for %s', async (role) => {
    stub();
    mount(role);
    await waitFor(() => metric('Calidad', 'Inspecciones', '5'));
    const access = within(
      screen.getByRole('heading', { name: 'Accesos de tu cuenta' }).parentElement!,
    );
    expect(!!access.queryByRole('link', { name: 'Abrir usuarios' })).toBe(role === 'ADMIN');
    expect(
      access.getByRole('link', { name: 'Abrir producción · dashboard' }).getAttribute('href'),
    ).toBe('/production/dashboard');
  });
});

describe('Home calendar and visual composition helpers', () => {
  it('uses Managua on both sides of local midnight, including a year boundary', () => {
    expect(defaultHomePeriod(new Date('2026-11-02T05:59:59Z'))).toEqual({
      from: '2026-10-03',
      to: '2026-11-01',
    });
    expect(defaultHomePeriod(new Date('2026-11-02T06:00:00Z'))).toEqual({
      from: '2026-10-04',
      to: '2026-11-02',
    });
    expect(defaultHomePeriod(new Date('2027-01-01T05:00:00Z'))).toEqual({
      from: '2026-12-02',
      to: '2026-12-31',
    });
  });
  it.each(['2026-02-30', 'invalid', '0000-01-01', '2026-1-01'])(
    'rejects invalid calendar date %s',
    (from) => expect(homePeriodError({ from, to: '2026-11-01' })).toBeTruthy(),
  );
  it('accepts leap-day and 366 inclusive days and rejects 367 days', () => {
    expect(homePeriodError({ from: '2024-01-01', to: '2024-12-31' })).toBeNull();
    expect(homePeriodError({ from: '2024-02-29', to: '2024-03-01' })).toBeNull();
    expect(homePeriodError({ from: '2024-01-01', to: '2025-01-01' })).toContain('366');
  });
  it('joins commercial series by period, handles disjoint rows and preserves four distinct counts', () => {
    const d = fixtures();
    d.purchases.activityByPeriod = [
      { period: '2026-10-04', orders: 2, receipts: 3 },
      { period: '2026-10-03', orders: 1, receipts: 0 },
    ];
    d.sales.activityByPeriod = [
      { period: '2026-10-05', orders: 4, dispatches: 5 },
      { period: '2026-10-04', orders: 6, dispatches: 7 },
    ];
    expect(commercialActivity(d.purchases, d.sales, period)).toEqual([
      { period: '2026-10-03', purchaseOrders: 1, receipts: 0, saleOrders: 0, dispatches: 0 },
      { period: '2026-10-04', purchaseOrders: 2, receipts: 3, saleOrders: 6, dispatches: 7 },
      { period: '2026-10-05', purchaseOrders: 0, receipts: 0, saleOrders: 4, dispatches: 5 },
    ]);
    expect(compatibleHomePeriods([period, { ...period, granularity: 'week' }], period)).toBe(false);
    expect(
      commercialActivity(
        d.purchases,
        { ...d.sales, period: { ...period, granularity: 'week' } },
        period,
      ),
    ).toBeNull();
  });
});
