import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, Length, ValidateIf } from 'class-validator';
import { TrimText } from '../../common/catalog.dto.js';
import { QualityResult } from '../../generated/prisma/client.js';

export class InspectionDto {
  @ApiProperty({ enum: QualityResult }) @IsEnum(QualityResult) result: QualityResult;
  @ApiProperty() @TrimText() @IsString() @Length(1, 1000) observations: string;
  @ApiPropertyOptional()
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 1000)
  nonConformities?: string;
}
