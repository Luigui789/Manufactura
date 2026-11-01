import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, IsUUID, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { TrimText } from '../../../common/catalog.dto.js';

export class RoutesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key],
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;
}
