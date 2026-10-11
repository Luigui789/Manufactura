import { Module } from '@nestjs/common';

import { ProductsModule } from './products/products.module.js';
import { MovementsModule } from './movements/movements.module.js';
import { StockModule } from './stock/stock.module.js';
import { WarehousesModule } from './warehouses/warehouses.module.js';

@Module({
  imports: [ProductsModule, WarehousesModule, MovementsModule, StockModule],
})
export class InventoryModule {}
