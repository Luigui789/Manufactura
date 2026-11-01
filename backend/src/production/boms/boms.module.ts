import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { BomCalculatorService } from './bom-calculator.service.js';
import { BomsController } from './boms.controller.js';
import { BomsService } from './boms.service.js';
import { BomGraphService } from './bom-graph.service.js';
@Module({
  imports: [AuditModule],
  controllers: [BomsController],
  providers: [BomsService, BomCalculatorService, BomGraphService],
  exports: [BomCalculatorService],
})
export class BomsModule {}
