import { z } from 'zod';
import type { CreateCustomerPayload } from './types';

const optionalText = (max: number) => z.string().trim().max(max, `Admite hasta ${max} caracteres`);

// Mismas reglas que CreateCustomerDto; los campos de contacto vacíos son válidos.
export const customerSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'El código debe tener al menos 3 caracteres')
    .max(50, 'El código admite hasta 50 caracteres'),
  name: z
    .string()
    .trim()
    .min(3, 'La razón social debe tener al menos 3 caracteres')
    .max(200, 'La razón social admite hasta 200 caracteres'),
  taxId: optionalText(50),
  email: optionalText(254).refine(
    (value) => value === '' || z.email().safeParse(value).success,
    'Debe ser un correo electrónico válido',
  ),
  phone: optionalText(50),
  address: optionalText(255),
});

export type CustomerFormData = z.infer<typeof customerSchema>;

export const EMPTY_CUSTOMER_FORM: CustomerFormData = {
  code: '',
  name: '',
  taxId: '',
  email: '',
  phone: '',
  address: '',
};

// Un campo de contacto vacío viaja como null para que el backend lo deje sin dato.
export function toCustomerPayload(data: Partial<CustomerFormData>): Partial<CreateCustomerPayload> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      key === 'code' || key === 'name' || value !== '' ? value : null,
    ]),
  ) as Partial<CreateCustomerPayload>;
}
