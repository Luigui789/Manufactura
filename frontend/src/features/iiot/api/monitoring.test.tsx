import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api-client';
import {
  monitoringInterval,
  monitoringKeys,
  useIiotAlerts,
  useIiotOverview,
  useIiotReadings,
} from './monitoring';
import { overview, page, reading, response } from '../test/fixtures';

const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost/api'));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

it('overview uses apiFetch, credentials, signal and the real contract', async () => {
  const fetch = vi.fn(async (_input: string, _options?: RequestInit) =>
    response({ data: overview() }),
  );
  vi.stubGlobal('fetch', fetch);
  const { client, wrapper: provider } = wrapper();
  const { result } = renderHook(() => useIiotOverview('order'), { wrapper: provider });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetch.mock.calls[0][0]).toBe('http://localhost/api/iiot/production-orders/order/overview');
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: 'include',
    signal: expect.any(AbortSignal),
  });
  expect(client.getQueryData(monitoringKeys.overview('order'))).toEqual(overview());
  expect(result.current.data?.telemetry.latestByMetric[1].value).toBe('27.2500');
});
it('readings requests the selected metric and 100 readings under an isolated key', async () => {
  const fetch = vi.fn(async (_input: string) => response(page([reading('HUMIDITY')])));
  vi.stubGlobal('fetch', fetch);
  const { client, wrapper: provider } = wrapper();
  const { result, rerender } = renderHook(
    ({ id, metric }: { id: string; metric: 'HUMIDITY' | 'TEMPERATURE' }) =>
      useIiotReadings(id, { metric }),
    { wrapper: provider, initialProps: { id: 'order', metric: 'HUMIDITY' } },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetch.mock.calls[0][0]).toBe(
    'http://localhost/api/iiot/production-orders/order/readings?metric=HUMIDITY&limit=100',
  );
  expect(
    client.getQueryData(['iiot', 'order', 'readings', { metric: 'HUMIDITY', limit: 100 }]),
  ).toBeTruthy();
  rerender({ id: 'another', metric: 'TEMPERATURE' });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1][0]).toContain('/another/readings?metric=TEMPERATURE&limit=100');
});
it.each([undefined, 'WARNING', 'CRITICAL'] as const)(
  'alerts sends severity %s to the backend and includes filters in the key',
  async (severity) => {
    const fetch = vi.fn(async (_input: string) => response(page([])));
    vi.stubGlobal('fetch', fetch);
    const { client, wrapper: provider } = wrapper();
    const { result } = renderHook(() => useIiotAlerts('order', { severity }), {
      wrapper: provider,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/iiot/production-orders/order/alerts');
    expect(url.searchParams.get('severity')).toBe(severity ?? null);
    expect(url.searchParams.get('limit')).toBe('20');
    expect(client.getQueryData(['iiot', 'order', 'alerts', { severity, limit: 20 }])).toBeTruthy();
  },
);
it('propagates ApiError and does not retry or poll a 404', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => response({ message: 'Orden no encontrada' }, 404));
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useIiotOverview('missing'), { wrapper: wrapper().wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(result.current.error).toBeInstanceOf(ApiError);
  expect(result.current.error).toMatchObject({ status: 404, message: 'Orden no encontrada' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(['DRAFT', 'CANCELLED', 'COMPLETED'] as const)('%s disables the polling policy', (status) =>
  expect(monitoringInterval(status)).toBe(false),
);
it('IN_PROGRESS polls every 5000 ms', () => expect(monitoringInterval('IN_PROGRESS')).toBe(5000));
it('real observers poll all three queries then stop when overview becomes COMPLETED', async () => {
  vi.useFakeTimers();
  let status: 'IN_PROGRESS' | 'COMPLETED' = 'IN_PROGRESS';
  const fetch = vi.fn(async (input: string) =>
    response(input.endsWith('/overview') ? { data: overview(status) } : page([])),
  );
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(
    () => {
      const summary = useIiotOverview('order');
      const status = summary.data?.productionOrder.status;
      const readings = useIiotReadings(
        'order',
        { metric: 'TEMPERATURE' },
        { status, enabled: Boolean(status) },
      );
      const alerts = useIiotAlerts('order', {}, { status, enabled: Boolean(status) });
      return { summary, readings, alerts };
    },
    { wrapper: wrapper().wrapper },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5100);
  });
  expect(fetch.mock.calls.filter(([url]) => url.includes('/readings?'))).toHaveLength(2);
  expect(fetch.mock.calls.filter(([url]) => url.includes('/alerts?'))).toHaveLength(2);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/overview'))).toHaveLength(2);
  status = 'COMPLETED';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5100);
  });
  expect(result.current.summary.data?.productionOrder.status).toBe('COMPLETED');
  const count = fetch.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(fetch).toHaveBeenCalledTimes(count);
});
