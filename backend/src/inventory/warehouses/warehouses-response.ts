import { ApiProperty } from '@nestjs/swagger';

export class WarehouseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ALM-CENTRAL' })
  code: string;

  @ApiProperty({ example: 'Almacén Central' })
  name: string;

  @ApiProperty({ example: 'Nave Norte, Pasillo A' })
  location: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class WarehouseResultDto {
  @ApiProperty({ type: WarehouseResponseDto })
  data: WarehouseResponseDto;

  @ApiProperty({ example: 'Almacén encontrado' })
  message: string;
}

export class WarehousesPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 2 })
  total: number;
}

export class WarehousesListDto {
  @ApiProperty({ type: [WarehouseResponseDto] })
  data: WarehouseResponseDto[];

  @ApiProperty({ type: WarehousesPaginationMetaDto })
  meta: WarehousesPaginationMetaDto;
}
