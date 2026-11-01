import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

/**
 * Global porque practicamente todos los modulos de dominio (Compras,
 * Inventario, Produccion, Ventas) necesitaran acceso a la base de datos, y
 * repetir el import en cada uno no aporta aislamiento real.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
