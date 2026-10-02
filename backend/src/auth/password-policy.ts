import { Transform } from 'class-transformer';

/**
 * Política de contraseñas (ADR 009): solo longitud, sin reglas de composición.
 * Alineada parcialmente con NIST SP 800-63B-4; no se afirma su cumplimiento
 * porque no se compara con listas de contraseñas comprometidas.
 */
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_LENGTH_MESSAGE =
  `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres. ` +
  'Puedes usar una frase con espacios.';

/** Normaliza a NFC antes de validar la longitud. Nunca recorta espacios. */
export function NormalizePassword(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFC') : value,
  );
}
