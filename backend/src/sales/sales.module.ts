import { Module } from '@nestjs/common';
import { CustomersModule } from './customers/customers.module.js';
import { SalesOrdersModule } from './sales-orders/sales-orders.module.js';

@Module({
  imports: [CustomersModule, SalesOrdersModule],
})
export class SalesModule {}
