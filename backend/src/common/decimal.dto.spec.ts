import 'reflect-metadata';

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { IsPositiveDecimalString } from './decimal.dto.js';

class QuantityDto {
  @IsPositiveDecimalString()
  quantity: string;
}

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function validate(input: unknown): Promise<QuantityDto> {
  return pipe.transform(input, {
    type: 'body',
    metatype: QuantityDto,
  }) as Promise<QuantityDto>;
}

describe('Cantidades decimales de entrada HTTP', () => {
  it('conserva el metadato String usado por la conversión implícita', () => {
    expect(Reflect.getMetadata('design:type', QuantityDto.prototype, 'quantity')).toBe(String);
  });

  it.each([
    '0.0001',
    '1',
    '0.1',
    '0.2',
    '12.5000',
    '0001.2500',
    '99999999999999',
    '99999999999999.9999',
  ])('acepta y conserva la cadena %s sin convertirla ni redondearla', async (quantity) => {
    const result = await validate({ quantity });

    expect(result).toBeInstanceOf(QuantityDto);
    expect(result.quantity).toBe(quantity);
    expect(typeof result.quantity).toBe('string');
  });

  it.each([
    { quantity: '0', reason: 'cero entero' },
    { quantity: '0.0000', reason: 'cero decimal' },
    { quantity: '0000.0000', reason: 'cero con relleno' },
    { quantity: '-1', reason: 'cantidad negativa' },
    { quantity: '-0.0001', reason: 'fracción negativa' },
    { quantity: '100000000000000', reason: 'más de 14 dígitos enteros' },
    { quantity: '99999999999999.99999', reason: 'más de 4 decimales en el límite superior' },
    { quantity: '0.00001', reason: 'cantidad inferior a la precisión admitida' },
    { quantity: '1.00000', reason: 'quinto decimal aunque sea cero' },
    { quantity: '1e3', reason: 'notación exponencial' },
    { quantity: '1E-4', reason: 'notación exponencial negativa' },
    { quantity: '0x10', reason: 'notación hexadecimal' },
    { quantity: 'NaN', reason: 'NaN en texto' },
    { quantity: 'Infinity', reason: 'infinito en texto' },
    { quantity: '', reason: 'cadena vacía' },
    { quantity: '   ', reason: 'solo espacios' },
    { quantity: ' 1', reason: 'espacio inicial' },
    { quantity: '1 ', reason: 'espacio final' },
    { quantity: '1\n', reason: 'salto de línea final' },
    { quantity: '+1', reason: 'signo positivo explícito' },
    { quantity: '.5', reason: 'parte entera omitida' },
    { quantity: '1.', reason: 'parte decimal vacía' },
    { quantity: '1,5', reason: 'coma decimal' },
    { quantity: '1,000.5', reason: 'separador de miles' },
    { quantity: '1 000', reason: 'espacio entre dígitos' },
    { quantity: 12.5, reason: 'número JSON con conversión implícita habilitada' },
    { quantity: 1, reason: 'entero JSON con conversión implícita habilitada' },
    { quantity: 0, reason: 'cero numérico' },
    { quantity: null, reason: 'null' },
    { quantity: true, reason: 'booleano' },
    { quantity: ['1.5'], reason: 'arreglo' },
    { quantity: { value: '1.5' }, reason: 'objeto' },
  ])('rechaza $reason', async ({ quantity }) => {
    await expect(validate({ quantity })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige indicar la cantidad', async () => {
    await expect(validate({})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza campos adicionales junto a una cantidad válida', async () => {
    await expect(validate({ quantity: '1.2500', extra: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
