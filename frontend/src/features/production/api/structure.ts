import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { BomProduct } from './boms';

export type StructureIssueCode =
  | 'PRODUCT_INACTIVE'
  | 'MISSING_BOM'
  | 'BOM_INACTIVE'
  | 'MISSING_ACTIVE_BOM_VERSION'
  | 'EMPTY_BOM_VERSION'
  | 'MISSING_ROUTE'
  | 'ROUTE_INACTIVE'
  | 'NO_ROUTE_OPERATIONS';
export type StructureComponent = {
  product: BomProduct;
  quantity: string;
  unit: BomProduct['unit'];
  type: BomProduct['type'];
  isManufactured: boolean;
  child: StructureNode | null;
};
export type StructureNode = {
  product: BomProduct;
  bom: {
    id: string;
    name: string;
    isActive: boolean;
    activeVersion: { id: string; version: number; outputQuantity: string } | null;
  } | null;
  route: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    operationCount: number;
    totalStandardMinutes: string;
    operations: {
      id: string;
      sequence: number;
      name: string;
      description: string | null;
      standardMinutes: string;
    }[];
  } | null;
  routeStatus: 'ACTIVE' | 'INACTIVE' | 'MISSING';
  components: StructureComponent[];
  issues: { code: StructureIssueCode; message: string }[];
  readiness: 'READY' | 'INCOMPLETE';
};
export type ManufacturingStructure = StructureNode & { maxDepth: number };

export function useManufacturingStructure(productId: string) {
  return useQuery({
    queryKey: ['manufacturing-structure', productId],
    enabled: !!productId,
    queryFn: async ({ signal }) =>
      (
        await apiFetch<ApiResponse<ManufacturingStructure>>(
          '/production/manufacturing-structure/' + productId,
          { signal },
        )
      ).data,
  });
}
