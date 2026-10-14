import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { DocumentSequenceModule } from '../../common/document-sequence/document-sequence.module.js';
import { MovementsModule } from '../../inventory/movements/movements.module.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';
import { PurchaseReceiptsService } from './purchase-receipts.service.js';
@Module({
  imports: [AuditModule, DocumentSequenceModule, MovementsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseReceiptsService],
})
export class PurchaseOrdersModule {}
