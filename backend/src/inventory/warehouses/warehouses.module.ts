import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module.js';
import { WarehousesController } from './warehouses.controller.js';
import { WarehousesService } from './warehouses.service.js';

@Module({
  imports: [AuditModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
})
export class WarehousesModule {}
