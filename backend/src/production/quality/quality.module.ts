import { DispositionService } from './disposition.service.js';
import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { MovementsModule } from '../../inventory/movements/movements.module.js';
import { QualityController } from './quality.controller.js';
import { QualityService } from './quality.service.js';
import { TraceabilityService } from './traceability.service.js';

@Module({
  imports: [AuditModule, MovementsModule],
  controllers: [QualityController],
  providers: [QualityService, TraceabilityService, DispositionService],
})
export class QualityModule {}
