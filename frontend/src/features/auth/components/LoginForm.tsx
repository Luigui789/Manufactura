import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ApiError } from '@/services/api-client';
import { useLogin } from '../hooks/use-auth';
import { loginSchema } from '../schemas';

export function LoginForm() {
  const mutation = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const error =
    mutation.error instanceof ApiError && mutation.error.status === 401
      ? new Error('Correo o contraseña incorrectos')
      : mutation.error instanceof ApiError && mutation.error.status === 429
        ? new Error('Demasiados intentos. Espera un minuto')
        : mutation.error;
  return (
    <form noValidate className="space-y-5" onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      <FormField
        id="email"
        label="Correo electrónico"
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <ErrorNotice error={error} />
      <Button className="w-full" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}
