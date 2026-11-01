import { Module } from '@nestjs/common';
import { MovementsModule } from '../movements/movements.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [MovementsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
