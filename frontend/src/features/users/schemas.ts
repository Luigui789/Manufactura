import { z } from 'zod';
import { emailSchema, passwordSchema } from '@/features/auth/schemas';
import { ROLE_CODES } from '@/features/auth/types';

export const roleSchema = z.object({ role: z.enum(ROLE_CODES) });
const passwordFields = { temporaryPassword: passwordSchema, confirmation: z.string() };
const matches = (data: { temporaryPassword: string; confirmation: string }) =>
  data.temporaryPassword === data.confirmation.normalize('NFC');
const mismatch = { message: 'Las contraseñas no coinciden', path: ['confirmation'] };
export const createUserSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Introduce un nombre de al menos 2 caracteres').max(100),
    email: emailSchema,
    role: z.enum(ROLE_CODES),
    ...passwordFields,
  })
  .refine(matches, mismatch);
export const resetPasswordSchema = z.object(passwordFields).refine(matches, mismatch);
