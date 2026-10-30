import { AlertTriangle, CircleAlert } from 'lucide-react';
import { EmptyState } from '@/components/erp';
import type { IiotAlert, IiotAlertSeverity } from '../types';
import { METRIC_LABELS, monitoringDate } from '../presentation';

export function AlertSeverityFilter({
  value,
  onChange,
}: {
  value: IiotAlertSeverity | '';
  onChange: (value: IiotAlertSeverity | '') => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
      Severidad
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as IiotAlertSeverity | '')}
      >
        <option value="">Todas</option>
        <option value="WARNING">Advertencia</option>
        <option value="CRITICAL">Crítica</option>
      </select>
    </label>
  );
}
export function AlertsTable({ alerts }: { alerts: IiotAlert[] }) {
  if (!alerts.length) return <EmptyState title="No hay alertas para este filtro." />;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table>
        <caption className="sr-only">
          Alertas recientes de la orden, de más reciente a más antigua
        </caption>
        <thead>
          <tr>
            {[
              'Severidad',
              'Tipo',
              'Mensaje',
              'Métrica',
              'Valor',
              'Dispositivo',
              'Fecha · Managua',
            ].map((label) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => {
            const critical = alert.severity === 'CRITICAL';
            const Icon = critical ? CircleAlert : AlertTriangle;
            return (
              <tr key={alert.id}>
                <td>
                  <span
                    className={'status-badge ' + (critical ? 'status-danger' : 'status-warning')}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {critical ? 'Crítica' : 'Advertencia'}
                  </span>
                </td>
                <td className="break-words">{alert.type}</td>
                <td className="min-w-52">{alert.message}</td>
                <td>{alert.reading ? METRIC_LABELS[alert.reading.metric] : '—'}</td>
                <td className="whitespace-nowrap tabular-nums">
                  {alert.reading ? alert.reading.value + ' ' + alert.reading.unit : '—'}
                </td>
                <td>{alert.reading?.device.code ?? '—'}</td>
                <td className="whitespace-nowrap">
                  <time dateTime={alert.createdAt}>{monitoringDate(alert.createdAt)}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
