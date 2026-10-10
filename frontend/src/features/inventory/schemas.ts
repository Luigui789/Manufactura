import { z } from 'zod';

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(3, 'El código debe tener al menos 3 caracteres')
    .max(50, 'El código admite hasta 50 caracteres'),
  name: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre admite hasta 100 caracteres'),
  location: z
    .string()
    .trim()
    .min(1, 'La ubicación es obligatoria')
    .max(255, 'La ubicación admite hasta 255 caracteres'),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWarehouseSchema = warehouseSchema.pick({
  code: true,
  name: true,
  location: true,
  isActive: true,
});

// Editar no cambia el estado: eso lo hace el endpoint /status.
export const updateWarehouseSchema = warehouseSchema.pick({
  code: true,
  name: true,
  location: true,
});

export const PRODUCT_TYPES = [
  'RAW_MATERIAL',
  'INTERMEDIATE',
  'FINISHED_GOOD',
  'CONSUMABLE',
] as const;

export const UNITS_OF_MEASURE = ['UNIT', 'GRAM', 'KILOGRAM', 'MILLILITER', 'LITER'] as const;

export const createProductSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(50, 'El código admite hasta 50 caracteres'),
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(200, 'El nombre admite hasta 200 caracteres'),
  category: z
    .string()
    .trim()
    .min(1, 'La categoría es obligatoria')
    .max(100, 'La categoría admite hasta 100 caracteres'),
  type: z.enum(PRODUCT_TYPES, {
    error: 'Selecciona un tipo de producto válido',
  }),
  unit: z.enum(UNITS_OF_MEASURE, {
    error: 'Selecciona una unidad de medida válida',
  }),
});

export const productSchema = createProductSchema.extend({
  id: z.string().uuid(),
  isActive: z.boolean(),
  isLotTracked: z.boolean(),
  requiresQualityInspection: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
