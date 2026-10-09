import { Module } from '@nestjs/common';
import { SuppliersModule } from './suppliers/suppliers.module.js';

@Module({
  imports: [SuppliersModule],
})
export class PurchasesModule {}
