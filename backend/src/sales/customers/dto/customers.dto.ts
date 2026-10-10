import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

import { TrimText, TrimUpperCase } from '../../../common/catalog.dto.js';
import { normalizeEmail } from '../../../common/normalize-email.js';

// Correo en su forma canónica, la misma que User.email.
const NormalizedEmail = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];
    return typeof value === 'string' ? normalizeEmail(value) : value;
  });

export class CreateCustomerDto {
  @ApiProperty({ example: 'CLI-SUPERNORTE', minLength: 3, maxLength: 50 })
  @TrimUpperCase()
  @IsString()
  @Length(3, 50)
  code: string;

  @ApiProperty({ example: 'Supermercados del Norte S.A.', minLength: 3, maxLength: 200 })
  @TrimText()
  @IsString()
  @Length(3, 200)
  name: string;

  // Los campos de contacto son opcionales: null los deja sin dato.
  @ApiPropertyOptional({ type: String, nullable: true, example: 'J0310000000001', maxLength: 50 })
  @TrimText()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  taxId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'compras@supernorte.com.ni',
    maxLength: 254,
  })
  @NormalizedEmail()
  @IsOptional()
  @IsEmail({}, { message: 'email debe ser un correo válido' })
  @Length(3, 254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '+505 2222-0000', maxLength: 50 })
  @TrimText()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  phone?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Bello Horizonte, Managua',
    maxLength: 255,
  })
  @TrimText()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  address?: string | null;
}

// skipNullProperties: false rechaza null en code y name; los campos de contacto
// conservan su @IsOptional y admiten null para borrar el dato.
export class UpdateCustomerDto extends PartialType(CreateCustomerDto, {
  skipNullProperties: false,
}) {}
