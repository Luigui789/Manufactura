import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
import { useInspection, useInspectLot, useTraceability } from '../api/quality';

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

export function LotProductionDetail({ lotId, status }: { lotId: string; status: string }) {
  const session = useSession();
  const inspection = useInspection(lotId);
  const inspect = useInspectLot(lotId);
  const trace = useTraceability(lotId);
  const [confirm, setConfirm] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: { result: 'APPROVED', observations: '', nonConformities: '' },
  });
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  return (
    <div className="space-y-5">
      <h3 className="font-medium">Calidad</h3>
      {inspection.isPending && <p role="status">Cargando inspección…</p>}
      <ErrorNotice error={inspection.error} />
      {inspection.isError && (
        <Button variant="outline" onClick={() => void inspection.refetch()}>
          Reintentar inspección
        </Button>
      )}
      {inspection.data && (
        <div>
          <p>
            {inspection.data.result === 'APPROVED' ? 'Aprobado' : 'Rechazado'} ·{' '}
            {inspection.data.inspectedBy.fullName} ·{' '}
            {new Date(inspection.data.inspectedAt).toLocaleString('es-NI')}
          </p>
          <p>{inspection.data.observations}</p>
          <p>{inspection.data.nonConformities}</p>
        </div>
      )}
      {canManage && status === 'QUARANTINED' && inspection.isSuccess && !inspection.data && (
        <form
          aria-label="Inspeccionar lote"
          className="space-y-3"
          onChange={() => setConfirm(false)}
          onSubmit={form.handleSubmit((values) => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            inspect.mutate(
              { ...values, nonConformities: values.nonConformities || undefined },
              {
                onSuccess: () => {
                  setConfirm(false);
                  form.reset();
                },
                onError: () => setConfirm(false),
              },
            );
          })}
        >
          <label className="block">
            Resultado
            <select
              className="block rounded border p-2"
              {...form.register('result')}
              onChange={(event) => {
                void form.register('result').onChange(event);
                setConfirm(false);
              }}
            >
              <option value="APPROVED">Aprobar</option>
              <option value="REJECTED">Rechazar</option>
            </select>
          </label>
          <label className="block">
            Observaciones
            <Input {...form.register('observations')} />
          </label>
          <label className="block">
            No conformidades
            <Input {...form.register('nonConformities')} />
          </label>
          {form.formState.errors.observations && (
            <p role="alert">{form.formState.errors.observations.message}</p>
          )}
          {form.formState.errors.nonConformities && (
            <p role="alert">{form.formState.errors.nonConformities.message}</p>
          )}
          <ErrorNotice error={inspect.error} />
          {confirm && <p>Confirmá el resultado y el cambio de estado del lote.</p>}
          <Button type="submit" disabled={inspect.isPending}>
            {confirm ? 'Confirmar inspección' : 'Revisar inspección'}
          </Button>
          {confirm && (
            <Button
              type="button"
              variant="outline"
              disabled={inspect.isPending}
              onClick={() => setConfirm(false)}
            >
              Volver
            </Button>
          )}
        </form>
      )}
      <h3 className="font-medium">Trazabilidad</h3>
      {trace.isPending && <p role="status">Reconstruyendo trazabilidad…</p>}
      <ErrorNotice error={trace.error} />
      {trace.isError && (
        <Button variant="outline" onClick={() => void trace.refetch()}>
          Reintentar trazabilidad
        </Button>
      )}
      {trace.data?.lots.map((lot) => (
        <article className="space-y-1 rounded border p-3" key={lot.id}>
          <p>
            {lot.code} · {lot.product.code} {lot.product.name}
          </p>
          {lot.origin.type === 'PRODUCTION_ORDER' ? (
            <Link className="underline" to={`/production/orders/${lot.origin.productionOrder.id}`}>
              {lot.origin.productionOrder.number}
            </Link>
          ) : (
            <p>
              {lot.origin.purchaseReceipt.number} · {lot.origin.purchaseOrder.number} · Proveedor:{' '}
              {lot.origin.supplier.code} {lot.origin.supplier.name}
            </p>
          )}
          {lot.origin.type === 'PRODUCTION_ORDER' && lot.origin.bomVersion && (
            <p>BOM v{lot.origin.bomVersion.version}</p>
          )}
          {lot.consumptions.map((item) => (
            <p key={item.id}>
              {item.product.code} {item.product.name}: {item.quantity} {item.product.unit} ·{' '}
              {item.lotId
                ? trace.data?.lots.find((node) => node.id === item.lotId)?.code
                : 'Sin trazabilidad por lote'}
              {item.warehouse && <> · Almacén: {item.warehouse.code}</>}
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}
