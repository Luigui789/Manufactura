import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { changePasswordSchema } from '../schemas';
import { useChangePassword, useSession } from '../hooks/use-auth';
import { SessionActions } from '../components/SessionActions';

export function ChangePasswordPage() {
  const { data: user } = useSession();
  const mutation = useChangePassword();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmation: '' },
  });
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-5 px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Cambiar contraseña</CardTitle>
          <CardDescription>
            {user?.mustChangePassword
              ? 'Tu contraseña es temporal. Debes cambiarla antes de acceder al ERP.'
              : 'Actualiza tu contraseña. Se cerrarán tus otras sesiones.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="space-y-5"
            onSubmit={handleSubmit(({ currentPassword, newPassword }) =>
              mutation.mutate(
                { currentPassword, newPassword },
                {
                  onSuccess: () => {
                    reset();
                    navigate('/', { replace: true });
                  },
                },
              ),
            )}
          >
            <FormField
              id="currentPassword"
              label="Contraseña actual"
              type="password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
            <FormField
              id="newPassword"
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            <p className="text-sm text-muted-foreground">
              Entre 15 y 128 caracteres. Puedes usar una frase; no se exigen símbolos ni mayúsculas.
            </p>
            <FormField
              id="confirmation"
              label="Confirmar nueva contraseña"
              type="password"
              autoComplete="new-password"
              error={errors.confirmation?.message}
              {...register('confirmation')}
            />
            <ErrorNotice error={mutation.error} />
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="flex items-start justify-between gap-4">
        {!user?.mustChangePassword && (
          <Button asChild variant="ghost">
            <Link to="/">Volver al inicio</Link>
          </Button>
        )}
        <SessionActions />
      </div>
    </main>
  );
}
