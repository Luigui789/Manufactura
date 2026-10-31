import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';

export type SimulationOptions = { process: 'bar' | 'liquid'; scenario: 'normal' | 'deviation' };
export type SimulationStatus = {
  available: boolean;
  orderStatus: string;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  process: SimulationOptions['process'] | null;
  scenario: SimulationOptions['scenario'] | null;
  deviceCode: string | null;
  publishedSamples: number;
  totalSamples: number;
  receivedReadings: number;
  error: string | null;
};
const key = (id: string) => ['iiot', id, 'simulation'] as const;
const url = (id: string) => '/iiot/production-orders/' + encodeURIComponent(id) + '/simulation';

export function useSimulation(orderId: string) {
  return useQuery({
    queryKey: key(orderId),
    queryFn: async ({ signal }) =>
      (await apiFetch<ApiResponse<SimulationStatus>>(url(orderId), { signal })).data,
    retry: false,
    refetchOnMount: 'always',
    refetchInterval: (query) =>
      query.state.data?.status === 'RUNNING' && !query.state.error ? 2000 : false,
  });
}

export function useStartSimulation(orderId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (options: SimulationOptions) =>
      (
        await apiFetch<ApiResponse<SimulationStatus>>(url(orderId), {
          method: 'POST',
          body: JSON.stringify(options),
        })
      ).data,
    onSuccess: (run) => {
      client.setQueryData(key(orderId), run);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: key(orderId) });
    },
  });
}
