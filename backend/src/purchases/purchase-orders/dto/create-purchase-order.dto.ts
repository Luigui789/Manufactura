import { IsString, IsUUID, IsArray, ValidateNested, IsOptional, Matches, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseOrderItemDto {
    @ApiProperty({ description: 'ID del producto' })
    @IsUUID()
    productId: string;

    @ApiProperty({ description: 'Cantidad solicitada en formato texto', example: '100.5000' })
    @IsString({ message: 'La cantidad debe enviarse como texto' })
    @Matches(/^(?!0(\.0+)?$)\d+(\.\d{1,4})?$/, { message: 'La cantidad debe ser mayor que 0 y tener hasta 4 decimales' })
    quantity: string;

    @ApiProperty({ description: 'Precio unitario en formato texto', example: '22.7500' })
    @IsString({ message: 'El precio debe enviarse como texto' })
    @Matches(/^\d+(\.\d{1,4})?$/, { message: 'El precio no puede ser negativo y debe tener hasta 4 decimales' })
    unitPrice: string;
}

export class CreatePurchaseOrderDto {
    @ApiProperty({ description: 'ID del proveedor' })
    @IsUUID()
    supplierId: string;

    @ApiPropertyOptional({ description: 'Fecha esperada de entrega (YYYY-MM-DD)' })
    @IsOptional()
    @IsDateString()
    expectedDate?: string;

    @ApiProperty({ type: [PurchaseOrderItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PurchaseOrderItemDto)
    items: PurchaseOrderItemDto[];
}