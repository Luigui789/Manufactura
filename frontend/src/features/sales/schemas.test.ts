import { describe, expect, it } from 'vitest';
import { EMPTY_CUSTOMER_FORM, customerSchema, toCustomerPayload } from './schemas';

const valid = {
  ...EMPTY_CUSTOMER_FORM,
  code: 'CLI-SUPERNORTE',
  name: 'Supermercados del Norte S.A.',
};

describe('customerSchema', () => {
  it('acepta un cliente con solo código y razón social', () => {
    expect(customerSchema.safeParse(valid).success).toBe(true);
  });

  it('recorta espacios antes de validar', () => {
    const result = customerSchema.parse({ ...valid, name: '  Supermercados S.A.  ' });
    expect(result.name).toBe('Supermercados S.A.');
  });

  it.each([
    { field: 'code', value: 'AB' },
    { field: 'code', value: 'X'.repeat(51) },
    { field: 'name', value: '   ' },
    { field: 'name', value: 'X'.repeat(201) },
    { field: 'email', value: 'no-es-correo' },
    { field: 'taxId', value: 'X'.repeat(51) },
    { field: 'address', value: 'X'.repeat(256) },
  ])('rechaza $field = $value', ({ field, value }) => {
    expect(customerSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});

describe('toCustomerPayload', () => {
  it('envía null en los campos de contacto vacíos y conserva código y nombre', () => {
    expect(toCustomerPayload({ ...valid, phone: '2222-0000' })).toEqual({
      code: 'CLI-SUPERNORTE',
      name: 'Supermercados del Norte S.A.',
      taxId: null,
      email: null,
      phone: '2222-0000',
      address: null,
    });
  });
});
