import { z } from 'zod';

import { positiveQuantitySchema as quantitySchema } from '@/lib/decimal';

export const createBomSchema = z.object({
  productId: z.string().uuid('Selecciona un producto válido'),
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'El nombre admite hasta 120 caracteres'),
});

export const bomVersionSchema = z
  .object({
    outputQuantity: quantitySchema,
    items: z
      .array(
        z.object({
          productId: z.string().uuid('Selecciona un componente válido'),
          quantity: quantitySchema,
        }),
      )
      .min(1, 'Agrega al menos un componente'),
  })
  .superRefine(({ items }, context) => {
    const productIds = new Set<string>();
    items.forEach((item, index) => {
      const id = item.productId.toLowerCase();
      if (productIds.has(id)) {
        context.addIssue({
          code: 'custom',
          message: 'No se puede repetir un componente',
          path: ['items', index, 'productId'],
        });
      }
      productIds.add(id);
    });
  });

export const calculationSchema = z.object({
  quantityPlanned: quantitySchema,
});

export type CreateBomFormData = z.infer<typeof createBomSchema>;
export type BomVersionFormData = z.infer<typeof bomVersionSchema>;
export type CalculationFormData = z.infer<typeof calculationSchema>;
