import { IsString, IsUUID, IsArray, ValidateNested, IsOptional, Matches, IsDateString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceivePurchaseOrderItemDto {
    @ApiProperty({ description: 'ID de la línea de la orden original' })
    @IsUUID()
    purchaseOrderItemId: string;

    @ApiProperty({ description: 'ID del almacén destino' })
    @IsUUID()
    warehouseId: string;

    @ApiProperty({ description: 'Cantidad recibida en formato texto', example: '50.0000' })
    @IsString()
    @Matches(/^(?!0(\.0+)?$)\d+(\.\d{1,4})?$/, { message: 'La cantidad debe ser mayor a 0 y tener hasta 4 decimales' })
    quantity: string;

    @ApiPropertyOptional({ description: 'Fecha de vencimiento (solo aplica para productos trazables)' })
    @IsOptional()
    @IsDateString()
    expiresAt?: string;
}

export class ReceivePurchaseOrderDto {
    @ApiPropertyOptional({ description: 'Fecha de la recepción (por defecto now())' })
    @IsOptional()
    @IsDateString()
    receivedAt?: string;

    @ApiPropertyOptional({ description: 'Notas u observaciones de la recepción' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;

    @ApiProperty({ type: [ReceivePurchaseOrderItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReceivePurchaseOrderItemDto)
    items: ReceivePurchaseOrderItemDto[];
}