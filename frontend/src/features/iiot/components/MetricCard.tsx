import type { IiotReading } from '../types';
import { METRIC_LABELS, monitoringDate } from '../presentation';

export function MetricCard({ reading }: { reading: IiotReading }) {
  return (
    <article className="surface min-w-0 space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{METRIC_LABELS[reading.metric]}</h3>
      <p className="break-words text-2xl font-semibold tabular-nums">
        {reading.value} <span className="text-sm font-normal">{reading.unit}</span>
      </p>
      <p className="text-sm">
        {reading.device.code} · {reading.device.name}
      </p>
      <dl className="space-y-1 text-xs text-muted-foreground">
        <div>
          <dt className="inline">Medición: </dt>
          <dd className="inline">
            <time dateTime={reading.recordedAt}>{monitoringDate(reading.recordedAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="inline">Recepción: </dt>
          <dd className="inline">
            <time dateTime={reading.receivedAt}>{monitoringDate(reading.receivedAt)}</time>
          </dd>
        </div>
      </dl>
    </article>
  );
}
