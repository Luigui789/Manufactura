import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';

export const CARBON_CATEGORIES = [
  'RAW_MATERIAL',
  'ENERGY',
  'INBOUND_TRANSPORT',
  'PACKAGING',
  'WASTE',
] as const;
export type CarbonCategory = (typeof CARBON_CATEGORIES)[number];
export const CARBON_UNITS = [
  'UNIT',
  'GRAM',
  'KILOGRAM',
  'MILLILITER',
  'LITER',
  'KWH',
  'KILOMETER',
  'TON_KILOMETER',
] as const;
export type CarbonUnit = (typeof CARBON_UNITS)[number];
export type ProductUnit = 'UNIT' | 'GRAM' | 'KILOGRAM' | 'MILLILITER' | 'LITER';
export type FootprintStatus = 'DRAFT' | 'FINALIZED';
type ProductRef = { id: string; code: string; name: string; unit: ProductUnit };
type LotRef = { id: string; code: string; status: string };
type Page<T> = { data: T[]; meta: { page: number; limit: number; total: number } };

export type EmissionFactor = {
  id: string;
  code: string;
  name: string;
  category: CarbonCategory;
  activityUnit: CarbonUnit;
  kgCo2ePerUnit: string;
  productId: string | null;
  product: (ProductRef & { isActive: boolean }) | null;
  sourceName: string;
  sourceReference: string;
  sourceYear: number | null;
  notes: string | null;
  isActive: boolean;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
};
export type CreateFactorInput = {
  code: string;
  name: string;
  category: CarbonCategory;
  activityUnit: CarbonUnit;
  kgCo2ePerUnit: string;
  productId?: string | null;
  sourceName: string;
  sourceReference: string;
  sourceYear?: number | null;
  notes?: string | null;
};
export type UpdateFactorInput = Partial<
  Pick<
    CreateFactorInput,
    'name' | 'kgCo2ePerUnit' | 'sourceName' | 'sourceReference' | 'sourceYear' | 'notes'
  >
>;

export type CircularProfile = {
  id: string;
  productId: string;
  metricCode: string;
  displayName: string;
  reportingUnit: CarbonUnit;
  isActive: boolean;
  product: ProductRef & { isActive: boolean };
};
export type CircularMetric = {
  profileId: string;
  metricCode: string;
  displayName: string;
  productId: string;
  productCode: string;
  productName: string;
  consumedQuantity: string;
  consumedUnit: CarbonUnit;
  quantity: string;
  reportingUnit: CarbonUnit;
};

export type SustainabilityOrder = {
  id: string;
  number: string;
  status: string;
  quantityProduced: string;
  completedAt: string | null;
  product: ProductRef;
  lot: LotRef | null;
  footprint: {
    id: string;
    status: FootprintStatus;
    finalizedAt: string | null;
    totalKgCo2e: string | null;
    kgCo2ePerOutputUnit: string | null;
  } | null;
};
export type OrderSummary = Omit<SustainabilityOrder, 'footprint'> & {
  footprint: { id: string; status: FootprintStatus } | null;
  canCreateFootprint: boolean;
  circularity: CircularMetric[];
  circularityNotice: string;
  disclaimer: string;
};

export type CarbonActivity = {
  id: string;
  category: CarbonCategory;
  source: 'PRODUCTION_CONSUMPTION' | 'MANUAL';
  description: string;
  activityQuantity: string;
  activityUnit: CarbonUnit;
  originalQuantity: string | null;
  originalUnit: CarbonUnit | null;
  emissionFactorId: string;
  factorCodeSnapshot: string;
  factorNameSnapshot: string;
  factorValueSnapshot: string;
  factorSourceNameSnapshot: string;
  factorSourceReferenceSnapshot: string;
  factorSourceYearSnapshot: number | null;
  emissionsKgCo2e: string;
  inventoryMovementId: string | null;
  inventoryMovement: {
    id: string;
    quantity: string;
    occurredAt: string;
    product: ProductRef;
    lot: { id: string; code: string } | null;
  } | null;
  createdBy: { id: string; fullName: string } | null;
};
export type MissingFactor = {
  productId: string;
  code: string;
  name: string;
  unit: ProductUnit;
  consumedQuantity: string;
};
export type Footprint = {
  id: string;
  status: FootprintStatus;
  scope: 'PARTIAL_CRADLE_TO_GATE';
  productionOrderId: string;
  lotId: string;
  quantityProduced: string;
  outputUnit: ProductUnit;
  totalKgCo2e: string | null;
  kgCo2ePerOutputUnit: string | null;
  totalsByCategory: Record<CarbonCategory, string>;
  totalKgCo2ePreview: string;
  kgCo2ePerOutputUnitPreview: string;
  missingFactors: MissingFactor[];
  boundaryNotes: string | null;
  calculatedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: { id: string; fullName: string } | null;
  productionOrder: { id: string; number: string; status: string; product: ProductRef };
  lot: LotRef | null;
  activities: CarbonActivity[];
  circularity: CircularMetric[];
  circularityNotice: string;
  disclaimer: string;
};
export type ManualActivityInput = {
  emissionFactorId: string;
  description: string;
  quantity: string;
};

const base = '/sustainability';
async function data<T>(path: string, options?: RequestInit) {
  return (await apiFetch<ApiResponse<T>>(base + path, options)).data;
}
const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export type OrderFilters = { page: number; search?: string; footprintStatus?: string };
export function useSustainabilityOrders(filters: OrderFilters) {
  return useQuery({
    queryKey: ['sustainability-orders', filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
      if (filters.search) params.set('search', filters.search);
      if (filters.footprintStatus) params.set('footprintStatus', filters.footprintStatus);
      return apiFetch<Page<SustainabilityOrder>>(`${base}/production-orders?${params}`, {
        signal,
      });
    },
  });
}
export function useOrderSummary(orderId: string) {
  return useQuery({
    queryKey: ['sustainability-order', orderId],
    queryFn: ({ signal }) => data<OrderSummary>(`/production-orders/${orderId}`, { signal }),
  });
}
export function useFootprint(orderId: string) {
  return useQuery({
    queryKey: ['carbon-footprint', orderId],
    queryFn: ({ signal }) =>
      data<Footprint | null>(`/production-orders/${orderId}/footprint`, { signal }),
  });
}

export type FactorFilters = {
  page: number;
  search?: string;
  category?: CarbonCategory;
  isActive?: boolean;
  productId?: string;
  limit?: number;
};
export function useEmissionFactors(filters: FactorFilters) {
  return useQuery({
    queryKey: ['emission-factors', filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit ?? 20),
      });
      if (filters.search) params.set('search', filters.search);
      if (filters.category) params.set('category', filters.category);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.productId) params.set('productId', filters.productId);
      return apiFetch<Page<EmissionFactor>>(`${base}/emission-factors?${params}`, { signal });
    },
  });
}
export function useCircularProfiles(page: number) {
  return useQuery({
    queryKey: ['circular-materials', page],
    queryFn: ({ signal }) =>
      apiFetch<Page<CircularProfile>>(`${base}/circular-materials?page=${page}&limit=20`, {
        signal,
      }),
  });
}

function useSustainabilityMutation<TInput, TResult>(
  request: (input: TInput) => Promise<TResult>,
  keys: string[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async () => {
      await Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
  });
}
const footprintKeys = ['carbon-footprint', 'sustainability-order', 'sustainability-orders'];

export function useCreateFactor() {
  return useSustainabilityMutation(
    (input: CreateFactorInput) => data<EmissionFactor>('/emission-factors', send('POST', input)),
    ['emission-factors'],
  );
}
export function useUpdateFactor(id: string) {
  return useSustainabilityMutation(
    (input: UpdateFactorInput) =>
      data<EmissionFactor>(`/emission-factors/${id}`, send('PATCH', input)),
    ['emission-factors'],
  );
}
export function useSetFactorStatus() {
  return useSustainabilityMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      data<EmissionFactor>(`/emission-factors/${id}/status`, send('PATCH', { isActive })),
    ['emission-factors'],
  );
}
export function useCreateCircularProfile() {
  return useSustainabilityMutation(
    (input: {
      productId: string;
      metricCode: string;
      displayName: string;
      reportingUnit: CarbonUnit;
    }) => data<CircularProfile>('/circular-materials', send('POST', input)),
    ['circular-materials', ...footprintKeys],
  );
}
export function useSetCircularStatus() {
  return useSustainabilityMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      data<CircularProfile>(`/circular-materials/${id}/status`, send('PATCH', { isActive })),
    ['circular-materials', ...footprintKeys],
  );
}
export function useCreateFootprint(orderId: string) {
  return useSustainabilityMutation(
    () => data<Footprint>(`/production-orders/${orderId}/footprint`, send('POST')),
    footprintKeys,
  );
}
export function useSyncFootprint(orderId: string) {
  return useSustainabilityMutation(
    () => data<Footprint>(`/production-orders/${orderId}/footprint/sync`, send('POST')),
    footprintKeys,
  );
}
export function useAddManualActivity(orderId: string) {
  return useSustainabilityMutation(
    (input: ManualActivityInput) =>
      data<Footprint>(`/production-orders/${orderId}/footprint/activities`, send('POST', input)),
    footprintKeys,
  );
}
export function useUpdateManualActivity(orderId: string) {
  return useSustainabilityMutation(
    ({ id, ...input }: Partial<ManualActivityInput> & { id: string }) =>
      data<Footprint>(
        `/production-orders/${orderId}/footprint/activities/${id}`,
        send('PATCH', input),
      ),
    footprintKeys,
  );
}
export function useDeleteManualActivity(orderId: string) {
  return useSustainabilityMutation(
    (id: string) =>
      data<Footprint>(`/production-orders/${orderId}/footprint/activities/${id}`, send('DELETE')),
    footprintKeys,
  );
}
export function useFinalizeFootprint(orderId: string) {
  return useSustainabilityMutation(
    (boundaryNotes: string) =>
      data<Footprint>(
        `/production-orders/${orderId}/footprint/finalize`,
        send('POST', { boundaryNotes }),
      ),
    footprintKeys,
  );
}
