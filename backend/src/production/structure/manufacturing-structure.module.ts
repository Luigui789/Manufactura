import { Module } from '@nestjs/common';
import { ManufacturingStructureController } from './manufacturing-structure.controller.js';
import { ManufacturingStructureService } from './manufacturing-structure.service.js';
@Module({
  controllers: [ManufacturingStructureController],
  providers: [ManufacturingStructureService],
})
export class ManufacturingStructureModule {}
