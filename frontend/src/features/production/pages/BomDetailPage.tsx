import { useState } from 'react';
import { useParams } from 'react-router';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calculator, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EmptyState,
  FormSection,
  LoadingState,
  PageHeader,
  StatusBadge,
  SuccessNotice,
} from '@/components/erp';
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
  type BomVersion,
} from '../api/boms';
import {
  bomVersionSchema,
  calculationSchema,
  createBomSchema,
  type BomVersionFormData,
  type CalculationFormData,
} from '../schemas';
import { ProductPicker } from '../components/ProductPicker';

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('es-NI', {
        dateStyle: 'medium',
        timeZone: 'America/Managua',
      }).format(date);
}

function NewVersion({
  bom,
  onClose,
  onSaved,
}: {
  bom: Bom;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl" showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Nueva versión</DialogTitle>
          <DialogDescription>
            {bom.name}. Las versiones guardadas se conservan; para cambiar componentes, crea otra
            versión.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-6"
          aria-busy={mutation.isPending}
          onSubmit={handleSubmit((value) => mutation.mutate(value, { onSuccess: onSaved }))}
        >
          {!bom.isActive && (
            <p role="status" className="rounded-md border p-3">
              La fórmula fue desactivada. Tu borrador se conserva.
            </p>
          )}
          <fieldset disabled={mutation.isPending || !bom.isActive} className="space-y-6">
            <FormSection
              title="1. Cantidad de salida"
              description={'Producto: ' + bom.product.code + ' · ' + bom.product.name}
            >
              <FormField
                id="output-quantity"
                label={'Cantidad base de salida (' + PRODUCT_UNIT_LABELS[bom.product.unit] + ')'}
                inputMode="decimal"
                error={errors.outputQuantity?.message}
                {...register('outputQuantity')}
              />
              <p className="text-sm text-muted-foreground">
                Los componentes de esta versión corresponden a esta cantidad base.
              </p>
            </FormSection>
            <FormSection
              title="2. Componentes"
              description="Selecciona cada producto e indica la cantidad necesaria en su propia unidad."
            >
              {fields.map((field, index) => (
                <div key={field.id} className="space-y-4 border-b pb-5 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Componente {index + 1}</h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Quitar componente {index + 1}
                    </Button>
                  </div>
                  <Controller
                    control={control}
                    name={('items.' + index + '.productId') as `items.${number}.productId`}
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
                  <div className="max-w-xs">
                    <FormField
                      id={'component-quantity-' + field.id}
                      label={'Cantidad del componente ' + (index + 1)}
                      inputMode="decimal"
                      error={errors.items?.[index]?.quantity?.message}
                      {...register(('items.' + index + '.quantity') as `items.${number}.quantity`)}
                    />
                  </div>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                Cada cantidad usa la unidad indicada en su producto; los intermedios se fabrican en
                una orden separada.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ productId: '', quantity: '' })}
              >
                <Plus className="size-4" aria-hidden="true" />
                Agregar componente
              </Button>
            </FormSection>
          </fieldset>
          <ErrorNotice error={mutation.error} />
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || !bom.isActive}>
              {mutation.isPending ? 'Guardando versión…' : 'Guardar versión'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ bom }: { bom: Bom }) {
  const session = useSession();
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nextStatus, setNextStatus] = useState<boolean | null>(null);
  const [activationTarget, setActivationTarget] = useState<BomVersion | null>(null);
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const selected =
    bom.versions.find((version) => version.id === selectedId) ??
    bom.versions.find((version) => version.isActive) ??
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
  const validCalculation =
    calculation.data &&
    calculation.data.bomVersionId === selected?.id &&
    calculation.variables?.value.quantityPlanned === planned;

  return (
    <section className="space-y-6">
      <PageHeader
        title={bom.name}
        description={
          bom.product.code +
          ' · ' +
          bom.product.name +
          ' · ' +
          PRODUCT_UNIT_LABELS[bom.product.unit]
        }
        status={<StatusBadge status={bom.isActive} />}
        breadcrumbs={[{ label: 'Fórmulas', to: '/production/boms' }, { label: bom.name }]}
        actions={
          canManage && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setRenaming(true)}>
                <Pencil className="size-4" aria-hidden="true" />
                Editar nombre
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setNextStatus(!bom.isActive)}
              >
                {bom.isActive ? 'Desactivar fórmula' : 'Activar fórmula'}
              </Button>
              {bom.isActive && (
                <Button disabled={busy} onClick={() => setCreating(true)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nueva versión
                </Button>
              )}
            </>
          )
        }
      />
      {notice && <SuccessNotice>{notice}</SuccessNotice>}
      <FormSection
        title="Versiones"
        description="Consulta el historial y selecciona una versión para revisar sus componentes."
      >
        {bom.versions.length === 0 ? (
          <EmptyState
            title="Esta fórmula aún no tiene versiones"
            description="Agrega una versión para definir componentes y calcular requerimientos."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table aria-label="Versiones de la fórmula">
              <TableHeader>
                <TableRow>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Cantidad base</TableHead>
                  <TableHead>Creación · Managua</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.versions.map((version) => (
                  <TableRow
                    key={version.id}
                    data-state={version.id === selected?.id ? 'selected' : undefined}
                  >
                    <TableCell>
                      <Button
                        size="sm"
                        variant={version.id === selected?.id ? 'secondary' : 'ghost'}
                        aria-pressed={version.id === selected?.id}
                        onClick={() => {
                          setSelectedId(version.id);
                          calculation.reset();
                        }}
                      >
                        Versión {version.version}
                        {version.isActive ? ' · Activa' : ' · Histórica'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={version.isActive ? 'ACTIVE' : 'HISTORICAL'} />
                    </TableCell>
                    <TableCell>
                      {version.outputQuantity} {PRODUCT_UNIT_LABELS[bom.product.unit]}
                    </TableCell>
                    <TableCell>{displayDate(version.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </FormSection>
      {selected && (
        <>
          <FormSection
            title={'Componentes · Versión ' + selected.version}
            description={
              'Cantidad base: ' +
              selected.outputQuantity +
              ' ' +
              PRODUCT_UNIT_LABELS[bom.product.unit] +
              (selected.isActive ? ' · Versión activa' : ' · Versión histórica')
            }
          >
            <div className="overflow-hidden rounded-lg border">
              <Table aria-label="Componentes de la versión">
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad base</TableHead>
                    <TableHead>Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-normal">
                        <p className="font-medium">{item.componentProduct.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.componentProduct.code}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                      <TableCell>{PRODUCT_UNIT_LABELS[item.componentProduct.unit]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {canManage && bom.isActive && !selected.isActive && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setActivationTarget(selected)}
              >
                Activar versión {selected.version}
              </Button>
            )}
          </FormSection>
          <FormSection
            title="Calcular requerimientos"
            description="Consulta las cantidades necesarias para esta versión. El cálculo no reserva ni consume inventario."
          >
            <form
              noValidate
              className="space-y-4"
              onSubmit={calcForm.handleSubmit((value) =>
                calculation.mutate({ versionId: selected.id, value }),
              )}
            >
              <div className="flex flex-wrap items-end gap-3">
                <fieldset disabled={calculation.isPending} className="min-w-0">
                  <FormField
                    id="quantity-planned"
                    label={'Cantidad a fabricar (' + PRODUCT_UNIT_LABELS[bom.product.unit] + ')'}
                    inputMode="decimal"
                    error={calcForm.formState.errors.quantityPlanned?.message}
                    {...calcForm.register('quantityPlanned', {
                      onChange: () => calculation.reset(),
                    })}
                  />
                </fieldset>
                <Button type="submit" disabled={calculation.isPending}>
                  <Calculator className="size-4" aria-hidden="true" />
                  {calculation.isPending ? 'Calculando…' : 'Calcular'}
                </Button>
              </div>
              <ErrorNotice error={calculation.error} />
              {validCalculation && calculation.data && (
                <div role="status" className="space-y-3 border-t pt-4">
                  <p className="text-sm font-medium">
                    Para fabricar {calculation.data.quantityPlanned}{' '}
                    {PRODUCT_UNIT_LABELS[bom.product.unit]} con la versión{' '}
                    {calculation.data.version}:
                  </p>
                  <Table aria-label="Requerimientos calculados">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Componente</TableHead>
                        <TableHead className="text-right">Cantidad requerida</TableHead>
                        <TableHead>Unidad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculation.data.items.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell className="whitespace-normal">{item.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.requiredQuantity}
                          </TableCell>
                          <TableCell>{PRODUCT_UNIT_LABELS[item.unit]}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </form>
          </FormSection>
        </>
      )}
      {canManage && creating && (
        <NewVersion
          bom={bom}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice('Versión guardada correctamente. El historial de la fórmula se conserva.');
          }}
        />
      )}
      {canManage && renaming && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !rename.isPending) setRenaming(false);
          }}
        >
          <DialogContent showCloseButton={!rename.isPending}>
            <DialogHeader>
              <DialogTitle>Editar nombre de la fórmula</DialogTitle>
              <DialogDescription>
                Este cambio no modifica sus versiones ni componentes.
              </DialogDescription>
            </DialogHeader>
            <form
              noValidate
              className="space-y-4"
              onSubmit={nameForm.handleSubmit((value) =>
                rename.mutate(value, {
                  onSuccess: () => {
                    setRenaming(false);
                    setNotice('Nombre de la fórmula actualizado.');
                  },
                }),
              )}
            >
              <fieldset disabled={rename.isPending}>
                <FormField
                  id="rename-bom"
                  label="Nombre de la fórmula"
                  maxLength={120}
                  error={nameForm.formState.errors.name?.message}
                  {...nameForm.register('name')}
                />
              </fieldset>
              <ErrorNotice error={rename.error} />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={rename.isPending}
                  onClick={() => setRenaming(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={rename.isPending}>
                  {rename.isPending ? 'Guardando…' : 'Guardar nombre'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {canManage && nextStatus !== null && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !status.isPending) setNextStatus(null);
          }}
        >
          <DialogContent showCloseButton={!status.isPending}>
            <DialogHeader>
              <DialogTitle>{nextStatus ? 'Activar fórmula' : 'Desactivar fórmula'}</DialogTitle>
              <DialogDescription>
                {nextStatus
                  ? 'La fórmula ' +
                    bom.name +
                    ' volverá a estar disponible para crear órdenes con su versión activa.'
                  : 'La fórmula ' +
                    bom.name +
                    ' dejará de estar disponible para nuevas órdenes. Sus versiones y el historial de las órdenes existentes se conservan.'}
              </DialogDescription>
            </DialogHeader>
            <ErrorNotice error={status.error} />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={status.isPending}
                onClick={() => setNextStatus(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={status.isPending}
                onClick={() =>
                  status.mutate(nextStatus, {
                    onSuccess: () => {
                      setNextStatus(null);
                      setNotice(nextStatus ? 'Fórmula activada.' : 'Fórmula desactivada.');
                    },
                  })
                }
              >
                {status.isPending
                  ? 'Guardando…'
                  : nextStatus
                    ? 'Confirmar activación'
                    : 'Confirmar desactivación'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {canManage && activationTarget && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !activate.isPending) setActivationTarget(null);
          }}
        >
          <DialogContent showCloseButton={!activate.isPending}>
            <DialogHeader>
              <DialogTitle>Activar versión {activationTarget.version}</DialogTitle>
              <DialogDescription>
                Las nuevas órdenes usarán esta versión. Las órdenes existentes conservan su versión
                y las demás versiones permanecen en el historial.
              </DialogDescription>
            </DialogHeader>
            {!bom.isActive && (
              <p role="status">
                La fórmula está inactiva. Debes activarla antes de activar esta versión.
              </p>
            )}
            <ErrorNotice error={activate.error} />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={activate.isPending}
                onClick={() => setActivationTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={activate.isPending || !bom.isActive}
                onClick={() =>
                  activate.mutate(activationTarget.id, {
                    onSuccess: () => {
                      setActivationTarget(null);
                      setNotice('Versión ' + activationTarget.version + ' activada.');
                    },
                  })
                }
              >
                {activate.isPending ? 'Activando…' : 'Confirmar activación'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

export function BomDetailPage() {
  const { id = '' } = useParams();
  const bom = useBom(id);
  return (
    <>
      {bom.isPending && <LoadingState label="Cargando fórmula…" />}
      <ErrorNotice error={bom.error} />
      {bom.isError && (
        <Button variant="outline" disabled={bom.isFetching} onClick={() => void bom.refetch()}>
          Reintentar
        </Button>
      )}
      {bom.data && <Detail key={bom.data.id} bom={bom.data} />}
    </>
  );
}
