import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

const ExactDecimal = Prisma.Decimal.clone({ precision: 60 });
const limit = new ExactDecimal('100000000000000');

export function bomQuantity(value: string | Prisma.Decimal): Prisma.Decimal {
  let quantity: Prisma.Decimal;
  try {
    if (typeof value !== 'string' && !Prisma.Decimal.isDecimal(value)) throw new Error();
    quantity = new ExactDecimal(value);
  } catch {
    throw new UnprocessableEntityException({
      code: 'INVALID_BOM_QUANTITY',
      message: 'La cantidad debe ser decimal',
    });
  }
  if (
    !quantity.isFinite() ||
    !quantity.greaterThan('0') ||
    quantity.decimalPlaces() > 4 ||
    quantity.greaterThanOrEqualTo(limit)
  ) {
    throw new UnprocessableEntityException({
      code: 'INVALID_BOM_QUANTITY',
      message: 'La cantidad debe ser positiva y caber en Decimal(18,4)',
    });
  }
  return quantity;
}

@Injectable()
export class BomCalculatorService {
  calculate(
    outputQuantity: string | Prisma.Decimal,
    quantityPlanned: string | Prisma.Decimal,
    items: readonly { productId: string; quantity: string | Prisma.Decimal }[],
  ) {
    const output = bomQuantity(outputQuantity);
    const planned = bomQuantity(quantityPlanned);
    if (items.length === 0)
      throw new UnprocessableEntityException({
        code: 'EMPTY_BOM',
        message: 'La fórmula necesita componentes',
      });
    return items.map((item) => {
      const scaled = bomQuantity(item.quantity).times(planned).times('10000');
      if (!scaled.mod(output).isZero()) {
        throw new UnprocessableEntityException({
          code: 'BOM_CALCULATION_PRECISION',
          message:
            'El requerimiento no es representable con cuatro decimales; ajustá la cantidad o la fórmula',
        });
      }
      const required = scaled.div(output).div('10000');
      bomQuantity(required);
      return { productId: item.productId, required: required.toFixed(4) };
    });
  }
}
