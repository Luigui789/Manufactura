import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch, type ApiResponse } from '@/services/api-client';
import type {
  IiotAlert,
  IiotAlertSeverity,
  IiotMetric,
  IiotOverview,
  IiotPage,
  IiotReading,
} from '../types';

type OrderStatus = IiotOverview['productionOrder']['status'];
type MonitoringOptions = { status?: OrderStatus; enabled?: boolean };
type ReadingsFilters = { metric: IiotMetric; limit?: 100 };
type AlertsFilters = { severity?: IiotAlertSeverity; limit?: 20 };

export function monitoringInterval(status?: OrderStatus) {
  return status === 'IN_PROGRESS' ? 5000 : false;
}
export function isMonitoringNotFound(error: Error | null) {
  return error instanceof ApiError && error.status === 404;
}
const base = (orderId: string) => '/iiot/production-orders/' + encodeURIComponent(orderId);
export const monitoringKeys = {
  overview: (id: string) => ['iiot', id, 'overview'] as const,
  readings: (id: string, filters: ReadingsFilters) =>
    ['iiot', id, 'readings', { ...filters, limit: 100 }] as const,
  alerts: (id: string, filters: AlertsFilters) =>
    ['iiot', id, 'alerts', { ...filters, limit: 20 }] as const,
};
export function useIiotOverview(orderId: string) {
  return useQuery({
    queryKey: monitoringKeys.overview(orderId),
    queryFn: async ({ signal }) =>
      (await apiFetch<ApiResponse<IiotOverview>>(base(orderId) + '/overview', { signal })).data,
    enabled: Boolean(orderId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    refetchInterval: (query) =>
      query.state.error ? false : monitoringInterval(query.state.data?.productionOrder.status),
  });
}
export function useIiotReadings(
  orderId: string,
  filters: ReadingsFilters,
  options: MonitoringOptions = {},
) {
  return useQuery({
    queryKey: monitoringKeys.readings(orderId, filters),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ metric: filters.metric, limit: '100' });
      return apiFetch<IiotPage<IiotReading>>(base(orderId) + '/readings?' + params, { signal });
    },
    enabled: Boolean(orderId) && options.enabled !== false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      isMonitoringNotFound(query.state.error) ? false : monitoringInterval(options.status),
  });
}
export function useIiotAlerts(
  orderId: string,
  filters: AlertsFilters = {},
  options: MonitoringOptions = {},
) {
  return useQuery({
    queryKey: monitoringKeys.alerts(orderId, filters),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (filters.severity) params.set('severity', filters.severity);
      return apiFetch<IiotPage<IiotAlert>>(base(orderId) + '/alerts?' + params, { signal });
    },
    enabled: Boolean(orderId) && options.enabled !== false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      isMonitoringNotFound(query.state.error) ? false : monitoringInterval(options.status),
  });
}
