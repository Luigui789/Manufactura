import { RoutesModule } from './routes/routes.module.js';
import { Module } from '@nestjs/common';
import { BomsModule } from './boms/boms.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { QualityModule } from './quality/quality.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
@Module({ imports: [RoutesModule, BomsModule, OrdersModule, QualityModule, DashboardModule] })
export class ProductionModule {}
