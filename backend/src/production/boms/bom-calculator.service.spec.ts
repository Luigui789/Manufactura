import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { BomCalculatorService, bomQuantity } from './bom-calculator.service.js';

const calculator = new BomCalculatorService();
describe('BomCalculatorService', () => {
  it('calcula la fórmula inicial de 100 jabones sin convertir unidades', () => {
    expect(
      calculator.calculate('1', '100', [
        { productId: 'aceite', quantity: '500' },
        { productId: 'soda', quantity: '70' },
        { productId: 'agua', quantity: '180' },
        { productId: 'fragancia', quantity: '5' },
      ]),
    ).toEqual([
      { productId: 'aceite', required: '50000.0000' },
      { productId: 'soda', required: '7000.0000' },
      { productId: 'agua', required: '18000.0000' },
      { productId: 'fragancia', required: '500.0000' },
    ]);
  });
  it('preserva resultado exacto aunque el factor de escala sea periódico', () => {
    expect(calculator.calculate('3', '1', [{ productId: 'x', quantity: '3' }])[0].required).toBe(
      '1.0000',
    );
  });
  it('admite el mínimo positivo representable', () => {
    expect(
      calculator.calculate('1', '0.0001', [{ productId: 'x', quantity: '1' }])[0].required,
    ).toBe('0.0001');
  });
  it('rechaza la división no representable, sin redondearla', () => {
    expect(() => calculator.calculate('3', '1', [{ productId: 'x', quantity: '1' }])).toThrow(
      'El requerimiento no es representable',
    );
  });
  it('rechaza desbordamiento del resultado y subescala positiva', () => {
    expect(() =>
      calculator.calculate('1', '99999999999999.9999', [{ productId: 'x', quantity: '2' }]),
    ).toThrow();
    expect(() =>
      calculator.calculate('2', '0.0001', [{ productId: 'x', quantity: '1' }]),
    ).toThrow();
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '0.00001', '100000000000000'])(
    'rechaza cantidad inválida %s',
    (value) => {
      expect(() => bomQuantity(value)).toThrow();
    },
  );
  it('admite el límite de Decimal(18,4) y Prisma.Decimal', () => {
    expect(bomQuantity('99999999999999.9999').toFixed(4)).toBe('99999999999999.9999');
    expect(bomQuantity(new Prisma.Decimal('1.5')).toFixed(4)).toBe('1.5000');
  });
  it('rechaza componentes vacíos y cantidades number en ejecución', () => {
    expect(() => calculator.calculate('1', '1', [])).toThrow();
    expect(() => bomQuantity(1 as unknown as string)).toThrow();
  });
});
