import type { IiotMetric } from './types';

export const METRIC_LABELS: Record<IiotMetric, string> = {
  TEMPERATURE: 'Temperatura',
  HUMIDITY: 'Humedad',
  PH: 'pH',
  TANK_LEVEL: 'Nivel de tanque',
  MIXER_RPM: 'RPM del mezclador',
};
const timestamp = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'medium',
  timeStyle: 'medium',
  hourCycle: 'h23',
});
const clock = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
export function monitoringDate(iso: string | null) {
  return iso ? timestamp.format(new Date(iso)) : '—';
}
export function monitoringTime(epoch: number) {
  return clock.format(new Date(epoch));
}
