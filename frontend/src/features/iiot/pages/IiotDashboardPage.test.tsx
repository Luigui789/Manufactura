import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IiotDashboardPage } from './IiotDashboardPage';
import { TelemetryChart } from '../components/TelemetryChart';
import { monitoringKeys } from '../api/monitoring';
import { monitoringDate } from '../presentation';
import { alert, overview, page, reading, response } from '../test/fixtures';
import type { IiotOverview } from '../types';

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 288,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 288,
    toJSON: () => ({}),
  });
  vi.stubEnv('VITE_API_URL', 'http://localhost/api');
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clients.splice(0).forEach((client) => client.clear());
});
function setup({
  summary = overview(),
  fail = '',
  pending = false,
}: { summary?: IiotOverview; fail?: string; pending?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  let failing = fail;
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (pending) return new Promise<Response>(() => {});
    if (failing && url.pathname.endsWith('/' + failing))
      return response(
        { message: failing === 'overview' ? 'Orden no encontrada' : 'Consulta no disponible' },
        failing === 'overview' ? 404 : 503,
      );
    if (url.pathname.endsWith('/overview')) return response({ data: summary });
    if (url.pathname.endsWith('/readings')) {
      const metric = url.searchParams.get('metric') === 'HUMIDITY' ? 'HUMIDITY' : 'TEMPERATURE';
      return response(
        page([
          reading(metric),
          reading(metric, {
            id: 'older-' + metric,
            value: '25.0000',
            recordedAt: '2026-10-30T16:30:00.000Z',
          }),
        ]),
      );
    }
    const alerts = [
      alert(),
      alert('CRITICAL'),
      alert('CRITICAL', { id: 'without-reading', message: 'Alerta sin lectura', reading: null }),
    ];
    return response(
      page(
        alerts.filter(
          (value) =>
            !url.searchParams.get('severity') ||
            value.severity === url.searchParams.get('severity'),
        ),
      ),
    );
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/production/orders/order/iiot']}>
        <Routes>
          <Route path="/production/orders/:id/iiot" element={<IiotDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    client,
    fetch,
    recover: () => {
      failing = '';
    },
  };
}
async function settled() {
  await screen.findByText('Alerta sin lectura');
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Actualizar' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
}
it('shows an initial loading state without invented metrics', () => {
  setup({ pending: true });
  expect(screen.getByText('Cargando monitoreo IIoT…')).toBeTruthy();
  expect(screen.queryByText('27.2500')).toBeNull();
});
it('shows overview counts from aggregates, latest values, devices, Managua seconds and refresh time', async () => {
  const { client } = setup();
  await settled();
  expect(screen.getByRole('heading', { name: 'Monitoreo IIoT · OP-000001' })).toBeTruthy();
  expect(screen.getByText('SOAP-01 · Jabón')).toBeTruthy();
  for (const [label, count] of [
    ['Total de lecturas', 240],
    ['Alertas WARNING', 10],
    ['Alertas CRITICAL', 4],
    ['Alertas sin reconocer', 13],
  ]) {
    expect(screen.getByText(label).closest('div')?.querySelector('dd')?.textContent).toBe(
      String(count),
    );
  }
  const temperature = screen
    .getByRole('heading', { name: 'Temperatura', level: 3 })
    .closest('article')!;
  expect(temperature.textContent).toContain('27.2500 °C');
  expect(temperature.textContent).toContain('CURING-01');
  expect(temperature.textContent).toContain('10:35:21');
  expect(temperature.textContent).toContain('10:35:22');
  const time = client.getQueryState(monitoringKeys.overview('order'))!.dataUpdatedAt;
  expect(
    screen.getByText('Última actualización del resumen · Managua').nextElementSibling?.textContent,
  ).toBe(monitoringDate(new Date(time).toISOString()));
});
it('selects the canonical first metric and requests a different history on selection', async () => {
  const { fetch, client } = setup();
  await settled();
  const selector = screen.getByLabelText('Métrica') as HTMLSelectElement;
  expect(selector.value).toBe('TEMPERATURE');
  expect(Array.from(selector.options).map((item) => item.value)).toEqual([
    'TEMPERATURE',
    'HUMIDITY',
  ]);
  const original = client.getQueryData(monitoringKeys.readings('order', { metric: 'TEMPERATURE' }));
  fireEvent.change(selector, { target: { value: 'HUMIDITY' } });
  await screen.findByRole('heading', { name: 'Histórico · Humedad' });
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => url.endsWith('/readings?metric=HUMIDITY&limit=100')),
    ).toBe(true),
  );
  expect(await screen.findByText(/Último valor: 61.5000 %/)).toBeTruthy();
  expect(client.getQueryData(monitoringKeys.readings('order', { metric: 'TEMPERATURE' }))).toEqual(
    original,
  );
});
it('renders WARNING, CRITICAL and null reading safely in a semantic table', async () => {
  setup();
  await settled();
  const table = screen.getByRole('table', { name: /Alertas recientes/ });
  expect(within(table).getByText('Advertencia')).toBeTruthy();
  expect(within(table).getAllByText('Crítica')).toHaveLength(2);
  const row = within(table).getByText('Alerta sin lectura').closest('tr')!;
  expect(within(row).getAllByText('—')).toHaveLength(3);
  expect(within(table).getAllByText('27.2500 °C')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /Reconocer/ })).toBeNull();
});
it.each(['WARNING', 'CRITICAL'])('filters %s on the server', async (severity) => {
  const { fetch } = setup();
  await settled();
  fireEvent.change(screen.getByLabelText('Severidad'), { target: { value: severity } });
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => url.endsWith('/alerts?limit=20&severity=' + severity)),
    ).toBe(true),
  );
  const table = await screen.findByRole('table', { name: /Alertas recientes/ });
  await waitFor(() =>
    expect(
      within(table).queryByText(
        'Temperatura fuera del umbral ' + (severity === 'WARNING' ? 'CRITICAL' : 'WARNING'),
      ),
    ).toBeNull(),
  );
});
it('does not fetch or render an unnecessary chart without telemetry', async () => {
  const summary = overview();
  summary.telemetry = { totalReadings: 0, latestByMetric: [], lastReadingAt: null };
  const { fetch } = setup({ summary });
  expect(await screen.findByText('Todavía no hay telemetría para esta orden.')).toBeTruthy();
  await settled();
  expect(screen.queryByLabelText('Métrica')).toBeNull();
  expect(fetch.mock.calls.some(([url]) => url.includes('/readings'))).toBe(false);
});
it.each(['COMPLETED', 'DRAFT', 'CANCELLED'] as const)(
  'keeps %s accessible through the URL without continuous polling',
  async (status) => {
    setup({ summary: overview(status) });
    await settled();
    expect(screen.getByText('Detenida')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Gráfica histórica de Temperatura' })).toBeTruthy();
    if (status === 'COMPLETED')
      expect(screen.getByText(/Orden completada. El histórico/)).toBeTruthy();
  },
);
it.each(['readings', 'alerts'])(
  'isolates a %s error and allows retrying all sections manually',
  async (fail) => {
    const { fetch, recover } = setup({ fail });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Total de lecturas')).toBeTruthy();
    if (fail === 'readings') expect(await screen.findByText('Alerta sin lectura')).toBeTruthy();
    else
      expect(
        await screen.findByRole('group', { name: 'Gráfica histórica de Temperatura' }),
      ).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Actualizar' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    recover();
    const count = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await settled();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fetch.mock.calls.length).toBe(count + 3);
  },
);
it('explains overview 404, offers a return link and does not query dependent sections', async () => {
  const { fetch } = setup({ fail: 'overview' });
  expect(await screen.findByText('Orden no encontrada')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Volver a órdenes de producción' }).getAttribute('href'),
  ).toBe('/production/orders');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('refreshes all sections without a page reload and retains metrics while refreshing', async () => {
  const { fetch } = setup();
  await settled();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const implementation = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (url) => {
    await gate;
    return implementation(url);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  expect(await screen.findByRole('button', { name: 'Actualizando…' })).toBeTruthy();
  expect(screen.getByText('Total de lecturas')).toBeTruthy();
  await act(async () => {
    release();
  });
  await settled();
  expect(fetch).toHaveBeenCalledTimes(6);
});
it('draws at most 100 chronological points without mutating the source and retains exact decimals in its fallback', () => {
  const readings = Object.freeze(
    Array.from({ length: 105 }, (_, index) =>
      reading('TEMPERATURE', {
        id: String(index),
        value: index + '.2500',
        recordedAt: new Date(Date.UTC(2026, 9, 30, 16, 0, 105 - index)).toISOString(),
      }),
    ),
  );
  render(
    <TelemetryChart
      metric="TEMPERATURE"
      readings={readings as unknown as ReturnType<typeof reading>[]}
    />,
  );
  fireEvent.click(screen.getByText('Ver lecturas en tabla'));
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(100);
  expect(rows[0].textContent).toContain('99.2500');
  expect(rows.at(-1)?.textContent).toContain('0.2500');
  expect(readings[0].id).toBe('0');
  expect(document.querySelectorAll('.recharts-line-curve')).toHaveLength(1);
});
