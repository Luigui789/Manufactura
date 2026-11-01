import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ChevronRight, Circle, CircleAlert, PackageOpen } from 'lucide-react';
import { Button } from './ui/button';

export function PageHeader({
  title,
  description,
  actions,
  status,
  breadcrumbs,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <header className="page-header">
      {breadcrumbs && (
        <nav aria-label="Ruta de navegación">
          <ol className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {breadcrumbs.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                {index > 0 && <ChevronRight aria-hidden className="size-3" />}
                {item.to ? (
                  <Link className="hover:text-foreground hover:underline" to={item.to}>
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            {status}
          </div>
          {description && (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

const states: Record<string, [string, 'neutral' | 'success' | 'warning' | 'danger']> = {
  DRAFT: ['Borrador', 'neutral'],
  CONFIRMED: ['Confirmada', 'neutral'],
  PARTIALLY_RECEIVED: ['Recepción parcial', 'warning'],
  RECEIVED: ['Recibida', 'success'],
  CANCELLED: ['Cancelada', 'danger'],
  PARTIALLY_DISPATCHED: ['Parcialmente despachada', 'warning'],
  DISPATCHED: ['Despachada', 'success'],
  IN_PROGRESS: ['En producción', 'warning'],
  COMPLETED: ['Completada', 'success'],
  RELEASED: ['Liberado', 'success'],
  QUARANTINED: ['En cuarentena', 'warning'],
  REJECTED: ['Rechazado', 'danger'],
  REWORK: ['Reproceso', 'warning'],
  SCRAPPED: ['Descartado', 'danger'],
  APPROVED: ['Aprobado', 'success'],
  ACTIVE: ['Activo', 'success'],
  INACTIVE: ['Inactivo', 'neutral'],
  HISTORICAL: ['Histórica', 'neutral'],
  FINALIZED: ['Finalizado', 'success'],
  READY: ['Listo', 'success'],
  INCOMPLETE: ['Incompleto', 'warning'],
};
export function StatusBadge({ status }: { status: string | boolean }) {
  const [label, tone] = states[
    typeof status === 'boolean' ? (status ? 'ACTIVE' : 'INACTIVE') : status
  ] ?? [status, 'neutral'];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? CircleAlert : Circle;
  return (
    <span className={`status-badge status-${tone}`}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div aria-hidden className="space-y-2 motion-safe:animate-pulse">
        <div className="h-9 rounded bg-muted" />
        <div className="h-12 rounded bg-muted/60" />
        <div className="h-12 rounded bg-muted/40" />
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <PackageOpen aria-hidden className="size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
export function Pagination({
  page,
  pages,
  total,
  label,
  onPageChange,
  busy,
  unavailable,
}: {
  page: number;
  pages: number;
  total?: number;
  label: string;
  onPageChange: (page: number) => void;
  busy?: boolean;
  unavailable?: boolean;
}) {
  if (pages <= 1)
    return total === undefined ? null : (
      <p className="py-2 text-sm text-muted-foreground" aria-live="polite">
        {total} resultados
      </p>
    );
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
    >
      <span className="text-sm text-muted-foreground" aria-live="polite">
        Página {page} de {pages}
        {total !== undefined && ` · ${total} resultados`}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || unavailable || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
export function EntitySummary({
  label,
  children,
  onChange,
}: {
  label: string;
  children: ReactNode;
  onChange?: () => void;
}) {
  return (
    <div className="entity-summary">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 aria-hidden className="size-4" />
          {label}
        </p>
        {onChange && (
          <Button type="button" variant="outline" onClick={onChange}>
            Cambiar
          </Button>
        )}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="detail-grid">{children}</dl>;
}
export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-900"
    >
      <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
