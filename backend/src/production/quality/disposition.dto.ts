import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { RawValue, TrimText } from '../../common/catalog.dto.js';
import { QualityDispositionType } from '../../generated/prisma/client.js';
export class DispositionDto {
  @ApiProperty({ enum: QualityDispositionType })
  @RawValue()
  @IsEnum(QualityDispositionType)
  type: QualityDispositionType;
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @TrimText()
  @IsString()
  @Length(1, 1000)
  reason: string;
}
