import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Introduce un correo válido')
  .max(254);
export const passwordSchema = z
  .string()
  .transform((value) => value.normalize('NFC'))
  .refine(
    (value) => Array.from(value).length >= 15 && Array.from(value).length <= 128,
    'La contraseña debe tener entre 15 y 128 caracteres',
  );
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Introduce tu contraseña')
    .refine(
      (value) => Array.from(value).length <= 128,
      'La contraseña no puede superar 128 caracteres',
    ),
});
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Introduce tu contraseña actual')
      .refine(
        (value) => Array.from(value).length <= 128,
        'La contraseña no puede superar 128 caracteres',
      ),
    newPassword: passwordSchema,
    confirmation: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmation.normalize('NFC'), {
    message: 'Las contraseñas no coinciden',
    path: ['confirmation'],
  });
