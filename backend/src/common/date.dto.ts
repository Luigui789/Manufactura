import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';
import { RawValue } from './catalog.dto.js';

export function IsCalendarDate(): PropertyDecorator {
  return applyDecorators(RawValue(), Matches(/^\d{4}-\d{2}-\d{2}$/), IsISO8601({ strict: true }));
}
export function IsTimestamp(): PropertyDecorator {
  return applyDecorators(
    RawValue(),
    IsISO8601({ strict: true, strictSeparator: true }),
    Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/),
  );
}
