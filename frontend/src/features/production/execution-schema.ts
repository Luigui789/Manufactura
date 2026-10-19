import { z } from 'zod';
import { positiveQuantitySchema } from '@/lib/decimal';
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida')
  .refine((value) => {
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Usa una fecha válida');

export const completeOrderSchema = z.object({
  quantityProduced: positiveQuantitySchema,
  expiresAt: z.union([z.literal(''), calendarDateSchema]),
  allocations: z.array(
    z.object({
      productId: z.string().uuid(),
      lots: z.array(z.object({ lotId: z.string().uuid(), quantity: positiveQuantitySchema })),
    }),
  ),
});
export type CompleteOrderValues = z.infer<typeof completeOrderSchema>;
export function quantityUnits(value: string): bigint {
  const [integer, fraction = ''] = value.split('.');
  return BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
