import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsString, Length, ValidateIf } from 'class-validator';

import { RawValue, TrimText, TrimUpperCase } from '../../catalog.dto.js';

export class CreateWarehouseDto {
  @ApiProperty({
    example: 'ALM-CENTRAL',
    minLength: 3,
    maxLength: 50,
  })
  @TrimUpperCase()
  @IsString()
  @Length(3, 50)
  code: string;

  @ApiProperty({
    example: 'Almacén Central',
    minLength: 3,
    maxLength: 100,
  })
  @TrimText()
  @IsString()
  @Length(3, 100)
  name: string;

  @ApiProperty({
    example: 'Nave Norte, Pasillo A',
    minLength: 1,
    maxLength: 255,
  })
  @TrimText()
  @IsString()
  @Length(1, 255)
  location: string;

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
  })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}

export class UpdateWarehouseDto extends PartialType(
  OmitType(CreateWarehouseDto, ['isActive'] as const),
  { skipNullProperties: false },
) {}
