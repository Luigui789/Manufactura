import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createInventoryAdjustment,
  getInventoryLot,
  getInventoryLots,
  getInventoryMovements,
  getInventoryStock,
} from './inventory-data';

export function useInventoryStock(
  filters: Record<string, string | boolean | undefined>,
  page: number,
) {
  return useQuery({
    queryKey: ['inventory', 'stock', page, filters],
    queryFn: ({ signal }) => getInventoryStock(filters, page, signal),
  });
}
export function useInventoryMovements(filters: Record<string, string | undefined>, page: number) {
  return useQuery({
    queryKey: ['inventory', 'movements', page, filters],
    queryFn: ({ signal }) => getInventoryMovements(filters, page, signal),
  });
}
export function useInventoryLots(
  filters: Record<string, string | boolean | undefined>,
  page: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ['lots', page, filters],
    queryFn: ({ signal }) => getInventoryLots(filters, page, signal),
    enabled,
  });
}
export function useInventoryLot(id: string) {
  return useQuery({
    queryKey: ['lots', 'detail', id],
    queryFn: ({ signal }) => getInventoryLot(id, signal),
    enabled: Boolean(id),
  });
}
export function useCreateInventoryAdjustment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createInventoryAdjustment,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['lots'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
  });
}
