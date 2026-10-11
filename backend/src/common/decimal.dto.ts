import { applyDecorators } from '@nestjs/common';
import { ValidateBy, type ValidationOptions } from 'class-validator';

import { RawValue } from './catalog.dto.js';

// Decimal(18,4): hasta 14 dígitos enteros y 4 decimales, sin redondear.
const QUANTITY_PATTERN = /^[0-9]{1,14}(?:\.[0-9]{1,4})?$/;

export function isPositiveDecimalString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    QUANTITY_PATTERN.test(value) &&
    /[1-9]/.test(value)
  );
}

// Para cantidades de entrada HTTP. Conserva el texto y rechaza números JSON,
// incluso cuando ValidationPipe tiene enableImplicitConversion habilitado.
export function IsPositiveDecimalString(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    RawValue(),
    ValidateBy(
      {
        name: 'isPositiveDecimalString',
        validator: {
          validate: isPositiveDecimalString,
          defaultMessage: (args) =>
            `${args?.property ?? 'La cantidad'} debe ser una cadena decimal mayor que cero, con hasta 14 dígitos enteros y 4 decimales`,
        },
      },
      options,
    ),
  );
}
