import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length, MaxLength } from 'class-validator';

import {
  NormalizePassword,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth/password-policy.js';
import { normalizeEmail } from '../../common/normalize-email.js';
import { RoleCode } from '../../generated/prisma/client.js';

const ROLE_MESSAGE = `El rol debe ser uno de: ${Object.values(RoleCode).join(', ')}`;

export class CreateUserDto {
  @ApiProperty({ example: 'María López', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre es obligatorio' })
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  fullName: string;

  @ApiProperty({ example: 'maria.lopez@ecosoap.example' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @MaxLength(254, { message: 'El correo no puede superar 254 caracteres' })
  email: string;

  @ApiProperty({ enum: RoleCode })
  @IsEnum(RoleCode, { message: ROLE_MESSAGE })
  role: RoleCode;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Contraseña temporal: el usuario deberá cambiarla en su primer acceso',
  })
  @NormalizePassword()
  @IsString({ message: PASSWORD_LENGTH_MESSAGE })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, { message: PASSWORD_LENGTH_MESSAGE })
  temporaryPassword: string;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: RoleCode })
  @IsEnum(RoleCode, { message: ROLE_MESSAGE })
  role: RoleCode;
}

export class ResetPasswordDto {
  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Contraseña temporal: el usuario deberá cambiarla en su siguiente acceso',
  })
  @NormalizePassword()
  @IsString({ message: PASSWORD_LENGTH_MESSAGE })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, { message: PASSWORD_LENGTH_MESSAGE })
  temporaryPassword: string;
}
