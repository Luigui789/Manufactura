import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { RawValue, TrimText } from '../../../common/catalog.dto.js';
import { IsTimestamp } from '../../../common/date.dto.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { IiotAlertSeverity, IiotMetric } from '../../../generated/prisma/client.js';

export class MonitoringQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Desde (inclusivo), con timezone.' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsTimestamp()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Hasta (inclusivo), con timezone.' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsTimestamp()
  to?: string;
}

export class ReadingsQueryDto extends MonitoringQueryDto {
  @ApiPropertyOptional({ enum: IiotMetric })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(IiotMetric)
  metric?: IiotMetric;

  @ApiPropertyOptional({ format: 'uuid' })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  deviceId?: string;
}

export class AlertsQueryDto extends MonitoringQueryDto {
  @ApiPropertyOptional({ enum: IiotAlertSeverity })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(IiotAlertSeverity)
  severity?: IiotAlertSeverity;

  @ApiPropertyOptional({ maxLength: 80, description: 'Tipo exacto, sin espacios en extremos.' })
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 80)
  type?: string;
}
