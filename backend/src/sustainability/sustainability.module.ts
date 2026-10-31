import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { EmissionFactorsController } from './emission-factors/emission-factors.controller.js';
import { EmissionFactorsService } from './emission-factors/emission-factors.service.js';
import { FootprintsController } from './footprints/footprints.controller.js';
import { FootprintsService } from './footprints/footprints.service.js';

/**
 * C3 — Sostenibilidad. Lee Producción e Inventario (ledger) sin modificarlos:
 * completar una OP nunca depende de este módulo.
 */
@Module({
  imports: [AuditModule],
  controllers: [EmissionFactorsController, FootprintsController],
  providers: [EmissionFactorsService, FootprintsService],
})
export class SustainabilityModule {}
