import { Module } from '@nestjs/common';

import { DashboardModule } from './dashboard/dashboard.module.js';
import { ProductsModule } from './products/products.module.js';
import { LotsModule } from './lots/lots.module.js';
import { MovementsModule } from './movements/movements.module.js';
import { StockModule } from './stock/stock.module.js';
import { WarehousesModule } from './warehouses/warehouses.module.js';

@Module({
  imports: [
    DashboardModule,
    ProductsModule,
    WarehousesModule,
    MovementsModule,
    StockModule,
    LotsModule,
  ],
})
export class InventoryModule {}
