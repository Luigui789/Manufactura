import { ApiProperty, PartialType, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RawValue, TrimText } from '../../../common/catalog.dto.js';

export class CreateBomDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @TrimText() @IsString() @MinLength(1) @MaxLength(120) name: string;
}
export class UpdateBomDto extends PartialType(OmitType(CreateBomDto, ['productId'] as const), {
  skipNullProperties: false,
}) {}
export class BomItemDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty({ type: String, example: '500.0000' })
  @RawValue()
  @IsString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/)
  quantity: string;
}
export class CreateBomVersionDto {
  @ApiProperty({ type: String, example: '1.0000' })
  @RawValue()
  @IsString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/)
  outputQuantity: string;
  @ApiProperty({ type: [BomItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @ArrayUnique((item: BomItemDto | null) =>
    typeof item?.productId === 'string' ? item.productId.toLowerCase() : item?.productId,
  )
  @ValidateNested({ each: true })
  @Type(() => BomItemDto)
  items: BomItemDto[];
}
export class CalculateBomDto {
  @ApiProperty({ type: String, example: '100.0000' })
  @RawValue()
  @IsString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/)
  quantityPlanned: string;
}
