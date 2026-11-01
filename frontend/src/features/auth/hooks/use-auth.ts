import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearPrivateData, SESSION_KEY } from '@/app/query-client';
import * as auth from '../services/auth-api';

export function useSession() {
  const client = useQueryClient();
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }) => {
      const user = await auth.getMe(signal);
      if (!user) client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      return user;
    },
  });
}
export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: auth.login,
    meta: { login: true },
    onSuccess: async (user) => {
      await client.cancelQueries();
      clearPrivateData(client);
      client.setQueryData(SESSION_KEY, user);
    },
  });
}
export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: auth.logout,
    onSuccess: async () => {
      await client.cancelQueries();
      clearPrivateData(client);
      client.setQueryData(SESSION_KEY, null);
    },
  });
}
export function useChangePassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: auth.changePassword,
    onSuccess: async (user) => {
      await client.cancelQueries({ queryKey: SESSION_KEY });
      client.setQueryData(SESSION_KEY, user);
    },
  });
}
