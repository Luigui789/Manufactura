import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { SaleOrderStatus } from '../../../generated/prisma/client.js';
import { TrimText } from '../../../common/catalog.dto.js';

export class SaleOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SaleOrderStatus })
  @ValidateIf((_o: unknown, value: unknown) => value !== undefined)
  @IsEnum(SaleOrderStatus)
  status?: SaleOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @TrimText()
  @ValidateIf((_o: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;
}
