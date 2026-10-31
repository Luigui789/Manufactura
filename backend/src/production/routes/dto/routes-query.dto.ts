import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';
import { BomsQueryDto } from '../../boms/dto/boms-query.dto.js';
export class RoutesQueryDto extends BomsQueryDto {
  @ApiPropertyOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsUUID()
  productId?: string;
}
