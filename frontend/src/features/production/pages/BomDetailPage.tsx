import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import {
  useActivateVersion,
  useBom,
  useBomStatus,
  useCalculateBom,
  useCreateVersion,
  useRenameBom,
  type Bom,
} from '../api/boms';
import {
  bomVersionSchema,
  calculationSchema,
  createBomSchema,
  type BomVersionFormData,
  type CalculationFormData,
} from '../schemas';
import { ProductPicker } from '../components/ProductPicker';

function NewVersion({ bom, onClose }: { bom: Bom; onClose: () => void }) {
  const mutation = useCreateVersion(bom.id);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BomVersionFormData>({
    resolver: zodResolver(bomVersionSchema),
    defaultValues: { outputQuantity: '1', items: [{ productId: '', quantity: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  return (
    <form
      noValidate
      className="space-y-4 rounded border p-4"
      onSubmit={handleSubmit((value) => mutation.mutate(value, { onSuccess: onClose }))}
    >
      <h2 className="text-lg font-semibold">Nueva versión</h2>
      <p>Las versiones guardadas se conservan. Para modificar componentes, creá otra versión.</p>
      {!bom.isActive && <p role="status">La fórmula fue desactivada. Tu borrador se conserva.</p>}
      <fieldset disabled={mutation.isPending || !bom.isActive} className="space-y-4">
        <FormField
          id="output-quantity"
          label={'Cantidad base de salida (' + PRODUCT_UNIT_LABELS[bom.product.unit] + ')'}
          inputMode="decimal"
          error={errors.outputQuantity?.message}
          {...register('outputQuantity')}
        />
        {fields.map((field, index) => (
          <div key={field.id} className="space-y-3">
            <Controller
              control={control}
              name={`items.${index}.productId`}
              render={({ field: selected }) => (
                <ProductPicker
                  label={'Componente ' + (index + 1)}
                  value={selected.value}
                  onChange={selected.onChange}
                  excludeId={bom.productId}
                  error={errors.items?.[index]?.productId?.message}
                />
              )}
            />
            <FormField
              id={'component-quantity-' + field.id}
              label={'Cantidad del componente ' + (index + 1)}
              inputMode="decimal"
              error={errors.items?.[index]?.quantity?.message}
              {...register(`items.${index}.quantity`)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={fields.length <= 1}
              onClick={() => remove(index)}
            >
              Quitar componente {index + 1}
            </Button>
          </div>
        ))}
        <p className="text-sm text-muted-foreground">
          Cada cantidad usa la unidad indicada en su producto; los intermedios se fabrican en una
          orden separada.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ productId: '', quantity: '' })}
        >
          Agregar componente
        </Button>
      </fieldset>
      <ErrorNotice error={mutation.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending || !bom.isActive}>
          Guardar versión
        </Button>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
function Detail({ bom }: { bom: Bom }) {
  const session = useSession();
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const selected =
    bom.versions.find((v) => v.id === selectedId) ??
    bom.versions.find((v) => v.isActive) ??
    bom.versions[0];
  const status = useBomStatus(bom.id);
  const rename = useRenameBom(bom.id);
  const activate = useActivateVersion(bom.id);
  const calculation = useCalculateBom(bom.id);
  const nameForm = useForm<{ name: string }>({
    resolver: zodResolver(createBomSchema.omit({ productId: true })),
    values: { name: bom.name },
  });
  const calcForm = useForm<CalculationFormData>({
    resolver: zodResolver(calculationSchema),
    defaultValues: { quantityPlanned: '100' },
  });
  const busy = status.isPending || rename.isPending || activate.isPending || creating;
  const planned = useWatch({ control: calcForm.control, name: 'quantityPlanned' });
  return (
    <section className="space-y-5">
      <Link to="/production/boms" className="underline">
        Volver a fórmulas
      </Link>
      <h1 className="text-2xl font-semibold">{bom.name}</h1>
      <p>
        {bom.product.code} · {bom.product.name} · {PRODUCT_UNIT_LABELS[bom.product.unit]} ·{' '}
        {bom.isActive ? 'Activa' : 'Inactiva'}
      </p>
      {canManage && (
        <div className="space-y-4">
          <form
            noValidate
            className="flex items-end gap-3"
            onSubmit={nameForm.handleSubmit((value) => rename.mutate(value))}
          >
            <fieldset disabled={busy}>
              <FormField
                id="rename-bom"
                label="Nombre de la fórmula"
                error={nameForm.formState.errors.name?.message}
                {...nameForm.register('name')}
              />
            </fieldset>
            <Button type="submit" disabled={busy}>
              Guardar nombre
            </Button>
          </form>
          <Button variant="outline" disabled={busy} onClick={() => status.mutate(!bom.isActive)}>
            {bom.isActive ? 'Desactivar fórmula' : 'Activar fórmula'}
          </Button>
          {bom.isActive && !creating && (
            <Button className="ml-3" onClick={() => setCreating(true)}>
              Nueva versión
            </Button>
          )}
          <ErrorNotice error={rename.error ?? status.error ?? activate.error} />
          {creating && <NewVersion bom={bom} onClose={() => setCreating(false)} />}
        </div>
      )}
      <h2 className="text-lg font-semibold">Versiones</h2>
      {bom.versions.length === 0 && <p>Agregá una versión para calcular requerimientos.</p>}
      <div className="flex flex-wrap gap-2">
        {bom.versions.map((v) => (
          <Button
            key={v.id}
            aria-pressed={v.id === selected?.id}
            variant={v.id === selected?.id ? 'default' : 'outline'}
            onClick={() => {
              setSelectedId(v.id);
              calculation.reset();
            }}
          >
            Versión {v.version}
            {v.isActive ? ' · Activa' : ''}
          </Button>
        ))}
      </div>
      {selected && (
        <>
          <p>
            Cantidad base: {selected.outputQuantity} {PRODUCT_UNIT_LABELS[bom.product.unit]}
          </p>
          <ul className="space-y-1">
            {selected.items.map((item) => (
              <li key={item.id}>
                {item.componentProduct.code} · {item.componentProduct.name}: {item.quantity}{' '}
                {PRODUCT_UNIT_LABELS[item.componentProduct.unit]}
              </li>
            ))}
          </ul>
          {canManage && bom.isActive && !selected.isActive && (
            <Button disabled={busy} onClick={() => activate.mutate(selected.id)}>
              Activar versión {selected.version}
            </Button>
          )}
          <form
            noValidate
            className="space-y-3 rounded border p-4"
            onSubmit={calcForm.handleSubmit((value) =>
              calculation.mutate({ versionId: selected.id, value }),
            )}
          >
            <h2 className="text-lg font-semibold">Calcular requerimientos</h2>
            <fieldset disabled={calculation.isPending}>
              <FormField
                id="quantity-planned"
                label={'Cantidad a fabricar (' + PRODUCT_UNIT_LABELS[bom.product.unit] + ')'}
                inputMode="decimal"
                error={calcForm.formState.errors.quantityPlanned?.message}
                {...calcForm.register('quantityPlanned', { onChange: () => calculation.reset() })}
              />
            </fieldset>
            <Button type="submit" disabled={calculation.isPending}>
              Calcular
            </Button>
            <ErrorNotice error={calculation.error} />
            {calculation.data &&
              calculation.data.bomVersionId === selected.id &&
              calculation.variables?.value.quantityPlanned === planned && (
                <div role="status">
                  <p>
                    Para fabricar {calculation.data.quantityPlanned}{' '}
                    {PRODUCT_UNIT_LABELS[bom.product.unit]} con la versión{' '}
                    {calculation.data.version}:
                  </p>
                  <ul>
                    {calculation.data.items.map((item) => (
                      <li key={item.productId}>
                        {item.name}: {item.requiredQuantity} {PRODUCT_UNIT_LABELS[item.unit]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </form>
        </>
      )}
    </section>
  );
}
export function BomDetailPage() {
  const { id = '' } = useParams();
  const bom = useBom(id);
  return (
    <>
      {bom.isPending && <p role="status">Cargando fórmula…</p>}
      <ErrorNotice error={bom.error} />
      {bom.isError && (
        <Button variant="outline" onClick={() => void bom.refetch()}>
          Reintentar
        </Button>
      )}
      {bom.data && <Detail key={bom.data.id} bom={bom.data} />}
    </>
  );
}
