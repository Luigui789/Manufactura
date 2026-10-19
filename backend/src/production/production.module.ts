import { Module } from '@nestjs/common';
import { BomsModule } from './boms/boms.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { QualityModule } from './quality/quality.module.js';
@Module({ imports: [BomsModule, OrdersModule, QualityModule] })
export class ProductionModule {}
