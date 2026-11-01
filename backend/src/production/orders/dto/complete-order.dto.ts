import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsPositiveDecimalString } from '../../../common/decimal.dto.js';
import { IsCalendarDate } from '../../../common/date.dto.js';

export class LotAllocationDto {
  @ApiProperty() @IsUUID() lotId: string;
  @ApiProperty({ type: String }) @IsPositiveDecimalString() quantity: string;
}
export class ComponentAllocationDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty({ type: [LotAllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => LotAllocationDto)
  lots: LotAllocationDto[];
}
export class CompleteOrderDto {
  @ApiProperty({ type: String }) @IsPositiveDecimalString() quantityProduced: string;
  @ApiProperty({ type: [ComponentAllocationDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ComponentAllocationDto)
  allocations: ComponentAllocationDto[];
  @ApiPropertyOptional({ type: String, format: 'date' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsCalendarDate()
  expiresAt?: string;
}
