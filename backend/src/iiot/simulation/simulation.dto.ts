import { IsIn } from 'class-validator';

export class StartSimulationDto {
  @IsIn(['bar', 'liquid'])
  process: 'bar' | 'liquid';

  @IsIn(['normal', 'deviation'])
  scenario: 'normal' | 'deviation';
}
