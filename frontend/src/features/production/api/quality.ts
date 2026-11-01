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
    quality?: { inspection: Inspection | null; disposition: QualityDisposition | null };
    consumptions: Array<{
      id: string;
      quantity: string;
      lotId: string | null;
      productionOrder: { id: string; number: string };
      warehouse: { id: string; code: string; name: string };
      product: { id: string; code: string; name: string; unit: string };
    }>;
    outbound: Array<{
      id: string;
      dispatchId: string;
      dispatchNumber: string;
      dispatchedAt: string;
      quantity: string;
      saleOrder: {
        id: string;
        number: string;
        customer: { id: string; code: string; name: string };
      };
      warehouse: { id: string; code: string; name: string };
      performedByUser: { id: string; fullName: string };
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

export type QualityDispositionType = 'RELEASE' | 'REWORK' | 'SCRAP';
export type QualityDisposition = {
  id: string;
  lotId: string;
  inspectionId: string;
  type: QualityDispositionType;
  reason: string;
  decidedAt: string;
  decidedByUserId: string;
  decidedBy: { id: string; fullName: string };
};
export function useQualityDisposition(lotId: string) {
  return useQuery({
    queryKey: ['quality-disposition', lotId],
    queryFn: ({ signal }) =>
      data<QualityDisposition | null>(`/production/lots/${lotId}/disposition`, { signal }),
  });
}
export function useCreateQualityDisposition(lotId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: { type: QualityDispositionType; reason: string }) =>
      data<QualityDisposition>(`/production/lots/${lotId}/disposition`, {
        method: 'POST',
        body: JSON.stringify(value),
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          'production-quality',
          'quality-disposition',
          'production-traceability',
          'production-orders',
          'inventory',
          'lots',
          'production-dashboard',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    },
    onError: async () => {
      await Promise.all(
        [['quality-disposition', lotId], ['lots', 'detail', lotId], ['production-orders']].map(
          (queryKey) => client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
