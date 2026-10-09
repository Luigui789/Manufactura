import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCustomerPayload, UpdateCustomerPayload } from '../types';
import { createCustomer, getCustomers, setCustomerStatus, updateCustomer } from '../api/customers';

export function useCustomers(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['customers', 'list', page, limit],
    queryFn: ({ signal }) => getCustomers(page, limit, signal),
  });
}

function useRefreshCustomers() {
  const client = useQueryClient();

  return () => client.invalidateQueries({ queryKey: ['customers'] });
}

export function useCreateCustomer() {
  const onSuccess = useRefreshCustomers();

  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) => createCustomer(payload),
    onSuccess,
  });
}

export function useUpdateCustomer() {
  const onSuccess = useRefreshCustomers();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCustomerPayload }) =>
      updateCustomer(id, payload),
    onSuccess,
  });
}

export function useSetCustomerStatus() {
  const onSuccess = useRefreshCustomers();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setCustomerStatus(id, isActive),
    onSuccess,
  });
}
