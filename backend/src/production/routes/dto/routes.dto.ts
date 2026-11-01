import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RawValue, TrimText, TrimUpperCase } from '../../../common/catalog.dto.js';

export class RouteOperationDto {
  @ApiProperty() @RawValue() @IsInt() @Min(1) @Max(2147483647) sequence: number;
  @ApiProperty() @TrimText() @IsString() @MinLength(1) @MaxLength(120) name: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    typeof obj[key] === 'string' ? obj[key].trim() || null : obj[key],
  )
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;
  @ApiProperty({
    type: String,
    example: '15.00',
    description: 'Minutos positivos, hasta 10 enteros y 2 decimales',
  })
  @RawValue()
  @IsString()
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,10}(?:\.\d{1,2})?$/)
  standardMinutes: string;
}
export class ReplaceRouteOperationsDto {
  @ApiProperty({ type: [RouteOperationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @ArrayUnique((item: RouteOperationDto | null) => item?.sequence)
  @ValidateNested({ each: true })
  @Type(() => RouteOperationDto)
  operations: RouteOperationDto[];
}
export class CreateProductionRouteDto extends ReplaceRouteOperationsDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @TrimUpperCase() @IsString() @MinLength(1) @MaxLength(32) code: string;
  @ApiProperty() @TrimText() @IsString() @MinLength(1) @MaxLength(120) name: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    typeof obj[key] === 'string' ? obj[key].trim() || null : obj[key],
  )
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
export class UpdateProductionRouteDto extends PartialType(
  PickType(CreateProductionRouteDto, ['code', 'name', 'description'] as const),
  { skipNullProperties: false },
) {}
