import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '@/app/query-client';
import { usePurchaseAction } from './orders';

beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost/api'));
afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
  vi.unstubAllGlobals();
});
it.each(['receive', 'confirm', 'cancel'] as const)(
  'refreshes inventory and lots only after receive (%s)',
  async (action) => {
    const client = createAppQueryClient();
    const keys = [
      ['purchase-orders', 'list'],
      ['products', 'list'],
      ['production-orders', 'requirements', 'order'],
      ['inventory', 'stock', 1],
      ['inventory', 'movements', 2],
      ['lots', 'list', 1],
      ['lots', 'detail', 'lot'],
    ];
    keys.forEach((key) => client.setQueryData(key, {}));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: {} }), {
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const { result, unmount } = renderHook(() => usePurchaseAction('order', action), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    keys.forEach((key, i) =>
      expect(client.getQueryState(key)?.isInvalidated).toBe(i < 3 || action === 'receive'),
    );
    unmount();
    client.clear();
  },
);
it('does not invalidate inventory when receive fails', async () => {
  const client = createAppQueryClient();
  client.setQueryData(['inventory', 'stock'], {});
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'No disponible' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
  const { result, unmount } = renderHook(() => usePurchaseAction('order', 'receive'), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(async () => {
    await expect(result.current.mutateAsync(undefined)).rejects.toThrow('No disponible');
  });
  expect(client.getQueryState(['inventory', 'stock'])?.isInvalidated).toBe(false);
  unmount();
  client.clear();
});
