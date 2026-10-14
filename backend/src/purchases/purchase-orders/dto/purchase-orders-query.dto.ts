import { IsOptional, IsString, IsUUID, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../../generated/prisma/client.js';

export class PurchaseOrdersQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    @ApiPropertyOptional({ enum: PurchaseOrderStatus })
    @IsOptional()
    @IsEnum(PurchaseOrderStatus)
    status?: PurchaseOrderStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    supplierId?: string;

    @ApiPropertyOptional({ description: 'Búsqueda por número de orden' })
    @IsOptional()
    @IsString()
    search?: string;
}