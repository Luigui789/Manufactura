import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IiotSimulationControl } from './IiotSimulationControl';
import type { SimulationStatus } from '../api/simulation';
import { response } from '../test/fixtures';

const clients: QueryClient[] = [];
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost/api'));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup(overrides: Partial<SimulationStatus> = {}, fail = false) {
  let current: SimulationStatus = {
    available: true,
    orderStatus: 'IN_PROGRESS',
    status: 'IDLE',
    process: null,
    scenario: null,
    deviceCode: null,
    publishedSamples: 0,
    totalSamples: 60,
    receivedReadings: 0,
    error: null,
    ...overrides,
  };
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (fail) return response({ message: 'No disponible' }, 503);
    if (init?.method === 'POST')
      current = {
        ...current,
        status: 'RUNNING',
        process: 'liquid',
        scenario: 'deviation',
        deviceCode: 'DEMO-DEVICE',
      };
    return response({ data: current }, init?.method === 'POST' ? 202 : 200);
  });
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <IiotSimulationControl productionOrderId="order" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return {
    fetch,
    finish: () => {
      current = { ...current, status: 'COMPLETED', publishedSamples: 60, receivedReadings: 240 };
    },
  };
}

it('starts from the button using only the current OP and fixed DTO; prevents duplicate clicks', async () => {
  const { fetch } = setup();
  const button = screen.getByRole('button', { name: 'Iniciar prueba IIoT' }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  expect((screen.getByLabelText('Proceso de demo') as HTMLSelectElement).value).toBe('liquid');
  expect((screen.getByLabelText('Escenario') as HTMLSelectElement).value).toBe('deviation');
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole('button', { name: 'Prueba en curso…' });
  expect(
    (screen.getByRole('button', { name: 'Prueba en curso…' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  const posts = fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0][0]).toBe('http://localhost/api/iiot/production-orders/order/simulation');
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
    process: 'liquid',
    scenario: 'deviation',
  });
  expect(screen.getByRole('link', { name: 'Ver monitoreo IIoT' }).getAttribute('href')).toBe(
    '/production/orders/order/iiot',
  );
  expect(screen.getByText(/Completar producción e inspeccionar Calidad siguen/)).toBeTruthy();
});

it('supports the normal bar scenario without guessing from product text', async () => {
  const { fetch } = setup();
  await waitFor(() =>
    expect((screen.getByLabelText('Proceso de demo') as HTMLSelectElement).disabled).toBe(false),
  );
  fireEvent.change(screen.getByLabelText('Proceso de demo'), { target: { value: 'bar' } });
  fireEvent.change(screen.getByLabelText('Escenario'), { target: { value: 'normal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar prueba IIoT' }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
  );
  expect(
    JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]?.body)),
  ).toEqual({ process: 'bar', scenario: 'normal' });
});

it('restores progress after mounting and polls only until completion', async () => {
  vi.useFakeTimers();
  const { fetch, finish } = setup({
    status: 'RUNNING',
    process: 'liquid',
    scenario: 'deviation',
    publishedSamples: 10,
    receivedReadings: 40,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(screen.getByText('10 de 60 muestras publicadas · 40 lecturas recibidas')).toBeTruthy();
  finish();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100);
  });
  expect(screen.getByText('Prueba finalizada: lecturas recibidas')).toBeTruthy();
  expect(screen.getByText('60 de 60 muestras publicadas · 240 lecturas recibidas')).toBeTruthy();
  const count = fetch.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(fetch).toHaveBeenCalledTimes(count);
});

it.each([{ available: false }, { orderStatus: 'COMPLETED' }, { orderStatus: 'DRAFT' }])(
  'does not launch with unavailable/invalid state: %j',
  async (state) => {
    const { fetch } = setup(state);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      (screen.getByRole('button', { name: 'Iniciar prueba IIoT' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  },
);

it('reports query errors and exposes a retry without starting a run', async () => {
  const { fetch } = setup({}, true);
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Reintentar consulta de prueba' })).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Iniciar prueba IIoT' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});

it('shows failed ingestion without presenting it as success and permits a manual retry', async () => {
  setup({
    status: 'FAILED',
    error: 'La prueba no recibió todas las lecturas esperadas.',
    receivedReadings: 0,
  });
  await screen.findByText('La prueba no se completó');
  expect(screen.getByText('La prueba no recibió todas las lecturas esperadas.')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Iniciar prueba IIoT' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
