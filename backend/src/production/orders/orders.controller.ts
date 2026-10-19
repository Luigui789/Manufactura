import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Authenticated,
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { RoleCode } from '../../generated/prisma/client.js';
import {
  CreateProductionOrderDto,
  OrdersQueryDto,
  UpdateProductionOrderDto,
} from './dto/orders.dto.js';
import { OrdersService } from './orders.service.js';
import { CompleteOrderDto } from './dto/complete-order.dto.js';

@ApiTags('Production Orders')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('production/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista órdenes de producción' })
  list(@Query() query: OrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  @Authenticated()
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.orders.get(id), message: 'Orden encontrada' };
  }

  @Get(':id/requirements')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta requerimientos y stock consumible, sin reservarlo' })
  async requirements(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.orders.requirements(id), message: 'Disponibilidad consultada' };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateProductionOrderDto) {
    return { data: await this.orders.create(actor, dto), message: 'Borrador creado' };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductionOrderDto,
  ) {
    return { data: await this.orders.update(actor, id, dto), message: 'Borrador actualizado' };
  }

  @Post(':id/start')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({
    summary: 'Inicia la orden después de validar disponibilidad, sin reservar stock',
  })
  async start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.orders.start(actor, id), message: 'Orden iniciada' };
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Completa atómicamente consumos, output y lote de la orden' })
  async complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteOrderDto,
  ) {
    return { data: await this.orders.complete(actor, id, dto), message: 'Orden completada' };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  async cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.orders.cancel(actor, id), message: 'Borrador cancelado' };
  }
}
