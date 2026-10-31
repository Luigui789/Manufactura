import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { RawValue, TrimText, TrimUpperCase } from '../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../common/pagination/pagination.js';
import { CarbonActivityCategory, CarbonActivityUnit } from '../../generated/prisma/client.js';
import { FACTOR_VALUE_PATTERN } from '../carbon-math.js';

const NullableTrim = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    typeof obj[key] === 'string' ? obj[key].trim() || null : obj[key],
  );

export class CreateEmissionFactorDto {
  @ApiProperty({ example: 'TEST-ELECTRICITY', maxLength: 50 })
  @TrimUpperCase()
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Z0-9][A-Z0-9_.-]*$/, {
    message: 'code solo admite letras, números, punto, guion y guion bajo',
  })
  code: string;

  @ApiProperty({ maxLength: 150 })
  @TrimText()
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiProperty({ enum: CarbonActivityCategory })
  @RawValue()
  @IsEnum(CarbonActivityCategory)
  category: CarbonActivityCategory;

  @ApiProperty({ enum: CarbonActivityUnit })
  @RawValue()
  @IsEnum(CarbonActivityUnit)
  activityUnit: CarbonActivityUnit;

  @ApiProperty({
    type: String,
    example: '0.50000000',
    description: 'kg CO₂e por unidad de actividad; texto decimal ≥ 0, 12 enteros y 8 decimales',
  })
  @RawValue()
  @IsString()
  @Matches(FACTOR_VALUE_PATTERN, {
    message: 'kgCo2ePerUnit debe ser texto decimal no negativo con hasta 12 enteros y 8 decimales',
  })
  kgCo2ePerUnit: string;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  @RawValue()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsUUID()
  productId?: string | null;

  @ApiProperty({ maxLength: 200, example: 'TEST_FIXTURE' })
  @TrimText()
  @IsString()
  @Length(1, 200)
  sourceName: string;

  @ApiProperty({ maxLength: 1000, description: 'Documento, edición, tabla o URL reproducible' })
  @TrimText()
  @IsString()
  @Length(1, 1000)
  sourceReference: string;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 1900, maximum: 2100 })
  @RawValue()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsInt()
  @Min(1900)
  @Max(2100)
  sourceYear?: number | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 1000 })
  @NullableTrim()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

/** code, productId, category y activityUnit definen la identidad: no se editan. */
export class UpdateEmissionFactorDto extends PartialType(
  PickType(CreateEmissionFactorDto, [
    'name',
    'kgCo2ePerUnit',
    'sourceName',
    'sourceReference',
    'sourceYear',
    'notes',
  ] as const),
  { skipNullProperties: false },
) {}

export class EmissionFactorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @TrimText()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ enum: CarbonActivityCategory })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsEnum(CarbonActivityCategory)
  category?: CarbonActivityCategory;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key],
  )
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsUUID()
  productId?: string;
}
