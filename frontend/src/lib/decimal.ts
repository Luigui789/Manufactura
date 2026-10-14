import { z } from 'zod';
export const positiveQuantitySchema = z
  .string()
  .regex(/^\d{1,14}(?:\.\d{1,4})?$/, 'Usa hasta 14 enteros y 4 decimales')
  .refine((value) => /[1-9]/.test(value), 'La cantidad debe ser mayor que cero');
export const priceSchema = z
  .string()
  .regex(/^[0-9]{1,10}(?:\.[0-9]{1,4})?$/, 'Precio no negativo: hasta 10 enteros y 4 decimales');
