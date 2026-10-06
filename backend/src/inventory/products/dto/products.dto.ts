import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';

import { ProductType, UnitOfMeasure } from '../../../generated/prisma/client.js';
import { RawValue, TrimText } from '../../catalog.dto.js';

export class CreateProductDto {
  @ApiProperty({ example: 'MP-ACEITE', minLength: 1, maxLength: 50 })
  @TrimText()
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({
    example: 'Aceite usado recolectado',
    minLength: 1,
    maxLength: 200,
  })
  @TrimText()
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiProperty({ example: 'Aceites', minLength: 1, maxLength: 100 })
  @TrimText()
  @IsString()
  @Length(1, 100)
  category: string;

  @ApiProperty({ enum: ProductType })
  @RawValue()
  @IsEnum(ProductType)
  type: ProductType;

  @ApiProperty({ enum: UnitOfMeasure })
  @RawValue()
  @IsEnum(UnitOfMeasure)
  unit: UnitOfMeasure;
}

export class UpdateProductDto extends PartialType(CreateProductDto, {
  skipNullProperties: false,
}) {}
