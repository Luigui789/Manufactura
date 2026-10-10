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
  EMPTY_CUSTOMER_FORM,
  customerSchema,
  toCustomerPayload,
  type CustomerFormData,
} from '../../schemas';
import type { CreateCustomerPayload, Customer } from '../../types';
import {
  useCreateCustomer,
  useSetCustomerStatus,
  useUpdateCustomer,
} from '../../hooks/useCustomers';

function CustomerDialog({
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

function CustomerForm({
  defaultValues,
  pending,
  error,
  submitDisabled,
  onClose,
  onSubmit,
}: {
  defaultValues: CustomerFormData;
  pending: boolean;
  error: Error | null;
  submitDisabled?: (isDirty: boolean) => boolean;
  onClose: () => void;
  onSubmit: (
    data: CustomerFormData,
    dirty: Partial<Record<keyof CustomerFormData, unknown>>,
  ) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
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
          id="customer-code"
          label="Código"
          autoComplete="off"
          error={errors.code?.message}
          {...register('code')}
        />
        <FormField
          id="customer-name"
          label="Razón social"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <FormField
          id="customer-tax-id"
          label="RUC (opcional)"
          autoComplete="off"
          error={errors.taxId?.message}
          {...register('taxId')}
        />
        <FormField
          id="customer-email"
          label="Correo (opcional)"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField
          id="customer-phone"
          label="Teléfono (opcional)"
          autoComplete="off"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <FormField
          id="customer-address"
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

export function CreateCustomerDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useCreateCustomer();

  return (
    <CustomerDialog
      title="Nuevo cliente"
      description="Registra un cliente. El código y la razón social son obligatorios."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <CustomerForm
        defaultValues={EMPTY_CUSTOMER_FORM}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={onClose}
        onSubmit={(data) =>
          mutation.mutate(toCustomerPayload(data) as CreateCustomerPayload, {
            onSuccess: (created) => onSuccess(`Cliente ${created.code} creado correctamente`),
          })
        }
      />
    </CustomerDialog>
  );
}

export function EditCustomerDialog({
  customer,
  onClose,
  onSuccess,
}: {
  customer: Customer;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useUpdateCustomer();

  return (
    <CustomerDialog
      title="Editar cliente"
      description="Actualiza los datos del cliente. El estado se cambia desde Activar o Desactivar."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <CustomerForm
        defaultValues={{
          code: customer.code,
          name: customer.name,
          taxId: customer.taxId ?? '',
          email: customer.email ?? '',
          phone: customer.phone ?? '',
          address: customer.address ?? '',
        }}
        pending={mutation.isPending}
        error={mutation.error}
        submitDisabled={(isDirty) => !isDirty}
        onClose={onClose}
        onSubmit={(data, dirty) => {
          // Solo viajan los campos tocados: dos ediciones de campos distintos no se pisan.
          const changes = Object.fromEntries(
            Object.entries(data).filter(([key]) => dirty[key as keyof CustomerFormData]),
          );

          mutation.mutate(
            { id: customer.id, payload: toCustomerPayload(changes) },
            {
              onSuccess: (updated) =>
                onSuccess(`Cliente ${updated.code} actualizado correctamente`),
            },
          );
        }}
      />
    </CustomerDialog>
  );
}

export function CustomerStatusDialog({
  customer,
  onClose,
  onSuccess,
}: {
  customer: Customer;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useSetCustomerStatus();
  const activating = !customer.isActive;

  return (
    <CustomerDialog
      title={activating ? 'Activar cliente' : 'Desactivar cliente'}
      description={
        activating
          ? `El cliente ${customer.code} volverá a estar disponible para nuevas ventas.`
          : `El cliente ${customer.code} no se elimina y conserva su historial. Puedes reactivarlo cuando quieras.`
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
              { id: customer.id, isActive: activating },
              {
                onSuccess: () => onSuccess(activating ? 'Cliente activado' : 'Cliente desactivado'),
              },
            )
          }
        >
          {mutation.isPending ? 'Guardando…' : 'Confirmar'}
        </Button>
      </div>
    </CustomerDialog>
  );
}
