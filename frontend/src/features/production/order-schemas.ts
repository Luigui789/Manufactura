import { z } from 'zod';

import { calculationSchema } from './schemas';

function isValidLocalDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || value.startsWith('0000-')) {
    return false;
  }

  const date = new Date(`${value}:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

const optionalLocalDateTimeSchema = z
  .string()
  .refine(
    (value) => value === '' || isValidLocalDateTime(value),
    'Usa una fecha y hora válidas (AAAA-MM-DDTHH:mm)',
  )
  .optional();

export const createProductionOrderSchema = z
  .object({
    productId: z.string().uuid('Selecciona un producto válido'),
    bomVersionId: z.string().uuid('Selecciona una versión de BOM válida'),
    warehouseId: z.string().uuid('Selecciona un almacén válido'),
    quantityPlanned: calculationSchema.shape.quantityPlanned,
    plannedStartAt: optionalLocalDateTimeSchema,
    plannedEndAt: optionalLocalDateTimeSchema,
  })
  .superRefine(({ plannedStartAt, plannedEndAt }, context) => {
    if (
      plannedStartAt &&
      plannedEndAt &&
      isValidLocalDateTime(plannedStartAt) &&
      isValidLocalDateTime(plannedEndAt) &&
      plannedEndAt < plannedStartAt
    ) {
      context.addIssue({
        code: 'custom',
        message: 'El fin planificado debe ser igual o posterior al inicio',
        path: ['plannedEndAt'],
      });
    }
  });

export type ProductionOrderFormValues = z.infer<typeof createProductionOrderSchema>;
