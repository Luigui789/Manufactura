import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { InventoryLotOrigin } from '@/features/inventory/api/inventory-data';

export type InspectionPayload = {
  result: 'APPROVED' | 'REJECTED';
  observations: string;
  nonConformities?: string;
};
export type Inspection = InspectionPayload & {
  id: string;
  lotId: string;
  inspectedAt: string;
  inspectedBy: { id: string; fullName: string };
};
export type Traceability = {
  rootLotId: string;
  lots: Array<{
    id: string;
    code: string;
    status: string;
    product: { id: string; code: string; name: string; unit: string };
    origin: InventoryLotOrigin;
    consumptions: Array<{
      id: string;
      quantity: string;
      lotId: string | null;
      productionOrder: { id: string; number: string };
      warehouse: { id: string; code: string; name: string };
      product: { id: string; code: string; name: string; unit: string };
    }>;
  }>;
};
async function data<T>(path: string, options?: RequestInit) {
  return (await apiFetch<ApiResponse<T>>(path, options)).data;
}
export function useInspection(id: string) {
  return useQuery({
    queryKey: ['production-quality', id],
    queryFn: ({ signal }) =>
      data<Inspection | null>(`/production/lots/${id}/inspection`, { signal }),
  });
}
export function useTraceability(id: string) {
  return useQuery({
    queryKey: ['production-traceability', id],
    queryFn: ({ signal }) => data<Traceability>(`/production/lots/${id}/traceability`, { signal }),
  });
}
export function useInspectLot(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: InspectionPayload) =>
      data<Inspection>(`/production/lots/${id}/inspection`, {
        method: 'POST',
        body: JSON.stringify(value),
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          ['production-quality'],
          ['production-traceability'],
          ['production-orders'],
          ['inventory'],
          ['lots'],
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
    onError: async () => {
      await Promise.all(
        [['production-quality', id], ['lots', 'detail', id], ['production-orders']].map(
          (queryKey) => client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
