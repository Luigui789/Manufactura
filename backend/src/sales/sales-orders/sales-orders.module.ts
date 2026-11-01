import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { DocumentSequenceModule } from '../../common/document-sequence/document-sequence.module.js';
import { StockModule } from '../../inventory/stock/stock.module.js';
import { MovementsModule } from '../../inventory/movements/movements.module.js';
import { SalesOrdersController } from './sales-orders.controller.js';
import { SalesOrdersService } from './sales-orders.service.js';
import { SalesDispatchService } from '../sales-dispatch/sales-dispatch.service.js';

@Module({
  imports: [AuditModule, DocumentSequenceModule, StockModule, MovementsModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, SalesDispatchService],
})
export class SalesOrdersModule {}
