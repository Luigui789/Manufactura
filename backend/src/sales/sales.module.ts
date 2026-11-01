import { Module } from '@nestjs/common';
import { CustomersModule } from './customers/customers.module.js';
import { SalesOrdersModule } from './sales-orders/sales-orders.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';

@Module({
  imports: [CustomersModule, SalesOrdersModule, DashboardModule],
})
export class SalesModule {}
