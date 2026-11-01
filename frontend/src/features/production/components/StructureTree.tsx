import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import { StatusBadge } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { PRODUCT_TYPE_LABELS, PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import { formatStandardMinutes } from '../route-schemas';
import type { StructureComponent, StructureIssueCode, StructureNode } from '../api/structure';

const STRUCTURE_ISSUE_LABELS: Record<StructureIssueCode, string> = {
  PRODUCT_INACTIVE: 'Producto inactivo',
  MISSING_BOM: 'Falta fórmula (BOM)',
  BOM_INACTIVE: 'Fórmula inactiva',
  MISSING_ACTIVE_BOM_VERSION: 'No existe versión activa',
  EMPTY_BOM_VERSION: 'Versión activa sin componentes',
  MISSING_ROUTE: 'Falta ruta',
  ROUTE_INACTIVE: 'Ruta inactiva',
  NO_ROUTE_OPERATIONS: 'Ruta sin operaciones',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

/** Tarjeta de un producto fabricado; sus componentes se anidan con sangría y borde guía. */
export function StructureNodeCard({ node }: { node: StructureNode }) {
  const { product, bom, route } = node;
  const operations = [...(route?.operations ?? [])].sort(
    (a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id),
  );
  return (
    <article
      aria-label={'Estructura de ' + product.code}
      className="min-w-0 space-y-3 rounded-lg border bg-card p-3 sm:p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{product.name}</h3>
          <p className="text-xs text-muted-foreground">{product.code}</p>
        </div>
        <StatusBadge status={node.readiness} />
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Tipo">{PRODUCT_TYPE_LABELS[product.type]}</Field>
        <Field label="Unidad">{PRODUCT_UNIT_LABELS[product.unit]}</Field>
        <Field label="Fórmula">
          {bom ? (
            <>
              {bom.name}
              {bom.activeVersion
                ? ' · v' +
                  bom.activeVersion.version +
                  ' · ' +
                  bom.activeVersion.outputQuantity +
                  ' ' +
                  PRODUCT_UNIT_LABELS[product.unit]
                : ''}
            </>
          ) : (
            'Sin fórmula'
          )}
        </Field>
        <Field label="Ruta">
          {route
            ? route.name +
              ' · ' +
              route.operationCount +
              (route.operationCount === 1 ? ' operación' : ' operaciones') +
              ' · ' +
              formatStandardMinutes(route.totalStandardMinutes)
            : 'Sin ruta'}
        </Field>
      </dl>
      {node.issues.length > 0 && (
        <ul aria-label={'Pendientes de ' + product.code} className="flex flex-wrap gap-2">
          {node.issues.map((issue) => (
            <li key={issue.code} className="status-badge status-warning" title={issue.message}>
              <TriangleAlert aria-hidden className="size-3.5" />
              {STRUCTURE_ISSUE_LABELS[issue.code]}
            </li>
          ))}
        </ul>
      )}
      {operations.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Operaciones de la ruta ({operations.length})
          </summary>
          <ol aria-label={'Operaciones de ' + product.code} className="mt-2 space-y-1">
            {operations.map((op) => (
              <li key={op.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {op.sequence} · {op.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatStandardMinutes(op.standardMinutes)}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {(bom || route) && (
        <div className="flex flex-wrap gap-2">
          {bom && (
            <Button asChild size="sm" variant="outline">
              <Link to={'/production/boms/' + bom.id}>Ver BOM</Link>
            </Button>
          )}
          {route && (
            <Button asChild size="sm" variant="outline">
              <Link to={'/production/routes/' + route.id}>Ver ruta</Link>
            </Button>
          )}
        </div>
      )}
      {node.components.length > 0 && (
        <ul
          aria-label={'Componentes de ' + product.code}
          className="ml-1 space-y-3 border-l pl-3 sm:ml-2 sm:pl-5"
        >
          {node.components.map((component) => (
            <ComponentItem key={component.product.id} component={component} />
          ))}
        </ul>
      )}
    </article>
  );
}

function ComponentItem({ component }: { component: StructureComponent }) {
  const label =
    component.product.name + ' — ' + component.quantity + ' ' + PRODUCT_UNIT_LABELS[component.unit];
  return (
    <li className="min-w-0 space-y-2">
      <p className="break-words text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {' · '}
          {component.product.code} · {PRODUCT_TYPE_LABELS[component.type]}
        </span>
      </p>
      {component.child && <StructureNodeCard node={component.child} />}
    </li>
  );
}
