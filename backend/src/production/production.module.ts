import { Module } from '@nestjs/common';
import { BomsModule } from './boms/boms.module.js';
import { OrdersModule } from './orders/orders.module.js';
@Module({ imports: [BomsModule, OrdersModule] })
export class ProductionModule {}
