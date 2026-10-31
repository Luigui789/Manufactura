import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { CarbonValueError } from './carbon-math.js';
import { IncompatibleUnitsError } from './carbon-units.js';

/** Traduce reglas de cálculo y restricciones físicas a códigos HTTP del contrato. */
export function translateSustainabilityError(
  error: unknown,
  conflicts: Record<string, string> = {},
): never {
  if (error instanceof CarbonValueError || error instanceof IncompatibleUnitsError)
    throw new UnprocessableEntityException({
      code: 'INVALID_CARBON_VALUE',
      message: error.message,
    });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta ?? {});
    const match = Object.entries(conflicts).find(([key]) => target.includes(key));
    throw new ConflictException(match?.[1] ?? 'El registro ya existe');
  }
  // Defensa física: triggers de inmutabilidad (55000) y CHECK de base (23514).
  const message = error instanceof Error ? error.message : '';
  if (/immutable|55000/.test(message))
    throw new ConflictException('La huella finalizada es inmutable');
  throw error;
}
