import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import {
  EMPTY_SUPPLIER_FORM,
  supplierSchema,
  toSupplierPayload,
  type SupplierFormData,
} from '../../schemas';
import type { CreateSupplierPayload, Supplier } from '../../types';
import {
  useCreateSupplier,
  useSetSupplierStatus,
  useUpdateSupplier,
} from '../../hooks/useSuppliers';

function SupplierDialog({
  title,
  description,
  pending,
  onClose,
  children,
}: {
  title: string;
  description: string;
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  defaultValues,
  pending,
  error,
  submitDisabled,
  onClose,
  onSubmit,
}: {
  defaultValues: SupplierFormData;
  pending: boolean;
  error: Error | null;
  submitDisabled?: (isDirty: boolean) => boolean;
  onClose: () => void;
  onSubmit: (
    data: SupplierFormData,
    dirty: Partial<Record<keyof SupplierFormData, unknown>>,
  ) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues,
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((data) => onSubmit(data, dirtyFields))}
    >
      <fieldset disabled={pending} className="space-y-4">
        <FormField
          id="supplier-code"
          label="Código"
          autoComplete="off"
          error={errors.code?.message}
          {...register('code')}
        />
        <FormField
          id="supplier-name"
          label="Razón social"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <FormField
          id="supplier-tax-id"
          label="RUC (opcional)"
          autoComplete="off"
          error={errors.taxId?.message}
          {...register('taxId')}
        />
        <FormField
          id="supplier-email"
          label="Correo (opcional)"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField
          id="supplier-phone"
          label="Teléfono (opcional)"
          autoComplete="off"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <FormField
          id="supplier-address"
          label="Dirección (opcional)"
          autoComplete="off"
          error={errors.address?.message}
          {...register('address')}
        />
      </fieldset>

      <ErrorNotice error={error} />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || (submitDisabled?.(isDirty) ?? false)}>
          {pending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}

export function CreateSupplierDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useCreateSupplier();

  return (
    <SupplierDialog
      title="Nuevo proveedor"
      description="Registra un proveedor. El código y la razón social son obligatorios."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <SupplierForm
        defaultValues={EMPTY_SUPPLIER_FORM}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={onClose}
        onSubmit={(data) =>
          mutation.mutate(toSupplierPayload(data) as CreateSupplierPayload, {
            onSuccess: (created) => onSuccess(`Proveedor ${created.code} creado correctamente`),
          })
        }
      />
    </SupplierDialog>
  );
}

export function EditSupplierDialog({
  supplier,
  onClose,
  onSuccess,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useUpdateSupplier();

  return (
    <SupplierDialog
      title="Editar proveedor"
      description="Actualiza los datos del proveedor. El estado se cambia desde Activar o Desactivar."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <SupplierForm
        defaultValues={{
          code: supplier.code,
          name: supplier.name,
          taxId: supplier.taxId ?? '',
          email: supplier.email ?? '',
          phone: supplier.phone ?? '',
          address: supplier.address ?? '',
        }}
        pending={mutation.isPending}
        error={mutation.error}
        submitDisabled={(isDirty) => !isDirty}
        onClose={onClose}
        onSubmit={(data, dirty) => {
          // Solo viajan los campos tocados: dos ediciones de campos distintos no se pisan.
          const changes = Object.fromEntries(
            Object.entries(data).filter(([key]) => dirty[key as keyof SupplierFormData]),
          );

          mutation.mutate(
            { id: supplier.id, payload: toSupplierPayload(changes) },
            {
              onSuccess: (updated) =>
                onSuccess(`Proveedor ${updated.code} actualizado correctamente`),
            },
          );
        }}
      />
    </SupplierDialog>
  );
}

export function SupplierStatusDialog({
  supplier,
  onClose,
  onSuccess,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useSetSupplierStatus();
  const activating = !supplier.isActive;

  return (
    <SupplierDialog
      title={activating ? 'Activar proveedor' : 'Desactivar proveedor'}
      description={
        activating
          ? `El proveedor ${supplier.code} volverá a estar disponible para nuevas compras.`
          : `El proveedor ${supplier.code} no se elimina y conserva su historial. Puedes reactivarlo cuando quieras.`
      }
      pending={mutation.isPending}
      onClose={onClose}
    >
      <ErrorNotice error={mutation.error} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              { id: supplier.id, isActive: activating },
              {
                onSuccess: () =>
                  onSuccess(activating ? 'Proveedor activado' : 'Proveedor desactivado'),
              },
            )
          }
        >
          {mutation.isPending ? 'Guardando…' : 'Confirmar'}
        </Button>
      </div>
    </SupplierDialog>
  );
}
