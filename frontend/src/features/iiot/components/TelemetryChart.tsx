import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/erp';
import type { IiotMetric, IiotReading } from '../types';
import { METRIC_LABELS, monitoringDate, monitoringTime } from '../presentation';

export function TelemetryChart({
  metric,
  readings,
}: {
  metric: IiotMetric;
  readings: IiotReading[];
}) {
  // The API returns DESC. Copy before reversing so the Query cache stays untouched.
  const chronological = readings.slice(0, 100).reverse();
  const points = chronological.map((reading) => ({
    ...reading,
    timestamp: new Date(reading.recordedAt).getTime(),
    numericValue: Number(reading.value),
  }));
  const latest = chronological.at(-1);
  if (!latest) return <EmptyState title="No hay lecturas para esta métrica." />;
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        {points.length} lecturas · Último valor: {latest.value} {latest.unit} · Medición:{' '}
        {monitoringDate(latest.recordedAt)} · {latest.device.code}
      </p>
      <div
        className="h-72 min-w-0"
        role="group"
        aria-label={'Gráfica histórica de ' + METRIC_LABELS[metric]}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 600, height: 288 }}
        >
          <LineChart
            data={points}
            accessibilityLayer
            margin={{ top: 12, right: 16, bottom: 24, left: 8 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={monitoringTime}
              minTickGap={32}
              tick={{ fontSize: 11 }}
              label={{ value: 'Medición · Managua', position: 'insideBottom', offset: -18 }}
            />
            <YAxis width={70} tick={{ fontSize: 11 }} unit={' ' + latest.unit} />
            <Tooltip
              labelFormatter={(value) => monitoringDate(new Date(Number(value)).toISOString())}
              formatter={(_value, _name, item) => [
                item.payload.value + ' ' + item.payload.unit,
                METRIC_LABELS[metric],
              ]}
              contentStyle={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <Line
              type="linear"
              dataKey="numericValue"
              name={METRIC_LABELS[metric]}
              stroke="var(--foreground)"
              strokeWidth={2}
              dot={points.length === 1}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Ver lecturas en tabla</summary>
        <div className="mt-3 overflow-x-auto rounded-md border">
          <table>
            <caption className="sr-only">
              Histórico de {METRIC_LABELS[metric]} en orden cronológico
            </caption>
            <thead>
              <tr>
                <th scope="col">Medición · Managua</th>
                <th scope="col">Valor</th>
                <th scope="col">Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {chronological.map((reading) => (
                <tr key={reading.id}>
                  <td>{monitoringDate(reading.recordedAt)}</td>
                  <td className="tabular-nums">
                    {reading.value} {reading.unit}
                  </td>
                  <td>{reading.device.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
