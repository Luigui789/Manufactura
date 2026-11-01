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
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  Authenticated,
  CurrentUser,
  Roles,
  type AuthenticatedUser,
} from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { RoleCode } from '../../generated/prisma/client.js';
import { CreateSaleOrderDto, UpdateSaleOrderDto } from './dto/sale-orders.dto.js';
import { SaleOrdersQueryDto } from './dto/sale-orders-query.dto.js';
import { SaleOrderResponseDto, SaleOrdersListResponseDto } from './sale-orders-response.js';
import { SalesOrdersService } from './sales-orders.service.js';
import { SalesDispatchService } from '../sales-dispatch/sales-dispatch.service.js';
import { CreateSaleDispatchDto } from '../sales-dispatch/dto/create-sale-dispatch.dto.js';

@ApiTags('Sales Orders')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'Acceso denegado' })
@Controller('sales/orders')
export class SalesOrdersController {
  constructor(
    private readonly orders: SalesOrdersService,
    private readonly dispatches: SalesDispatchService,
  ) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista órdenes de venta con filtros y paginación' })
  @ApiOkResponse({ type: SaleOrdersListResponseDto })
  list(@Query() query: SaleOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOkResponse({ type: SaleOrderResponseDto })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.orders.get(id), message: 'Orden de venta encontrada' };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiCreatedResponse({ type: SaleOrderResponseDto })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateSaleOrderDto) {
    return { data: await this.orders.create(actor, dto), message: 'Borrador de venta creado' };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiOkResponse({ type: SaleOrderResponseDto })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSaleOrderDto,
  ) {
    return {
      data: await this.orders.update(actor, id, dto),
      message: 'Borrador de venta actualizado',
    };
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiOkResponse({ type: SaleOrderResponseDto })
  async confirm(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.orders.confirm(actor, id), message: 'Orden de venta confirmada' };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiOkResponse({ type: SaleOrderResponseDto })
  async cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.orders.cancel(actor, id), message: 'Orden de venta cancelada' };
  }

  @Post(':id/dispatch')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiOperation({ summary: 'Despacha cantidades de una orden de venta y registra la salida' })
  @ApiOkResponse({ description: 'Despacho registrado' })
  @ApiResponse({
    status: 409,
    description: 'Estado inválido, cantidad excedida o stock insuficiente',
  })
  async dispatch(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateSaleDispatchDto,
  ) {
    return { data: await this.dispatches.create(actor, id, dto), message: 'Despacho registrado' };
  }
}
