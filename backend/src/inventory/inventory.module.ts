import { Module } from '@nestjs/common';

import { ProductsModule } from './products/products.module.js';
import { WarehousesModule } from './warehouses/warehouses.module.js';

@Module({
  imports: [ProductsModule, WarehousesModule],
})
export class InventoryModule {}
