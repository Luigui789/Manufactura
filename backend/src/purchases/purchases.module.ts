import { Module } from '@nestjs/common';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';

@Module({
  imports: [SuppliersModule, PurchaseOrdersModule],
})
export class PurchasesModule {}
