import { z } from 'zod';

import { positiveQuantitySchema, priceSchema } from '@/lib/decimal';

const calendar = z
  .string()
  .refine(
    (value) =>
      value === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !value.startsWith('0000-') &&
        Number.isFinite(new Date(value).getTime()) &&
        new Date(value).toISOString().slice(0, 10) === value),
    'Usa una fecha calendario válida',
  );

const quantity = positiveQuantitySchema;

export const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid('Selecciona un proveedor'),
  expectedDate: calendar,

  items: z
    .array(
      z.object({
        productId: z.string().uuid('Selecciona un producto'),
        quantity,

        unitPrice: priceSchema,
      }),
    )
    .min(1, 'Agrega al menos una línea'),
});

export const receiptSchema = z.object({
  receivedAt: z
    .string()
    .refine(
      (value) =>
        value === '' ||
        (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
          Number.isFinite(new Date(value + ':00Z').getTime()) &&
          new Date(value + ':00Z').toISOString().slice(0, 16) === value),
      'Usa una fecha y hora válidas',
    ),

  notes: z.string().max(500),

  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid('Selecciona una línea'),
        warehouseId: z.string().uuid('Selecciona un almacén'),
        quantity,
        expiresAt: calendar,
      }),
    )
    .min(1, 'Agrega al menos una línea'),
});

export type PurchaseOrderValues = z.infer<typeof purchaseOrderSchema>;

export type ReceiptValues = z.infer<typeof receiptSchema>;
