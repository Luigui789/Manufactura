import { useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import {
  DetailGrid,
  EmptyState,
  FormSection,
  LoadingState,
  StatusBadge,
  SuccessNotice,
} from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import { QualityIiotContext } from '@/features/iiot/components/QualityIiotContext';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import type { Product } from '@/features/inventory/types';
import { useInspection, useInspectLot, useTraceability, type Traceability } from '../api/quality';

const inspectionSchema = z
  .object({
    result: z.enum(['APPROVED', 'REJECTED']),
    observations: z.string().trim().min(1, 'Describe la inspección').max(1000),
    nonConformities: z.string().trim().max(1000),
  })
  .refine((value) => value.result !== 'REJECTED' || value.nonConformities.length > 0, {
    path: ['nonConformities'],
    message: 'Describe las no conformidades del rechazo',
  });
type Values = z.infer<typeof inspectionSchema>;
const unitLabel = (unit: string) => PRODUCT_UNIT_LABELS[unit as Product['unit']] ?? 'Unidad';

function TraceabilityTree({ trace }: { trace: Traceability }) {
  const prefix = useId();
  const nodes = new Map(trace.lots.map((lot) => [lot.id, lot]));
  const shown = new Set<string>();
  const nodeId = (id: string) => prefix + '-lot-' + id;
  const reveal = (id: string) => {
    const target = document.getElementById(nodeId(id));
    let ancestor: HTMLElement | null = target;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    target?.querySelector('summary')?.focus();
    target?.scrollIntoView?.({ block: 'nearest' });
  };
  function renderNode(id: string, ancestors: Set<string>): ReactNode {
    const lot = nodes.get(id);
    if (!lot)
      return (
        <p className="text-sm text-muted-foreground">
          El detalle de este lote no está disponible en la trazabilidad.
        </p>
      );
    if (ancestors.has(id) || shown.has(id))
      return (
        <p className="text-sm">
          {ancestors.has(id) ? 'Referencia circular detectada' : 'Lote compartido con otra rama'} ·{' '}
          <a
            className="font-medium underline underline-offset-4"
            href={'#' + nodeId(id)}
            onClick={(event) => {
              event.preventDefault();
              reveal(id);
            }}
          >
            Ver {lot.code}
          </a>
          <span className="text-muted-foreground"> · El origen se muestra una sola vez.</span>
        </p>
      );
    shown.add(id);
    const path = new Set(ancestors).add(id);
    return (
      <details
        id={nodeId(id)}
        open={id === trace.rootLotId}
        className="rounded-md border bg-background"
      >
        <summary className="cursor-pointer px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="font-semibold">{lot.code}</span>
          <span className="ml-2 text-muted-foreground">
            {lot.product.code} · {lot.product.name}
          </span>
          {lot.status && (
            <span className="ml-3 inline-flex">
              <StatusBadge status={lot.status} />
            </span>
          )}
          {id === trace.rootLotId && (
            <span className="ml-3 text-xs text-muted-foreground">Lote consultado</span>
          )}
        </summary>
        <div className="space-y-4 border-t px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Origen del lote</p>
            <Link
              className="text-sm underline underline-offset-4"
              to={'/inventory/lots?lotId=' + lot.id}
            >
              Ver detalle de {lot.code}
            </Link>
          </div>
          {lot.origin.type === 'PRODUCTION_ORDER' ? (
            <div className="space-y-1 text-sm">
              <p>
                Orden de producción:{' '}
                <Link
                  className="font-medium underline underline-offset-4"
                  to={'/production/orders/' + lot.origin.productionOrder.id}
                >
                  {lot.origin.productionOrder.number}
                </Link>
              </p>
              {lot.origin.bomVersion && (
                <p className="text-muted-foreground">
                  Fórmula · versión {lot.origin.bomVersion.version}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p>
                Recepción {lot.origin.purchaseReceipt.number} ·{' '}
                <Link
                  className="font-medium underline underline-offset-4"
                  to={'/purchases/orders/' + lot.origin.purchaseOrder.id}
                >
                  {lot.origin.purchaseOrder.number}
                </Link>
              </p>
              <p>
                Proveedor: {lot.origin.supplier.code} {lot.origin.supplier.name}
              </p>
            </div>
          )}
          {lot.consumptions.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">
                Materiales consumidos para fabricar este lote
              </h4>
              <ul className="space-y-4 border-l pl-3 sm:pl-5">
                {lot.consumptions.map((item) => (
                  <li key={item.id} className="space-y-2">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span>
                        <span className="font-medium">{item.product.code}</span> ·{' '}
                        {item.product.name}
                      </span>
                      <span className="tabular-nums">
                        {item.quantity} {unitLabel(item.product.unit)}
                      </span>
                    </div>
                    {item.warehouse && (
                      <p className="text-xs text-muted-foreground">
                        Almacén: {item.warehouse.code} · {item.warehouse.name}
                      </p>
                    )}
                    {item.lotId ? (
                      renderNode(item.lotId, path)
                    ) : (
                      <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                        Sin trazabilidad por lote. Este componente se consumió directamente del
                        almacén; no se registra un origen físico por lote.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {lot.origin.type === 'PURCHASE_RECEIPT'
                ? 'El origen de esta rama es la recepción del proveedor.'
                : 'Esta orden no registra consumos asociados en la trazabilidad.'}
            </p>
          )}
          <section className="space-y-3" aria-label={'Despachos de venta del lote ' + lot.code}>
            <h4 className="text-sm font-semibold">Despachos de venta</h4>
            {(lot.outbound ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este lote no tiene despachos de venta registrados.
              </p>
            ) : (
              <ul className="space-y-3">
                {(lot.outbound ?? []).map((dispatch) => (
                  <li key={dispatch.id} className="rounded-md border p-3 text-sm">
                    <p>
                      Despacho <span className="font-medium">{dispatch.dispatchNumber}</span> ·
                      Orden de venta{' '}
                      <Link
                        className="font-medium underline underline-offset-4"
                        to={'/sales/orders/' + dispatch.saleOrder.id}
                      >
                        {dispatch.saleOrder.number}
                      </Link>
                    </p>
                    <p>
                      Cliente: {dispatch.saleOrder.customer.code} ·{' '}
                      {dispatch.saleOrder.customer.name}
                    </p>
                    <p className="tabular-nums">
                      Cantidad despachada: {dispatch.quantity} {unitLabel(lot.product.unit)}
                    </p>
                    <p className="text-muted-foreground">
                      Almacén: {dispatch.warehouse.code} · {dispatch.warehouse.name}
                    </p>
                    <p className="text-muted-foreground">
                      Fecha · Managua:{' '}
                      {new Date(dispatch.dispatchedAt).toLocaleString('es-NI', {
                        timeZone: 'America/Managua',
                      })}
                    </p>
                    <p className="text-muted-foreground">
                      Responsable: {dispatch.performedByUser.fullName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </details>
    );
  }
  if (!nodes.has(trace.rootLotId))
    return (
      <EmptyState
        title="No hay un origen disponible para este lote."
        description="La consulta no contiene el lote de origen. Podés volver a consultar la trazabilidad."
      />
    );
  return <div className="space-y-3">{renderNode(trace.rootLotId, new Set())}</div>;
}

export function LotProductionDetail({
  lotId,
  status,
  productionOrderId,
}: {
  lotId: string;
  status: string;
  productionOrderId?: string;
}) {
  const id = useId();
  const session = useSession();
  const inspection = useInspection(lotId);
  const inspect = useInspectLot(lotId);
  const trace = useTraceability(lotId);
  const [confirm, setConfirm] = useState(false);
  const reviewed = useRef<string | null>(null);
  const submitting = useRef(false);
  const form = useForm<Values>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: { result: 'APPROVED', observations: '', nonConformities: '' },
  });
  const result = useWatch({ control: form.control, name: 'result' });
  const observations = useWatch({ control: form.control, name: 'observations' });
  const nonConformities = useWatch({ control: form.control, name: 'nonConformities' });
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const resetReview = () => {
    reviewed.current = null;
    setConfirm(false);
  };
  return (
    <div className="space-y-6">
      <FormSection
        title="Calidad"
        description="Consultá la inspección y el estado de disponibilidad del lote fabricado."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Estado del lote</span>
          <StatusBadge status={status} />
        </div>
        {productionOrderId && <QualityIiotContext productionOrderId={productionOrderId} />}
        {inspection.isPending && <LoadingState label="Cargando inspección…" />}
        <ErrorNotice error={inspection.error} />
        {inspection.isError && (
          <Button variant="outline" onClick={() => void inspection.refetch()}>
            Reintentar inspección
          </Button>
        )}
        {inspect.isSuccess && (
          <SuccessNotice>Inspección registrada. Se actualizó el estado del lote.</SuccessNotice>
        )}
        {inspection.data && (
          <div className="space-y-4">
            <DetailGrid>
              <div>
                <dt>Resultado</dt>
                <dd>
                  <StatusBadge status={inspection.data.result} />
                </dd>
              </div>
              <div>
                <dt>Responsable</dt>
                <dd>{inspection.data.inspectedBy.fullName}</dd>
              </div>
              <div>
                <dt>Fecha de inspección · Managua</dt>
                <dd>
                  {new Date(inspection.data.inspectedAt).toLocaleString('es-NI', {
                    timeZone: 'America/Managua',
                  })}
                </dd>
              </div>
            </DetailGrid>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Observaciones</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {inspection.data.observations}
              </p>
            </div>
            {inspection.data.nonConformities && (
              <div className="space-y-1">
                <h3 className="text-sm font-medium">No conformidades</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {inspection.data.nonConformities}
                </p>
              </div>
            )}
          </div>
        )}
        {inspection.isSuccess && !inspection.data && (
          <p className="text-sm text-muted-foreground">
            {status === 'QUARANTINED'
              ? canManage
                ? 'Este lote está pendiente de inspección. Registrá el resultado para liberarlo o rechazarlo.'
                : 'Este lote está pendiente de inspección por una persona de Producción o Administración.'
              : 'Este lote no tiene una inspección registrada.'}
          </p>
        )}
        {canManage && status === 'QUARANTINED' && inspection.isSuccess && !inspection.data && (
          <form
            aria-label="Inspeccionar lote"
            className="space-y-4"
            noValidate
            onChange={resetReview}
            onSubmit={(event) => {
              void form.handleSubmit((values) => {
                if (inspect.isPending || submitting.current) return;
                const snapshot = JSON.stringify(values);
                if (!confirm || reviewed.current !== snapshot) {
                  reviewed.current = snapshot;
                  setConfirm(true);
                  return;
                }
                submitting.current = true;
                inspect.mutate(
                  { ...values, nonConformities: values.nonConformities || undefined },
                  {
                    onSuccess: () => {
                      resetReview();
                      form.reset();
                    },
                    onError: resetReview,
                    onSettled: () => {
                      submitting.current = false;
                    },
                  },
                );
              })(event);
            }}
          >
            <fieldset disabled={inspect.isPending} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={id + '-result'}>
                  Resultado <span aria-hidden="true">*</span>
                </Label>
                <select
                  id={id + '-result'}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-sm"
                  aria-describedby={id + '-result-help'}
                  {...form.register('result')}
                >
                  <option value="APPROVED">Aprobar</option>
                  <option value="REJECTED">Rechazar</option>
                </select>
                <p id={id + '-result-help'} className="text-sm text-muted-foreground">
                  {result === 'REJECTED'
                    ? 'El lote pasará a Rechazado y no podrá consumirse en producción.'
                    : 'El lote pasará a Liberado y podrá consumirse cuando tenga existencia disponible.'}
                </p>
              </div>
              <FormField
                id={id + '-observations'}
                label="Observaciones"
                aria-label="Observaciones"
                required
                maxLength={1000}
                helper="Describí la revisión realizada y su resultado. Hasta 1000 caracteres."
                error={form.formState.errors.observations?.message}
                {...form.register('observations')}
              />
              <FormField
                id={id + '-nonconformities'}
                label="No conformidades"
                aria-label="No conformidades"
                required={result === 'REJECTED'}
                maxLength={1000}
                helper={
                  result === 'REJECTED'
                    ? 'Explicá los defectos que justifican el rechazo. Este dato es obligatorio para rechazar.'
                    : 'Opcional al aprobar. Registrá cualquier observación de conformidad que corresponda.'
                }
                error={form.formState.errors.nonConformities?.message}
                {...form.register('nonConformities')}
              />
              <ErrorNotice error={inspect.error} />
              {confirm && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                  <h3 className="font-semibold">
                    {result === 'REJECTED' ? 'Rechazar lote' : 'Aprobar y liberar lote'}
                  </h3>
                  <p className="text-sm">
                    {result === 'REJECTED'
                      ? 'El lote dejará la cuarentena y quedará rechazado. No estará disponible para consumir en producción.'
                      : 'El lote dejará la cuarentena y quedará liberado para consumir en producción.'}{' '}
                    La inspección quedará registrada con tu usuario.
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    <span className="font-medium">Observaciones: </span>
                    {observations}
                  </p>
                  {nonConformities && (
                    <p className="whitespace-pre-wrap text-sm">
                      <span className="font-medium">No conformidades: </span>
                      {nonConformities}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant={confirm && result === 'REJECTED' ? 'destructive' : 'default'}
                  disabled={inspect.isPending}
                >
                  {inspect.isPending
                    ? 'Registrando inspección…'
                    : confirm
                      ? 'Confirmar inspección'
                      : 'Revisar inspección'}
                </Button>
                {confirm && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={inspect.isPending}
                    onClick={resetReview}
                  >
                    Volver
                  </Button>
                )}
              </div>
            </fieldset>
          </form>
        )}
      </FormSection>
      <FormSection
        title="Trazabilidad"
        description="Seguí el origen del lote y desplegá los materiales usados hasta llegar a sus órdenes anteriores o proveedores."
      >
        {trace.isPending && <LoadingState label="Reconstruyendo trazabilidad…" />}
        <ErrorNotice error={trace.error} />
        {trace.isError && (
          <Button variant="outline" onClick={() => void trace.refetch()}>
            Reintentar trazabilidad
          </Button>
        )}
        {trace.data && <TraceabilityTree trace={trace.data} />}
      </FormSection>
    </div>
  );
}
