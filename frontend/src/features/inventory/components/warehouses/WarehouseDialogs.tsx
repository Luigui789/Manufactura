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
import { createWarehouseSchema, updateWarehouseSchema } from '../../schemas';
import { onlyDirty } from '../../only-dirty';
import type { Warehouse } from '../../types';
import { useCreateWarehouse, useSetWarehouseStatus, useUpdateWarehouse } from '../../api/hooks';

function WarehouseDialog({
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

function FormActions({
  pending,
  onClose,
  submitDisabled = false,
}: {
  pending: boolean;
  onClose: () => void;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending || submitDisabled}>
        {pending ? 'Guardando…' : 'Confirmar'}
      </Button>
    </div>
  );
}

export function CreateWarehouseDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useCreateWarehouse();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createWarehouseSchema),
    defaultValues: {
      code: '',
      name: '',
      location: '',
      isActive: true,
    },
  });

  return (
    <WarehouseDialog
      title="Crear Almacén"
      description="Registra un nuevo almacén físico o lógico en el sistema."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((data) =>
          mutation.mutate(data, {
            onSuccess: () => {
              reset();
              onSuccess('Almacén creado exitosamente');
            },
          }),
        )}
      >
        <fieldset disabled={mutation.isPending} className="space-y-4">
          <FormField
            id="code"
            label="Código del Almacén"
            autoComplete="off"
            error={errors.code?.message}
            {...register('code')}
          />

          <FormField
            id="name"
            label="Nombre del Almacén"
            autoComplete="off"
            error={errors.name?.message}
            {...register('name')}
          />

          <FormField
            id="location"
            label="Ubicación"
            autoComplete="off"
            error={errors.location?.message}
            {...register('location')}
          />

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...register('isActive')} className="rounded border-gray-300" />
            Almacén Activo
          </label>
        </fieldset>

        <ErrorNotice error={mutation.error} />
        <FormActions pending={mutation.isPending} onClose={onClose} />
      </form>
    </WarehouseDialog>
  );
}

export function EditWarehouseDialog({
  warehouse,
  onClose,
  onSuccess,
}: {
  warehouse: Warehouse;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useUpdateWarehouse();

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
  } = useForm({
    resolver: zodResolver(updateWarehouseSchema),
    defaultValues: {
      code: warehouse.code,
      name: warehouse.name,
      location: warehouse.location ?? '',
    },
  });

  return (
    <WarehouseDialog
      title="Editar Almacén"
      description="Actualiza los datos del almacén. El estado se cambia aparte."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((data) => {
          if (mutation.isPending) return;

          const changes = onlyDirty(data, dirtyFields);

          if (Object.keys(changes).length === 0) return;

          mutation.mutate(
            { id: warehouse.id, data: changes },
            { onSuccess: () => onSuccess('Almacén actualizado exitosamente') },
          );
        })}
      >
        <fieldset disabled={mutation.isPending} className="space-y-4">
          <FormField
            id="edit-code"
            label="Código del Almacén"
            autoComplete="off"
            error={errors.code?.message}
            {...register('code')}
          />

          <FormField
            id="edit-name"
            label="Nombre del Almacén"
            autoComplete="off"
            error={errors.name?.message}
            {...register('name')}
          />

          <FormField
            id="edit-location"
            label="Ubicación"
            autoComplete="off"
            error={errors.location?.message}
            {...register('location')}
          />
        </fieldset>

        <ErrorNotice error={mutation.error} />

        <FormActions pending={mutation.isPending} onClose={onClose} submitDisabled={!isDirty} />
      </form>
    </WarehouseDialog>
  );
}

export function WarehouseStatusDialog({
  warehouse,
  onClose,
  onSuccess,
}: {
  warehouse: Warehouse;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useSetWarehouseStatus();
  const activating = !warehouse.isActive;

  return (
    <WarehouseDialog
      title={activating ? 'Activar almacén' : 'Desactivar almacén'}
      description={
        activating
          ? `El almacén ${warehouse.code} volverá a estar disponible para operar.`
          : `Se impedirán nuevos movimientos de inventario en ${warehouse.code}. El almacén no se elimina y puedes reactivarlo cuando quieras.`
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
              { id: warehouse.id, isActive: activating },
              {
                onSuccess: () => onSuccess(activating ? 'Almacén activado' : 'Almacén desactivado'),
              },
            )
          }
        >
          {mutation.isPending ? 'Guardando…' : 'Confirmar'}
        </Button>
      </div>
    </WarehouseDialog>
  );
}
