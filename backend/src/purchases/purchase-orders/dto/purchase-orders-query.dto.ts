import { IsEnum, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { TrimText } from '../../../common/catalog.dto.js';
export class PurchaseOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;
  @ApiPropertyOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsUUID()
  supplierId?: string;
  @ApiPropertyOptional()
  @TrimText()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;
}
