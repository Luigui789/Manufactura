import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSupplierPayload, UpdateSupplierPayload } from '../types';
import { createSupplier, getSuppliers, setSupplierStatus, updateSupplier } from '../api/suppliers';

export function useSuppliers(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['suppliers', 'list', page, limit],
    queryFn: ({ signal }) => getSuppliers(page, limit, signal),
  });
}

function useRefreshSuppliers() {
  const client = useQueryClient();

  return () => client.invalidateQueries({ queryKey: ['suppliers'] });
}

export function useCreateSupplier() {
  const onSuccess = useRefreshSuppliers();

  return useMutation({
    mutationFn: (payload: CreateSupplierPayload) => createSupplier(payload),
    onSuccess,
  });
}

export function useUpdateSupplier() {
  const onSuccess = useRefreshSuppliers();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSupplierPayload }) =>
      updateSupplier(id, payload),
    onSuccess,
  });
}

export function useSetSupplierStatus() {
  const onSuccess = useRefreshSuppliers();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setSupplierStatus(id, isActive),
    onSuccess,
  });
}
