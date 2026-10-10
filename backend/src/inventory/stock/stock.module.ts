import { Module } from '@nestjs/common';

import { StockQueryService } from './stock-query.service.js';

@Module({
  providers: [StockQueryService],
  exports: [StockQueryService],
})
export class StockModule {}
