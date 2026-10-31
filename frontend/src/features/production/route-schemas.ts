import { z } from 'zod';

export const routeOperationSchema = z.object({
  sequence: z.number().int().min(1, 'La secuencia debe ser positiva').max(2147483647),

  name: z.string().trim().min(1, 'Introduce el nombre de la operación').max(120),

  description: z.string().trim().max(500).nullable().optional(),

  standardMinutes: z
    .string()
    .regex(
      /^(?!0+(?:\.0+)?$)\d{1,10}(?:\.\d{1,2})?$/,
      'Introduce minutos positivos con hasta dos decimales',
    ),
});

export const routeMetadataSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Introduce un código')
    .max(32)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, 'Introduce un nombre').max(120),
  description: z.string().trim().max(500).nullable().optional(),
});

export const routeOperationsSchema = z
  .object({ operations: z.array(routeOperationSchema).min(1, 'Agrega al menos una operación') })
  .superRefine(({ operations }, ctx) => {
    const seen = new Set<number>();

    operations.forEach((op, i) => {
      if (seen.has(op.sequence))
        ctx.addIssue({
          code: 'custom',
          path: ['operations', i, 'sequence'],
          message: 'La secuencia no puede repetirse',
        });
      seen.add(op.sequence);
    });
  });

export const createProductionRouteSchema = routeMetadataSchema
  .extend({ productId: z.string().uuid('Selecciona un producto') })
  .and(routeOperationsSchema);

export function formatStandardMinutes(value: string) {
  const minutes = Number(value);

  return (
    new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(minutes) +
    ' min' +
    (minutes >= 1440
      ? ' (' +
        new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(minutes / 1440) +
        ' días)'
      : '')
  );
}
