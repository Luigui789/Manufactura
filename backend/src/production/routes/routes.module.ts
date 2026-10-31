import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';
@Module({ imports: [AuditModule], controllers: [RoutesController], providers: [RoutesService] })
export class RoutesModule {}
