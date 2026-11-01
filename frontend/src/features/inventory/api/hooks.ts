import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateWarehouseData } from '../types';
import {
  createWarehouse,
  getWarehouses,
  setWarehouseStatus,
  updateWarehouse,
  type UpdateWarehouseData,
  type WarehouseFilters,
} from './warehouses';

export const useWarehouses = (page = 1, filters: WarehouseFilters = {}, limit = 20) => {
  return useQuery({
    queryKey: ['warehouses', page, limit, filters],
    queryFn: ({ signal }) => getWarehouses(page, limit, filters, signal),
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
