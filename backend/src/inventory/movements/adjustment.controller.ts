import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthenticatedUser } from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { RoleCode } from '../../generated/prisma/client.js';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto.js';
import { AdjustmentService } from './adjustment.service.js';

@ApiTags('Inventory Adjustments')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Datos de ajuste inválidos' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'Rol sin permiso para ajustar' })
@ApiResponse({ status: 409, description: 'Conflicto de inventario' })
@ApiResponse({ status: 422, description: 'Referencia o combinación inválida' })
@Controller('inventory/adjustments')
export class AdjustmentController {
  constructor(private readonly adjustments: AdjustmentService) {}

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.INVENTARIO)
  @ApiOperation({ summary: 'Registra un ajuste de inventario' })
  @ApiCreatedResponse({ description: 'Ajuste registrado' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateAdjustmentDto) {
    return {
      data: await this.adjustments.create(actor, dto),
      message: 'Ajuste registrado',
    };
  }
}
