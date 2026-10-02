import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

import { normalizeEmail } from '../../common/normalize-email.js';
import {
  NormalizePassword,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password-policy.js';

export class LoginDto {
  @ApiProperty({ example: 'maria.lopez@ecosoap.example' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @MaxLength(254, { message: 'El correo no puede superar 254 caracteres' })
  email: string;

  // El login no aplica la política: las contraseñas guardadas ya la cumplen.
  @ApiProperty({ format: 'password' })
  @IsString({ message: 'La contraseña es obligatoria' })
  @Length(1, PASSWORD_MAX_LENGTH, { message: 'La contraseña es obligatoria' })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString({ message: 'La contraseña actual es obligatoria' })
  @Length(1, PASSWORD_MAX_LENGTH, { message: 'La contraseña actual es obligatoria' })
  currentPassword: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @NormalizePassword()
  @IsString({ message: PASSWORD_LENGTH_MESSAGE })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, { message: PASSWORD_LENGTH_MESSAGE })
  newPassword: string;
}
