import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [AuditModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
