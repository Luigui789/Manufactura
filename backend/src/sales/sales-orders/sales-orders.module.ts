import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { DocumentSequenceModule } from '../../common/document-sequence/document-sequence.module.js';
import { StockModule } from '../../inventory/stock/stock.module.js';
import { SalesOrdersController } from './sales-orders.controller.js';
import { SalesOrdersService } from './sales-orders.service.js';

@Module({
  imports: [AuditModule, DocumentSequenceModule, StockModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
})
export class SalesOrdersModule {}
