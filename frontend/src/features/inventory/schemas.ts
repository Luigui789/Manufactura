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

// Editar no cambia el estado: eso lo hace el endpoint /status
export const updateWarehouseSchema = warehouseSchema.pick({
  code: true,
  name: true,
  location: true,
});
