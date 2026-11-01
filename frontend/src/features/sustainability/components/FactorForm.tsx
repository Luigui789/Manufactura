import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CatalogPicker } from '@/components/CatalogPicker';
import { ErrorNotice } from '@/components/ErrorNotice';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  CARBON_CATEGORIES,
  CARBON_UNITS,
  type EmissionFactor,
  useCreateFactor,
  useUpdateFactor,
} from '../api/sustainability';
import { CATEGORY_LABELS, UNIT_SYMBOLS } from '../labels';
import { factorSchema, type FactorForm as Values } from '../schemas';

export type FactorPrefill = { productId: string; productLabel: string };

/**
 * Alta o edición de un factor (solo ADMIN). En edición, código, producto,
 * categoría y unidad quedan bloqueados: definen la identidad del factor.
 */
export function FactorForm({
  factor,
  prefill,
  onDone,
}: {
  factor?: EmissionFactor;
  prefill?: FactorPrefill;
  onDone: (factor: EmissionFactor) => void;
}) {
  const id = useId();
  const create = useCreateFactor();
  const update = useUpdateFactor(factor?.id ?? '');
  const mutation = factor ? update : create;
  const form = useForm<Values>({
    resolver: zodResolver(factorSchema),
    defaultValues: {
      code: factor?.code ?? '',
      name: factor?.name ?? '',
      category: factor?.category ?? 'RAW_MATERIAL',
      activityUnit: factor?.activityUnit ?? 'KILOGRAM',
      kgCo2ePerUnit: factor?.kgCo2ePerUnit ?? '',
      productId: factor?.productId ?? prefill?.productId ?? '',
      sourceName: factor?.sourceName ?? '',
      sourceReference: factor?.sourceReference ?? '',
      sourceYear: factor?.sourceYear ? String(factor.sourceYear) : '',
      notes: factor?.notes ?? '',
    },
  });
  const errors = form.formState.errors;
  const productId = useWatch({ control: form.control, name: 'productId' });
  const submit = form.handleSubmit((values) => {
    const common = {
      name: values.name,
      kgCo2ePerUnit: values.kgCo2ePerUnit,
      sourceName: values.sourceName,
      sourceReference: values.sourceReference,
      sourceYear: values.sourceYear ? Number(values.sourceYear) : null,
      notes: values.notes || null,
    };
    if (factor) update.mutate(common, { onSuccess: onDone });
    else
      create.mutate(
        {
          ...common,
          code: values.code,
          category: values.category,
          activityUnit: values.activityUnit,
          productId: values.productId || null,
        },
        { onSuccess: onDone },
      );
  });
  return (
    <form
      aria-label={factor ? 'Editar factor de emisión' : 'Nuevo factor de emisión'}
      className="space-y-4 rounded-lg border p-4"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <h2 className="text-base font-semibold">
        {factor ? `Editar factor ${factor.code}` : 'Nuevo factor de emisión'}
      </h2>
      <p className="text-sm text-muted-foreground">
        Todo coeficiente necesita una fuente reproducible. No registres valores sin documentar ni
        coeficientes negativos: C3 no modela emisiones evitadas.
      </p>
      <fieldset disabled={mutation.isPending} className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={id + '-code'}
          label="Código"
          required
          disabled={!!factor}
          maxLength={50}
          error={errors.code?.message}
          {...form.register('code')}
        />
        <FormField
          id={id + '-name'}
          label="Nombre"
          required
          maxLength={150}
          error={errors.name?.message}
          {...form.register('name')}
        />
        <div className="space-y-2">
          <Label htmlFor={id + '-category'}>Categoría</Label>
          <select
            id={id + '-category'}
            disabled={!!factor}
            className="h-10 w-full rounded-md border bg-background px-3"
            {...form.register('category')}
          >
            {CARBON_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id + '-unit'}>Unidad de actividad</Label>
          <select
            id={id + '-unit'}
            disabled={!!factor}
            className="h-10 w-full rounded-md border bg-background px-3"
            {...form.register('activityUnit')}
          >
            {CARBON_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_SYMBOLS[unit]}
              </option>
            ))}
          </select>
        </div>
        <FormField
          id={id + '-value'}
          label="Coeficiente (kg CO₂e por unidad)"
          required
          inputMode="decimal"
          error={errors.kgCo2ePerUnit?.message}
          {...form.register('kgCo2ePerUnit')}
        />
        <FormField
          id={id + '-year'}
          label="Año de la fuente"
          inputMode="numeric"
          error={errors.sourceYear?.message}
          {...form.register('sourceYear')}
        />
        <FormField
          id={id + '-source'}
          label="Fuente"
          required
          maxLength={200}
          error={errors.sourceName?.message}
          {...form.register('sourceName')}
        />
        <FormField
          id={id + '-reference'}
          label="Referencia reproducible (documento, tabla o URL)"
          required
          maxLength={1000}
          error={errors.sourceReference?.message}
          {...form.register('sourceReference')}
        />
        <FormField
          id={id + '-notes'}
          label="Notas"
          maxLength={1000}
          error={errors.notes?.message}
          {...form.register('notes')}
        />
      </fieldset>
      <div className="space-y-2">
        <p className="text-sm font-medium">Producto asociado (opcional)</p>
        {factor ? (
          <p className="text-sm">
            {factor.product ? `${factor.product.code} · ${factor.product.name}` : 'Sin producto'}
          </p>
        ) : prefill ? (
          <p className="text-sm">{prefill.productLabel}</p>
        ) : (
          <CatalogPicker
            kind="product"
            value={productId}
            onChange={(value) => form.setValue('productId', value)}
            productTypeOptions={['RAW_MATERIAL', 'CONSUMABLE']}
            disabled={mutation.isPending}
          />
        )}
        <p className="text-sm text-muted-foreground">
          Un factor asociado se aplica automáticamente a los consumos reales del producto. Su unidad
          debe ser de la misma dimensión que la del producto (sin densidades).
        </p>
      </div>
      <ErrorNotice error={mutation.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : factor ? 'Guardar cambios' : 'Crear factor'}
        </Button>
      </div>
    </form>
  );
}
