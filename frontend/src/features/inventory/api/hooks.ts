import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateWarehouseData } from '../types';
import {
  createWarehouse,
  getWarehouses,
  setWarehouseStatus,
  updateWarehouse,
  type UpdateWarehouseData,
} from './warehouses';

export const useWarehouses = () => {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: () => getWarehouses(),
  });
};

export const useCreateWarehouse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWarehouseData) => createWarehouse(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  });
};

export const useUpdateWarehouse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWarehouseData }) =>
      updateWarehouse(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  });
};

export const useSetWarehouseStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setWarehouseStatus(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  });
};
