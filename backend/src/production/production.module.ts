import { Module } from '@nestjs/common';
import { BomsModule } from './boms/boms.module.js';
@Module({ imports: [BomsModule] })
export class ProductionModule {}
