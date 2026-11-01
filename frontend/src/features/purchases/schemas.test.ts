import { describe, expect, it } from 'vitest';
import { EMPTY_SUPPLIER_FORM, supplierSchema, toSupplierPayload } from './schemas';

const valid = {
  ...EMPTY_SUPPLIER_FORM,
  code: 'PROV-ACEITES',
  name: 'Recicladora del Pacífico S.A.',
};

describe('supplierSchema', () => {
  it('acepta un proveedor con solo código y razón social', () => {
    expect(supplierSchema.safeParse(valid).success).toBe(true);
  });

  it('recorta espacios antes de validar', () => {
    const result = supplierSchema.parse({ ...valid, name: '  Recicladora S.A.  ' });
    expect(result.name).toBe('Recicladora S.A.');
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
    expect(supplierSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});

describe('toSupplierPayload', () => {
  it('envía null en los campos de contacto vacíos y conserva código y nombre', () => {
    expect(toSupplierPayload({ ...valid, phone: '2222-0000' })).toEqual({
      code: 'PROV-ACEITES',
      name: 'Recicladora del Pacífico S.A.',
      taxId: null,
      email: null,
      phone: '2222-0000',
      address: null,
    });
  });
});
