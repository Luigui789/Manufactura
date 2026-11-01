import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/api-client';
import type { SessionUser } from '@/features/auth/types';

export const SESSION_KEY = ['auth', 'me'] as const;
/** Conserva el observador de sesión para que el árbol protegido reciba null. */
export function clearPrivateData(client: QueryClient) {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  client.getMutationCache().clear();
}
export function createAppQueryClient() {
  const handleError = (error: Error, skipUnauthorized = false) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 401 && !skipUnauthorized) {
      void client.cancelQueries();
      clearPrivateData(client);
      client.setQueryData(SESSION_KEY, null);
    } else if (error.status === 403) {
      if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
        client.setQueryData<SessionUser | null>(SESSION_KEY, (user) =>
          user ? { ...user, mustChangePassword: true } : user,
        );
      }
      void client.invalidateQueries({ queryKey: SESSION_KEY });
    }
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handleError(error) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        handleError(error, mutation.meta?.login === true),
    }),
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return client;
}
