import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module.js';
import { AdjustmentController } from './adjustment.controller.js';
import { AdjustmentService } from './adjustment.service.js';
import { InventoryService } from './inventory.service.js';
import { MovementQueryService } from './movement-query.service.js';
import { MovementsQueryController } from './movements-query.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [AdjustmentController, MovementsQueryController],
  providers: [AdjustmentService, InventoryService, MovementQueryService],
  exports: [InventoryService, MovementQueryService],
})
export class MovementsModule {}
