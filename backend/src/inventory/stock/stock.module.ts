import { Module } from '@nestjs/common';

import { StockController } from './stock.controller.js';
import { StockQueryService } from './stock-query.service.js';

@Module({
  controllers: [StockController],
  providers: [StockQueryService],
  exports: [StockQueryService],
})
export class StockModule {}
