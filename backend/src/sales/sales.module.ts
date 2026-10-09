import { Module } from '@nestjs/common';
import { CustomersModule } from './customers/customers.module.js';

@Module({
  imports: [CustomersModule],
})
export class SalesModule {}
