import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSuppliers, createSupplier, updateSupplier, toggleSupplierStatus } from '../api/suppliers';

export const useSuppliers = () => {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
  });
};

export const useCreateSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSupplier,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

export const useUpdateSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSupplier,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

export const useToggleSupplierStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: toggleSupplierStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};