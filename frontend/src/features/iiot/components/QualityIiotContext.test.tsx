import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { LotProductionDetail } from '@/features/production/components/LotProductionDetail';
import { monitoringDate } from '../presentation';
import { alert, overview, page, response } from '../test/fixtures';
import type { IiotOverview } from '../types';

const clients: ReturnType<typeof createAppQueryClient>[] = [];
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost/api'));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup({
  summary = overview('COMPLETED'),
  fail = '',
  pending = false,
  inspected = false,
  role = 'PRODUCCION',
}: {
  summary?: IiotOverview;
  fail?: string;
  pending?: boolean;
  inspected?: boolean;
  role?: string;
} = {}) {
  const client = createAppQueryClient();
  clients.push(client);
  client.setQueryData(SESSION_KEY, {
    id: 'actor',
    role,
    isActive: true,
    mustChangePassword: false,
  });
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    if (init?.method === 'POST') return response({ data: { id: 'inspection' } }, 201);
    if (path.includes('/iiot/')) {
      if (pending) return new Promise<Response>(() => {});
      if (path.endsWith('/' + fail)) return response({ message: 'IIoT no disponible' }, 503);
      if (path.endsWith('/overview')) return response({ data: summary });
      return response(
        page(
          summary.alerts.total
            ? [
                alert('CRITICAL', { reading: null }),
                ...Array.from({ length: 7 }, (_, i) => alert('WARNING', { id: String(i) })),
              ]
            : [],
        ),
      );
    }
    if (path.endsWith('/inspection'))
      return response({
        data: inspected
          ? {
              id: 'inspection',
              result: 'APPROVED',
              observations: 'Revisión humana registrada',
              nonConformities: 'Detalle histórico',
              inspectedAt: '2026-10-30T18:00:00Z',
              inspectedBy: { id: 'actor', fullName: 'Inspectora' },
            }
          : null,
      });
    return response({ data: { rootLotId: 'lot', lots: [] } });
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <LotProductionDetail
          lotId="lot"
          status={inspected ? 'RELEASED' : 'QUARANTINED'}
          productionOrderId="order"
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return fetch;
}

it('shows compact historical evidence before inspection, overview counts, precise metrics and nullable alerts', async () => {
  setup();
  const panel = await screen.findByRole('region', { name: 'Contexto IIoT de producción' });
  await screen.findByText('Se registraron 4 alertas críticas durante la producción.', {
    exact: false,
  });
  for (const [label, count] of [
    ['Total de lecturas', '240'],
    ['Alertas WARNING', '10'],
    ['Alertas CRITICAL', '4'],
    ['Total de alertas', '14'],
  ]) {
    expect(within(panel).getByText(label).nextElementSibling?.textContent).toBe(count);
  }
  expect(within(panel).getByText('61.5000 %')).toBeTruthy();
  expect(within(panel).getByText('Humedad')).toBeTruthy();
  expect(within(panel).getAllByText(/CURING-01/).length).toBeGreaterThan(0);
  expect(
    within(panel).getAllByText(monitoringDate(overview().telemetry.lastReadingAt)).length,
  ).toBeGreaterThan(0);
  const items = within(panel).getAllByRole('listitem');
  expect(items).toHaveLength(5);
  expect(items[0].textContent).toContain('CRITICAL · HIGH_TEMPERATURE');
  expect(within(items[0]).getByText('— · —')).toBeTruthy();
  expect(within(items[0]).getByText('—')).toBeTruthy();
  expect(
    within(panel)
      .getByRole('link', { name: 'Ver monitoreo IIoT completo' })
      .getAttribute('href') === '/production/orders/order/iiot',
  ).toBe(true);
  const form = screen.getByRole('form', { name: 'Inspeccionar lote' });
  expect(panel.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect((within(form).getByLabelText(/Resultado/) as HTMLSelectElement).value).toBe('APPROVED');
  expect((within(form).getByLabelText(/Resultado/) as HTMLSelectElement).disabled).toBe(false);
  expect((within(form).getByLabelText(/No conformidades/) as HTMLTextAreaElement).value).toBe('');
});

it.each(['overview', 'alerts', 'loading', 'empty', 'critical'])(
  'keeps explicit approval usable with IIoT %s',
  async (state) => {
    const summary = overview('COMPLETED');
    if (state === 'empty')
      summary.telemetry = { totalReadings: 0, latestByMetric: [], lastReadingAt: null };
    const fetch = setup({ summary, fail: state, pending: state === 'loading' });
    const form = await screen.findByRole('form', { name: 'Inspeccionar lote' });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText(/Observaciones/), {
      target: { value: 'Inspección manual satisfactoria' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Revisar inspección' }));
    fireEvent.click(await within(form).findByRole('button', { name: 'Confirmar inspección' }));
    await waitFor(() =>
      expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1),
    );
    const [, init] = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(init?.body))).toEqual({
      result: 'APPROVED',
      observations: 'Inspección manual satisfactoria',
    });
    if (['overview', 'alerts'].includes(state)) expect(screen.getByRole('alert')).toBeTruthy();
    if (state === 'empty')
      expect(screen.getByText('La inspección de Calidad continúa siendo manual.')).toBeTruthy();
  },
);

it('reports no alerts without implying quality approval and preserves WARNING evidence', async () => {
  const summary = overview('COMPLETED');
  summary.alerts = { total: 0, warning: 0, critical: 0, unacknowledged: 0, lastAlertAt: null };
  setup({ summary });
  expect(
    await screen.findByText('No se registraron alertas IIoT durante la producción.'),
  ).toBeTruthy();
  expect(screen.getByText(/la ausencia de alertas no sustituye la inspección/)).toBeTruthy();
});

it('shows WARNING without a critical warning', async () => {
  const summary = overview('COMPLETED');
  summary.alerts.critical = 0;
  setup({ summary });
  expect(await screen.findByText('Total de lecturas')).toBeTruthy();
  expect(screen.queryByText(/Se registraron .* alertas críticas/)).not.toBeTruthy();
  expect(screen.getAllByText(/WARNING · HIGH_TEMPERATURE/).length).toBeGreaterThan(0);
});

it.each(['ADMIN', 'PRODUCCION', 'VENTAS'])(
  'keeps historical evidence and existing permissions for %s',
  async (role) => {
    setup({ inspected: true, role });
    expect(await screen.findByText('Revisión humana registrada')).toBeTruthy();
    expect(screen.getByText('Inspectora')).toBeTruthy();
    expect(screen.getByText('Detalle histórico')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Contexto IIoT de producción' })).toBeTruthy();
    expect(screen.queryByRole('form')).not.toBeTruthy();
  },
);

it('lets read-only roles review evidence without inspecting', async () => {
  setup({ role: 'VENTAS' });
  expect(await screen.findByText('Total de lecturas')).toBeTruthy();
  expect(screen.queryByRole('form')).not.toBeTruthy();
});
