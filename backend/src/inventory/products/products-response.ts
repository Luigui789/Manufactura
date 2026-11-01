import { ApiProperty } from '@nestjs/swagger';

import { ProductType, UnitOfMeasure } from '../../generated/prisma/client.js';

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'MP-ACEITE' })
  code: string;

  @ApiProperty({ example: 'Aceite usado recolectado' })
  name: string;

  @ApiProperty({ example: 'Aceites' })
  category: string;

  @ApiProperty({ enum: ProductType })
  type: ProductType;

  @ApiProperty({ enum: UnitOfMeasure })
  unit: UnitOfMeasure;

  @ApiProperty()
  isLotTracked: boolean;

  @ApiProperty()
  requiresQualityInspection: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class ProductResultDto {
  @ApiProperty({ type: ProductResponseDto })
  data: ProductResponseDto;

  @ApiProperty({ example: 'Producto encontrado' })
  message: string;
}

export class ProductsPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 6 })
  total: number;
}

export class ProductsListDto {
  @ApiProperty({ type: [ProductResponseDto] })
  data: ProductResponseDto[];

  @ApiProperty({ type: ProductsPaginationMetaDto })
  meta: ProductsPaginationMetaDto;
}
