import { z } from 'zod';
import { CARBON_CATEGORIES, CARBON_UNITS } from './api/sustainability';

const decimal = /^\d{1,12}(?:\.\d{1,8})?$/;
const text = (max: number, label: string) =>
  z.string().trim().min(1, `${label} es obligatorio`).max(max, `Máximo ${max} caracteres`);

export const factorSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(50)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Usa letras, números, punto, guion o guion bajo'),
  name: text(150, 'El nombre'),
  category: z.enum(CARBON_CATEGORIES),
  activityUnit: z.enum(CARBON_UNITS),
  kgCo2ePerUnit: z
    .string()
    .trim()
    .regex(decimal, 'Coeficiente no negativo: hasta 12 enteros y 8 decimales'),
  productId: z.string(),
  sourceName: text(200, 'La fuente'),
  sourceReference: text(1000, 'La referencia de la fuente'),
  sourceYear: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && +v >= 1900 && +v <= 2100), 'Año 1900–2100'),
  notes: z.string().trim().max(1000),
});
export type FactorForm = z.infer<typeof factorSchema>;

export const manualActivitySchema = z.object({
  category: z.enum(CARBON_CATEGORIES),
  emissionFactorId: z.string().min(1, 'Selecciona un factor'),
  description: text(250, 'La descripción'),
  quantity: z
    .string()
    .trim()
    .regex(decimal, 'Cantidad: hasta 12 enteros y 8 decimales')
    .refine((v) => /[1-9]/.test(v), 'La cantidad debe ser mayor que cero'),
});
export type ManualActivityForm = z.infer<typeof manualActivitySchema>;

export const finalizeSchema = z.object({
  boundaryNotes: z
    .string()
    .trim()
    .min(10, 'Describe los límites del sistema (mínimo 10 caracteres)')
    .max(2000, 'Máximo 2000 caracteres'),
});
