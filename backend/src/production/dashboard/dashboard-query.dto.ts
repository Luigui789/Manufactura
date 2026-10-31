import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateBy } from 'class-validator';
import { RawValue } from '../../common/catalog.dto.js';

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function IsCalendarDate(): PropertyDecorator {
  return ValidateBy({
    name: 'isCalendarDate',
    validator: {
      validate: isCalendarDate,
      defaultMessage: () => 'debe ser una fecha ISO válida (YYYY-MM-DD)',
    },
  });
}

export class DashboardQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-01' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-30' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra las métricas por producto.' })
  @RawValue()
  @IsOptional()
  @IsUUID(undefined, { message: 'productId debe ser un UUID válido' })
  productId?: string;
}
