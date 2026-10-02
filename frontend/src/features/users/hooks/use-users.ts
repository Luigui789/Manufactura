import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as users from '../services/users-api';
import type { RoleCode } from '@/features/auth/types';

export function useUsers(page: number) {
  return useQuery({
    queryKey: ['users', page],
    queryFn: ({ signal }) => users.listUsers(page, signal),
  });
}
function useRefreshUsers() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['users'] });
}
export function useCreateUser() {
  const onSuccess = useRefreshUsers();
  return useMutation({ mutationFn: users.createUser, onSuccess });
}
export function useSetUserActive() {
  const onSuccess = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      users.setUserActive(id, active),
    onSuccess,
  });
}
export function useChangeRole() {
  const onSuccess = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: RoleCode }) => users.changeRole(id, role),
    onSuccess,
  });
}
export function useResetPassword() {
  const onSuccess = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, temporaryPassword }: { id: string; temporaryPassword: string }) =>
      users.resetPassword(id, temporaryPassword),
    onSuccess,
  });
}
