import { plainToInstance, Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, validateSync } from 'class-validator';

import {
  NormalizePassword,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../auth/password-policy.js';
import { normalizeEmail } from '../common/normalize-email.js';
import type { InitialAdminInput } from '../users/users.service.js';

/** Mismas reglas que el alta por la API (CreateUserDto), leídas del entorno. */
class AdminInputDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'ADMIN_EMAIL no tiene un formato de correo válido' })
  @MaxLength(254, { message: 'ADMIN_EMAIL no puede superar 254 caracteres' })
  ADMIN_EMAIL: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'ADMIN_FULL_NAME es obligatorio' })
  @Length(2, 100, { message: 'ADMIN_FULL_NAME debe tener entre 2 y 100 caracteres' })
  ADMIN_FULL_NAME: string;

  @NormalizePassword()
  @IsString({ message: `ADMIN_PASSWORD es obligatoria. ${PASSWORD_LENGTH_MESSAGE}` })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `ADMIN_PASSWORD: ${PASSWORD_LENGTH_MESSAGE}`,
  })
  ADMIN_PASSWORD: string;
}

export class AdminInputError extends Error {}

/**
 * Valida ADMIN_EMAIL, ADMIN_FULL_NAME y ADMIN_PASSWORD antes de tocar la base.
 * Los mensajes nunca incluyen el valor recibido.
 */
export function readAdminInput(env: Record<string, string | undefined>): InitialAdminInput {
  const missing = (['ADMIN_EMAIL', 'ADMIN_FULL_NAME', 'ADMIN_PASSWORD'] as const).filter(
    (name) => !env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new AdminInputError(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}. ` +
        'Consulta docs/setup.md para definirlas sin dejarlas en el historial.',
    );
  }
  const dto = plainToInstance(AdminInputDto, {
    ADMIN_EMAIL: env.ADMIN_EMAIL,
    ADMIN_FULL_NAME: env.ADMIN_FULL_NAME,
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
  });
  const errors = validateSync(dto);
  if (errors.length > 0) {
    const detail = errors.map((error) => Object.values(error.constraints ?? {})[0]).join('\n  - ');
    throw new AdminInputError(`Variables de entorno inválidas:\n  - ${detail}`);
  }
  return { email: dto.ADMIN_EMAIL, fullName: dto.ADMIN_FULL_NAME, password: dto.ADMIN_PASSWORD };
}
