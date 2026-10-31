import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorNotice } from '@/components/ErrorNotice';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  CARBON_CATEGORIES,
  type CarbonActivity,
  useAddManualActivity,
  useEmissionFactors,
  useUpdateManualActivity,
} from '../api/sustainability';
import { CATEGORY_LABELS, trimDecimal, UNIT_SYMBOLS } from '../labels';
import { manualActivitySchema, type ManualActivityForm as Values } from '../schemas';

/**
 * Actividad manual: la unidad nunca la elige el usuario; se toma del factor.
 * Se ofrecen solo factores activos sin producto (los asociados a producto se
 * aplican automáticamente desde el ledger).
 */
export function ManualActivityForm({
  orderId,
  activity,
  onDone,
}: {
  orderId: string;
  activity?: CarbonActivity;
  onDone: () => void;
}) {
  const id = useId();
  const add = useAddManualActivity(orderId);
  const update = useUpdateManualActivity(orderId);
  const mutation = activity ? update : add;
  const form = useForm<Values>({
    resolver: zodResolver(manualActivitySchema),
    defaultValues: {
      category: activity?.category ?? 'ENERGY',
      emissionFactorId: activity?.emissionFactorId ?? '',
      description: activity?.description ?? '',
      quantity: activity ? trimDecimal(activity.activityQuantity, 0) : '',
    },
  });
  const category = useWatch({ control: form.control, name: 'category' });
  const factorId = useWatch({ control: form.control, name: 'emissionFactorId' });
  const factors = useEmissionFactors({ page: 1, limit: 100, category, isActive: true });
  const options = (factors.data?.data ?? []).filter((factor) => !factor.productId);
  const selected = options.find((factor) => factor.id === factorId);
  const keepsSnapshot = !!activity && factorId === activity.emissionFactorId;
  const errors = form.formState.errors;
  const submit = form.handleSubmit((values) => {
    const payload = {
      description: values.description,
      quantity: values.quantity,
      ...(keepsSnapshot ? {} : { emissionFactorId: values.emissionFactorId }),
    };
    if (activity) update.mutate({ id: activity.id, ...payload }, { onSuccess: onDone });
    else
      add.mutate(
        { ...payload, emissionFactorId: values.emissionFactorId },
        {
          onSuccess: () => {
            form.reset({
              category: values.category,
              emissionFactorId: '',
              description: '',
              quantity: '',
            });
            onDone();
          },
        },
      );
  });
  return (
    <form
      aria-label={activity ? 'Editar actividad manual' : 'Nueva actividad manual'}
      className="space-y-4 rounded-lg border p-4"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={mutation.isPending} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={id + '-category'}>Categoría</Label>
          <select
            id={id + '-category'}
            className="h-10 w-full rounded-md border bg-background px-3"
            {...form.register('category', {
              onChange: () => form.setValue('emissionFactorId', ''),
            })}
          >
            {CARBON_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
                {value === 'RAW_MATERIAL' ? ' (manual)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id + '-factor'}>Factor</Label>
          <select
            id={id + '-factor'}
            aria-invalid={!!errors.emissionFactorId}
            className="h-10 w-full rounded-md border bg-background px-3"
            {...form.register('emissionFactorId')}
          >
            <option value="">
              {factors.isPending ? 'Cargando factores…' : 'Selecciona un factor'}
            </option>
            {activity && keepsSnapshot && !selected && (
              <option value={activity.emissionFactorId}>
                {activity.factorCodeSnapshot} · {activity.factorNameSnapshot} (snapshot)
              </option>
            )}
            {options.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.code} · {factor.name}
              </option>
            ))}
          </select>
          {errors.emissionFactorId && (
            <p className="text-sm text-destructive">{errors.emissionFactorId.message}</p>
          )}
          {factors.isSuccess && options.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay factores activos de esta categoría. Administración debe configurarlos.
            </p>
          )}
        </div>
        <FormField
          id={id + '-description'}
          label="Descripción"
          required
          maxLength={250}
          error={errors.description?.message}
          {...form.register('description')}
        />
        <FormField
          id={id + '-quantity'}
          label={`Cantidad${selected ? ` (${UNIT_SYMBOLS[selected.activityUnit]})` : ''}`}
          required
          inputMode="decimal"
          error={errors.quantity?.message}
          {...form.register('quantity')}
        />
      </fieldset>
      {selected ? (
        <dl
          aria-label="Factor seleccionado"
          className="grid gap-2 rounded-md bg-muted/30 p-3 text-sm sm:grid-cols-3"
        >
          <div>
            <dt className="text-muted-foreground">Unidad</dt>
            <dd>{UNIT_SYMBOLS[selected.activityUnit]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Coeficiente</dt>
            <dd>
              {trimDecimal(selected.kgCo2ePerUnit)} kg CO₂e/{UNIT_SYMBOLS[selected.activityUnit]}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fuente</dt>
            <dd>
              {selected.sourceName}
              {selected.sourceYear ? ` (${selected.sourceYear})` : ''} · {selected.sourceReference}
            </dd>
          </div>
        </dl>
      ) : (
        keepsSnapshot &&
        activity && (
          <p className="text-sm text-muted-foreground">
            Se conserva el snapshot del factor {activity.factorCodeSnapshot}:{' '}
            {trimDecimal(activity.factorValueSnapshot)} kg CO₂e/
            {UNIT_SYMBOLS[activity.activityUnit]}.
          </p>
        )
      )}
      <ErrorNotice error={mutation.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : activity ? 'Guardar actividad' : 'Agregar actividad'}
        </Button>
        {activity && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
