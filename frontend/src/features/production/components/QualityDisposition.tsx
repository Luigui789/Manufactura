import { useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { DetailGrid, FormSection, LoadingState, StatusBadge } from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import {
  useQualityDisposition,
  useCreateQualityDisposition,
  type Inspection,
  type QualityDispositionType,
} from '../api/quality';
const DISPOSITION_LABELS: Record<QualityDispositionType, string> = {
  RELEASE: 'Liberar excepcionalmente',
  REWORK: 'Enviar a reproceso',
  SCRAP: 'Descartar lote',
};
const explanation: Record<QualityDispositionType, string> = {
  RELEASE:
    'La inspección original permanecerá rechazada. Esta acción libera el lote mediante una disposición explícita.',
  REWORK:
    'El lote quedará bloqueado para consumo y despacho hasta que exista un flujo posterior de reproceso.',
  SCRAP: 'Se descartará el saldo restante del lote y se retirará del inventario.',
};
const finalStatus = { RELEASE: 'RELEASED', REWORK: 'REWORK', SCRAP: 'SCRAPPED' } as const;
const schema = z.object({
  type: z.enum(['RELEASE', 'REWORK', 'SCRAP']),
  reason: z.string().trim().min(1, 'Indica el motivo de la disposición').max(1000),
});
type Values = z.infer<typeof schema>;
export function QualityDispositionPanel({
  lotId,
  status,
  inspection,
}: {
  lotId: string;
  status: string;
  inspection: Inspection | null | undefined;
}) {
  const id = useId();
  const session = useSession();
  const query = useQualityDisposition(lotId);
  const mutation = useCreateQualityDisposition(lotId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'RELEASE', reason: '' },
  });
  const type = useWatch({ control: form.control, name: 'type' });
  const reason = useWatch({ control: form.control, name: 'reason' });
  const [review, setReview] = useState<string | null>(null);
  const submitting = useRef(false);
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const disposition = query.data ?? mutation.data;
  return (
    <FormSection
      title="Disposición de calidad"
      description="Decisión humana posterior a una inspección rechazada. La disposición es definitiva."
    >
      {query.isPending && <LoadingState label="Cargando disposición…" />}
      <ErrorNotice error={query.error} />
      {query.isError && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Reintentar disposición
        </Button>
      )}
      {disposition ? (
        <div className="space-y-4">
          <DetailGrid>
            <div>
              <dt>Acción</dt>
              <dd>{DISPOSITION_LABELS[disposition.type]}</dd>
            </div>
            <div>
              <dt>Motivo</dt>
              <dd className="whitespace-pre-wrap">{disposition.reason}</dd>
            </div>
            <div>
              <dt>Decidido por</dt>
              <dd>{disposition.decidedBy.fullName}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>
                {new Date(disposition.decidedAt).toLocaleString('es-NI', {
                  timeZone: 'America/Managua',
                })}
              </dd>
            </div>
            <div>
              <dt>Estado final del lote</dt>
              <dd>
                <StatusBadge status={finalStatus[disposition.type]} />
              </dd>
            </div>
          </DetailGrid>
          {disposition.type === 'RELEASE' && (
            <p role="status">
              Inspección rechazada · Liberado posteriormente por disposición. La inspección
              permanece REJECTED; el lote fue liberado posteriormente mediante disposición.
            </p>
          )}
        </div>
      ) : query.isSuccess && inspection?.result === 'REJECTED' && status === 'REJECTED' ? (
        <div className="space-y-4">
          <p>Pendiente de disposición</p>
          {canManage && (
            <form
              aria-label="Disponer lote rechazado"
              className="space-y-4"
              noValidate
              onChange={() => setReview(null)}
              onSubmit={(event) => {
                void form.handleSubmit((values) => {
                  if (mutation.isPending || submitting.current) return;
                  const snapshot = JSON.stringify(values);
                  if (review !== snapshot) {
                    setReview(snapshot);
                    return;
                  }
                  submitting.current = true;
                  mutation.mutate(values, {
                    onError: () => setReview(null),
                    onSettled: () => {
                      submitting.current = false;
                    },
                  });
                })(event);
              }}
            >
              <fieldset disabled={mutation.isPending} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={id + '-type'}>Disposición</Label>
                  <select
                    id={id + '-type'}
                    className="h-10 w-full rounded-md border bg-background px-3 sm:max-w-sm"
                    {...form.register('type')}
                  >
                    {Object.entries(DISPOSITION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="rounded-md border bg-muted/30 p-4 text-sm">{explanation[type]}</p>
                <FormField
                  id={id + '-reason'}
                  label="Motivo de disposición"
                  required
                  maxLength={1000}
                  error={form.formState.errors.reason?.message}
                  {...form.register('reason')}
                />
                {review && (
                  <div className="space-y-2 rounded-md border p-4" role="status">
                    <h3 className="font-semibold">Confirmar disposición definitiva</h3>
                    <p>{DISPOSITION_LABELS[type]}</p>
                    <p className="whitespace-pre-wrap">{reason}</p>
                    <p className="text-sm">
                      Esta decisión no se puede editar. Confirma la acción y su justificación.
                    </p>
                  </div>
                )}
                <ErrorNotice error={mutation.error} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant={review && type === 'SCRAP' ? 'destructive' : 'default'}
                  >
                    {mutation.isPending
                      ? 'Registrando disposición…'
                      : review
                        ? 'Confirmar disposición'
                        : 'Revisar disposición'}
                  </Button>
                  {review && (
                    <Button type="button" variant="outline" onClick={() => setReview(null)}>
                      Volver
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
        </div>
      ) : (
        query.isSuccess && (
          <p className="text-sm text-muted-foreground">
            No hay una disposición registrada para este lote.
          </p>
        )
      )}
    </FormSection>
  );
}
