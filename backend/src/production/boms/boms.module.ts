import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { BomCalculatorService } from './bom-calculator.service.js';
import { BomsController } from './boms.controller.js';
import { BomsService } from './boms.service.js';
@Module({
  imports: [AuditModule],
  controllers: [BomsController],
  providers: [BomsService, BomCalculatorService],
})
export class BomsModule {}
