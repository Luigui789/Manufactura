import { describe, it, expect } from 'vitest';
import { supplierSchema } from './schemas';

describe('supplierSchema', () => {
  it('debe validar correctamente un proveedor con datos completos', () => {
    const validData = {
      name: 'Eco Proveedor S.A.',
      phone: '8888-8888',
      email: 'contacto@ecoproveedor.com',
      address: 'Managua, Nicaragua',
    };
    const result = supplierSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('debe fallar si faltan campos obligatorios', () => {
    const invalidData = { name: '', phone: '', email: '', address: '' };
    const result = supplierSchema.safeParse(invalidData);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.format();
      expect(errors.name?._errors).toContain('El nombre o razón social es obligatorio');
      expect(errors.phone?._errors).toContain('El teléfono es obligatorio');
      expect(errors.address?._errors).toContain('La dirección es obligatoria');
    }
  });

  it('debe fallar si el correo electrónico tiene un formato incorrecto', () => {
    const invalidEmailData = {
      name: 'Eco Proveedor S.A.',
      phone: '8888-8888',
      email: 'correo-no-valido',
      address: 'Managua, Nicaragua',
    };
    const result = supplierSchema.safeParse(invalidEmailData);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.format().email?._errors).toContain('Debe ser un correo electrónico válido');
    }
  });
});