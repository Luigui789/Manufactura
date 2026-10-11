import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { DocumentSequenceModule } from '../../common/document-sequence/document-sequence.module.js';
import { StockModule } from '../../inventory/stock/stock.module.js';
import { BomsModule } from '../boms/boms.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuditModule, BomsModule, DocumentSequenceModule, StockModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
