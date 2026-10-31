import { Controller, useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';

import { z } from 'zod';

import { Button } from '@/components/ui/button';

import { FormField } from '@/components/FormField';

import { ErrorNotice } from '@/components/ErrorNotice';

import { FormSection } from '@/components/erp';

import { ProductPicker } from './ProductPicker';

import {
  createProductionRouteSchema,
  routeMetadataSchema,
  routeOperationsSchema,
} from '../route-schemas';

import type {
  CreateProductionRouteInput,
  ProductionRouteDetail,
  UpdateProductionRouteInput,
  RouteOperationInput,
} from '../api/routes';

const blankOperation = () => ({ sequence: 10, name: '', description: '', standardMinutes: '' });

export function RouteForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (value: CreateProductionRouteInput) => void;
  pending: boolean;
  error: Error | null;
}) {
  const form = useForm<CreateProductionRouteInput>({
    resolver: zodResolver(createProductionRouteSchema),
    defaultValues: {
      productId: '',
      code: '',
      name: '',
      description: '',
      operations: [blankOperation()],
    },
  });

  const fields = useFieldArray({ control: form.control, name: 'operations' });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={form.handleSubmit(onSubmit)}
      aria-busy={pending}
    >
      <fieldset disabled={pending} className="space-y-6">
        <Controller
          control={form.control}
          name="productId"
          render={({ field }) => (
            <ProductPicker
              label="Producto"
              output
              requireLotTracked={false}
              value={field.value}
              onChange={field.onChange}
              error={form.formState.errors.productId?.message}
            />
          )}
        />

        <FormSection title="Identificación">
          <FormField
            id="route-code"
            label="Código"
            {...form.register('code')}
            error={form.formState.errors.code?.message}
          />
          <FormField
            id="route-name"
            label="Nombre"
            {...form.register('name')}
            error={form.formState.errors.name?.message}
          />
          <FormField
            id="route-description"
            label="Descripción"
            {...form.register('description')}
            error={form.formState.errors.description?.message}
          />
        </FormSection>

        <FormSection title="Operaciones estándar">
          <p className="text-sm text-muted-foreground">
            Se guardan ordenadas por secuencia. Los tiempos se expresan en minutos.
          </p>

          {[...fields.fields.map((field, index) => ({ field, index }))]
            .sort(
              (a, b) =>
                (form.watch(`operations.${a.index}.sequence`) || 0) -
                (form.watch(`operations.${b.index}.sequence`) || 0),
            )
            .map(({ field, index }) => (
              <div key={field.id} className="space-y-3 rounded-lg border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    id={'sequence-' + field.id}
                    label={'Secuencia ' + (index + 1)}
                    type="number"
                    {...form.register(`operations.${index}.sequence`, { valueAsNumber: true })}
                    error={form.formState.errors.operations?.[index]?.sequence?.message}
                  />

                  <FormField
                    id={'operation-' + field.id}
                    label={'Operación ' + (index + 1)}
                    {...form.register(`operations.${index}.name`)}
                    error={form.formState.errors.operations?.[index]?.name?.message}
                  />

                  <FormField
                    id={'description-' + field.id}
                    label={'Descripción de operación ' + (index + 1)}
                    {...form.register(`operations.${index}.description`)}
                    error={form.formState.errors.operations?.[index]?.description?.message}
                  />

                  <FormField
                    id={'minutes-' + field.id}
                    label={'Minutos estándar ' + (index + 1)}
                    inputMode="decimal"
                    {...form.register(`operations.${index}.standardMinutes`)}
                    error={form.formState.errors.operations?.[index]?.standardMinutes?.message}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={fields.fields.length === 1}
                  onClick={() => fields.remove(index)}
                >
                  Quitar operación {index + 1}
                </Button>
              </div>
            ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              fields.append({
                ...blankOperation(),
                sequence: Math.min(
                  2147483647,
                  Math.max(0, ...form.getValues('operations').map((op) => op.sequence || 0)) + 10,
                ),
              })
            }
          >
            Agregar operación
          </Button>
        </FormSection>

        <Button type="submit">{pending ? 'Guardando…' : 'Crear ruta'}</Button>
      </fieldset>
      <ErrorNotice error={error} />
    </form>
  );
}

export function RouteMetadataForm({
  route,
  onSubmit,
  pending,
  error,
  onCancel,
}: {
  route: ProductionRouteDetail;
  onSubmit: (value: UpdateProductionRouteInput) => void;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
}) {
  const form = useForm<z.infer<typeof routeMetadataSchema>>({
    resolver: zodResolver(routeMetadataSchema),
    defaultValues: { code: route.code, name: route.name, description: route.description ?? '' },
  });

  return (
    <form noValidate className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <fieldset disabled={pending} className="space-y-4">
        <FormField
          id="edit-code"
          label="Código"
          {...form.register('code')}
          error={form.formState.errors.code?.message}
        />
        <FormField
          id="edit-name"
          label="Nombre"
          {...form.register('name')}
          error={form.formState.errors.name?.message}
        />
        <FormField
          id="edit-description"
          label="Descripción"
          {...form.register('description')}
          error={form.formState.errors.description?.message}
        />
        <Button type="submit">Guardar datos</Button>{' '}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </fieldset>
      <ErrorNotice error={error} />
    </form>
  );
}

export function RouteOperationsForm({
  route,
  onSubmit,
  pending,
  error,
  onCancel,
}: {
  route: ProductionRouteDetail;
  onSubmit: (value: { operations: RouteOperationInput[] }) => void;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
}) {
  const form = useForm<z.infer<typeof routeOperationsSchema>>({
    resolver: zodResolver(routeOperationsSchema),
    defaultValues: {
      operations: route.operations.map(({ sequence, name, description, standardMinutes }) => ({
        sequence,
        name,
        description: description ?? '',
        standardMinutes,
      })),
    },
  });

  const fields = useFieldArray({ control: form.control, name: 'operations' });

  return (
    <form noValidate className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <fieldset disabled={pending} className="space-y-4">
        {fields.fields
          .map((field, index) => ({ field, index }))
          .sort(
            (a, b) =>
              (form.watch(`operations.${a.index}.sequence`) || 0) -
              (form.watch(`operations.${b.index}.sequence`) || 0),
          )
          .map(({ field, index }) => (
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" key={field.id}>
              <FormField
                id={'edit-sequence-' + field.id}
                label={'Secuencia ' + (index + 1)}
                type="number"
                {...form.register(`operations.${index}.sequence`, { valueAsNumber: true })}
                error={form.formState.errors.operations?.[index]?.sequence?.message}
              />

              <FormField
                id={'edit-operation-' + field.id}
                label={'Operación ' + (index + 1)}
                {...form.register(`operations.${index}.name`)}
                error={form.formState.errors.operations?.[index]?.name?.message}
              />

              <FormField
                id={'edit-description-' + field.id}
                label={'Descripción de operación ' + (index + 1)}
                {...form.register(`operations.${index}.description`)}
                error={form.formState.errors.operations?.[index]?.description?.message}
              />

              <FormField
                id={'edit-minutes-' + field.id}
                label={'Minutos estándar ' + (index + 1)}
                inputMode="decimal"
                {...form.register(`operations.${index}.standardMinutes`)}
                error={form.formState.errors.operations?.[index]?.standardMinutes?.message}
              />

              <Button
                type="button"
                variant="outline"
                disabled={fields.fields.length === 1}
                onClick={() => fields.remove(index)}
              >
                Quitar operación {index + 1}
              </Button>
            </div>
          ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            fields.append({
              ...blankOperation(),
              sequence: Math.min(
                2147483647,
                Math.max(0, ...form.getValues('operations').map((op) => op.sequence || 0)) + 10,
              ),
            })
          }
        >
          Agregar operación
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Guardar operaciones</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </fieldset>
      <ErrorNotice error={error} />
    </form>
  );
}
