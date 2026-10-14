import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';

import { IsPositiveDecimalString } from '../../../common/decimal.dto.js';
import { AdjustmentReason, InventoryMovementType } from '../../../generated/prisma/client.js';

export class CreateAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'productId debe ser un UUID válido' })
  productId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'warehouseId debe ser un UUID válido' })
  warehouseId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID(undefined, { message: 'lotId debe ser un UUID válido' })
  lotId?: string | null;

  @ApiProperty({
    enum: [InventoryMovementType.ADJUSTMENT_IN, InventoryMovementType.ADJUSTMENT_OUT],
  })
  @IsIn([InventoryMovementType.ADJUSTMENT_IN, InventoryMovementType.ADJUSTMENT_OUT], {
    message: 'type debe ser ADJUSTMENT_IN o ADJUSTMENT_OUT',
  })
  type: InventoryMovementType;

  @ApiProperty({ type: String, example: '100.0000' })
  @IsPositiveDecimalString({
    message: 'quantity debe ser una cadena decimal positiva con hasta 4 decimales',
  })
  quantity: string;

  @ApiProperty({ enum: AdjustmentReason })
  @IsEnum(AdjustmentReason, { message: 'reason debe ser un motivo de ajuste válido' })
  reason: AdjustmentReason;
}
