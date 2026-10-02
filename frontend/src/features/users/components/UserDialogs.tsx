import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { createUserSchema, resetPasswordSchema, roleSchema } from '../schemas';
import {
  useCreateUser,
  useChangeRole,
  useResetPassword,
  useSetUserActive,
} from '../hooks/use-users';
import type { User } from '../services/users-api';
import { RoleSelect } from './RoleSelect';

function UserDialog({
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
function FormActions({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando…' : 'Confirmar'}
      </Button>
    </div>
  );
}
export function CreateUserDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useCreateUser();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: '',
      email: '',
      role: 'VENTAS' as const,
      temporaryPassword: '',
      confirmation: '',
    },
  });
  return (
    <UserDialog
      title="Crear usuario"
      description="La contraseña temporal deberá cambiarse en el primer acceso. Entrégala al usuario por un canal seguro."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(({ confirmation: _confirmation, ...data }) =>
          mutation.mutate(data, {
            onSuccess: (result) => {
              reset();
              onSuccess(result.message);
            },
          }),
        )}
      >
        <fieldset disabled={mutation.isPending} className="space-y-4">
          <FormField
            id="fullName"
            label="Nombre completo"
            autoComplete="off"
            error={errors.fullName?.message}
            {...register('fullName')}
          />
          <FormField
            id="userEmail"
            label="Correo electrónico"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <RoleSelect
                value={field.value}
                onChange={field.onChange}
                error={errors.role?.message}
              />
            )}
          />
          <FormField
            id="temporaryPassword"
            label="Contraseña temporal"
            type="password"
            autoComplete="new-password"
            error={errors.temporaryPassword?.message}
            {...register('temporaryPassword')}
          />
          <p className="text-sm text-muted-foreground">Entre 15 y 128 caracteres.</p>
          <FormField
            id="confirmation"
            label="Confirmar contraseña temporal"
            type="password"
            autoComplete="new-password"
            error={errors.confirmation?.message}
            {...register('confirmation')}
          />
        </fieldset>
        <ErrorNotice error={mutation.error} />
        <FormActions pending={mutation.isPending} onClose={onClose} />
      </form>
    </UserDialog>
  );
}
export function ChangeRoleDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useChangeRole();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(roleSchema), defaultValues: { role: user.role } });
  return (
    <UserDialog
      title="Cambiar rol"
      description={`Se cerrarán las sesiones de ${user.fullName}.`}
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit(({ role }) =>
          mutation.mutate(
            { id: user.id, role },
            { onSuccess: (result) => onSuccess(result.message) },
          ),
        )}
      >
        <fieldset disabled={mutation.isPending}>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <RoleSelect
                value={field.value}
                onChange={field.onChange}
                error={errors.role?.message}
              />
            )}
          />
        </fieldset>
        <ErrorNotice error={mutation.error} />
        <FormActions pending={mutation.isPending} onClose={onClose} />
      </form>
    </UserDialog>
  );
}
export function ResetPasswordDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useResetPassword();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { temporaryPassword: '', confirmation: '' },
  });
  return (
    <UserDialog
      title="Restablecer contraseña"
      description={`Se cerrarán las sesiones de ${user.fullName} y deberá cambiar esta contraseña temporal al ingresar.`}
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(({ temporaryPassword }) =>
          mutation.mutate(
            { id: user.id, temporaryPassword },
            {
              onSuccess: (result) => {
                reset();
                onSuccess(result.message);
              },
            },
          ),
        )}
      >
        <fieldset disabled={mutation.isPending} className="space-y-4">
          <FormField
            id="temporaryPassword"
            label="Contraseña temporal"
            type="password"
            autoComplete="new-password"
            error={errors.temporaryPassword?.message}
            {...register('temporaryPassword')}
          />
          <p className="text-sm text-muted-foreground">Entre 15 y 128 caracteres.</p>
          <FormField
            id="confirmation"
            label="Confirmar contraseña temporal"
            type="password"
            autoComplete="new-password"
            error={errors.confirmation?.message}
            {...register('confirmation')}
          />
        </fieldset>
        <ErrorNotice error={mutation.error} />
        <FormActions pending={mutation.isPending} onClose={onClose} />
      </form>
    </UserDialog>
  );
}
export function SetActiveDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useSetUserActive();
  return (
    <UserDialog
      title={user.isActive ? 'Desactivar usuario' : 'Activar usuario'}
      description={
        user.isActive
          ? `Se bloqueará el acceso de ${user.fullName} y se cerrarán sus sesiones.`
          : `Se permitirá el acceso de ${user.fullName}. Las sesiones anteriores seguirán revocadas.`
      }
      pending={mutation.isPending}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(
            { id: user.id, active: !user.isActive },
            { onSuccess: (result) => onSuccess(result.message) },
          );
        }}
      >
        <ErrorNotice error={mutation.error} />
        <FormActions pending={mutation.isPending} onClose={onClose} />
      </form>
    </UserDialog>
  );
}
