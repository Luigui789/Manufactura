import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { TrimText, TrimUpperCase } from '../../catalog.dto.js';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'ALM-CENTRAL' })
  @TrimUpperCase()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Almacén Central' })
  @TrimText()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, example: 'Nave Norte, Pasillo A' })
  @TrimText()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}
