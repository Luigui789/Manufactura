import { ApiProperty } from '@nestjs/swagger';

export class SupplierResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'PROV-ACEITES' })
  code: string;

  @ApiProperty({ example: 'Recicladora del Pacífico S.A.' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: 'J0310000000001' })
  taxId: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'compras@recicladora.com.ni' })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+505 2222-0000' })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Km 7 Carretera Norte, Managua' })
  address: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class SupplierResultDto {
  @ApiProperty({ type: SupplierResponseDto })
  data: SupplierResponseDto;

  @ApiProperty({ example: 'Proveedor encontrado' })
  message: string;
}

export class SuppliersPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 4 })
  total: number;
}

export class SuppliersListDto {
  @ApiProperty({ type: [SupplierResponseDto] })
  data: SupplierResponseDto[];

  @ApiProperty({ type: SuppliersPaginationMetaDto })
  meta: SuppliersPaginationMetaDto;
}
