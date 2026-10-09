import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1, 'El nombre o razón social es obligatorio'),
  phone: z.string().min(1, 'El teléfono es obligatorio'),
  email: z
    .string()
    .email('Debe ser un correo electrónico válido')
    .min(1, 'El correo es obligatorio'),
  address: z.string().min(1, 'La dirección es obligatoria'),
});

export type SupplierFormData = z.infer<typeof supplierSchema>;
