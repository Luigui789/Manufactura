import { ApiProperty } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'CLI-SUPERNORTE' })
  code: string;

  @ApiProperty({ example: 'Supermercados del Norte S.A.' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: 'J0310000000001' })
  taxId: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'compras@supernorte.com.ni' })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+505 2222-0000' })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Bello Horizonte, Managua' })
  address: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class CustomerResultDto {
  @ApiProperty({ type: CustomerResponseDto })
  data: CustomerResponseDto;

  @ApiProperty({ example: 'Cliente encontrado' })
  message: string;
}

export class CustomersPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 4 })
  total: number;
}

export class CustomersListDto {
  @ApiProperty({ type: [CustomerResponseDto] })
  data: CustomerResponseDto[];

  @ApiProperty({ type: CustomersPaginationMetaDto })
  meta: CustomersPaginationMetaDto;
}
