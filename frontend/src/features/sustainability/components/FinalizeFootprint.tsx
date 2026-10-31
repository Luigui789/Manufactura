import { useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { type Footprint, useFinalizeFootprint } from '../api/sustainability';
import { kg } from '../labels';
import { finalizeSchema } from '../schemas';

/** Finalización en dos pasos: revisar resumen y confirmar. Nunca window.confirm. */
export function FinalizeFootprint({
  footprint,
  unitLabel,
}: {
  footprint: Footprint;
  unitLabel: string;
}) {
  const id = useId();
  const finalize = useFinalizeFootprint(footprint.productionOrderId);
  const [review, setReview] = useState<string | null>(null);
  const submitting = useRef(false);
  const form = useForm<{ boundaryNotes: string }>({
    resolver: zodResolver(finalizeSchema),
    defaultValues: { boundaryNotes: '' },
  });
  const blocked = footprint.missingFactors.length > 0;
  return (
    <form
      aria-label="Finalizar huella"
      className="space-y-4"
      noValidate
      onChange={() => setReview(null)}
      onSubmit={(event) => {
        void form.handleSubmit(({ boundaryNotes }) => {
          if (blocked || finalize.isPending || submitting.current) return;
          if (review !== boundaryNotes) {
            setReview(boundaryNotes);
            return;
          }
          submitting.current = true;
          finalize.mutate(boundaryNotes, {
            onError: () => setReview(null),
            onSettled: () => {
              submitting.current = false;
            },
          });
        })(event);
      }}
    >
      {blocked && (
        <p role="alert" className="text-sm text-destructive">
          No se puede finalizar: faltan factores para {footprint.missingFactors.length} producto(s)
          consumido(s).
        </p>
      )}
      <fieldset disabled={finalize.isPending || blocked} className="space-y-2">
        <Label htmlFor={id + '-notes'}>Límites del sistema (obligatorio)</Label>
        <textarea
          id={id + '-notes'}
          rows={4}
          maxLength={2000}
          aria-invalid={!!form.formState.errors.boundaryNotes}
          className="w-full rounded-md border bg-background p-3 text-sm"
          placeholder="Incluye materias primas consumidas, electricidad registrada manualmente… Excluye distribución, uso y fin de vida."
          {...form.register('boundaryNotes')}
        />
        {form.formState.errors.boundaryNotes && (
          <p className="text-sm text-destructive">{form.formState.errors.boundaryNotes.message}</p>
        )}
      </fieldset>
      {review !== null && (
        <div role="status" className="space-y-2 rounded-md border border-amber-300 p-4">
          <h3 className="font-semibold">Confirmar finalización</h3>
          <ul className="space-y-1 text-sm">
            <li>Actividades: {footprint.activities.length}</li>
            <li>Huella parcial total: {kg(footprint.totalKgCo2ePreview)}</li>
            <li>
              Intensidad: {kg(footprint.kgCo2ePerOutputUnitPreview)} / {unitLabel}
            </li>
          </ul>
          <p className="whitespace-pre-wrap text-sm">{review}</p>
          <p className="text-sm font-medium">Una huella finalizada no puede modificarse.</p>
          <p className="text-xs text-muted-foreground">
            El backend vuelve a sincronizar los consumos reales antes de finalizar.
          </p>
        </div>
      )}
      <ErrorNotice error={finalize.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={blocked || finalize.isPending}>
          {finalize.isPending
            ? 'Finalizando…'
            : review !== null
              ? 'Finalizar huella'
              : 'Revisar finalización'}
        </Button>
        {review !== null && (
          <Button type="button" variant="outline" onClick={() => setReview(null)}>
            Volver
          </Button>
        )}
      </div>
    </form>
  );
}
