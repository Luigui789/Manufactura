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
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';

import {
  Authenticated,
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../auth/access-policy.js';

import { SESSION_COOKIE } from '../../auth/session-cookie.js';

import { RoleCode } from '../../generated/prisma/client.js';

import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';

import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';

import { PurchaseOrdersQueryDto } from './dto/purchase-orders-query.dto.js';

import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';

import {
  PurchaseOrderResultResponse,
  PurchaseOrdersListResponse,
  PurchaseReceiptsResultResponse,
} from './purchase-orders-response.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

import { PurchaseReceiptsService } from './purchase-receipts.service.js';

@ApiTags('Purchase Orders')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly orders: PurchaseOrdersService,
    private readonly receipts: PurchaseReceiptsService,
  ) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista órdenes de compra con filtros y paginación' })
  @ApiOkResponse({ type: PurchaseOrdersListResponse })
  list(@Query() query: PurchaseOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOkResponse({ type: PurchaseOrderResultResponse })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.orders.get(id), message: 'Orden encontrada' };
  }

  @Get(':id/receipts')
  @Authenticated()
  @ApiOkResponse({ type: PurchaseReceiptsResultResponse })
  async history(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.orders.receipts(id), message: 'Recepciones consultadas' };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiCreatedResponse({ type: PurchaseOrderResultResponse })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreatePurchaseOrderDto) {
    return { data: await this.orders.create(actor, dto), message: 'Borrador creado' };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOkResponse({ type: PurchaseOrderResultResponse })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return { data: await this.orders.update(actor, id, dto), message: 'Borrador actualizado' };
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOkResponse({ type: PurchaseOrderResultResponse })
  async confirm(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.orders.confirm(actor, id), message: 'Orden confirmada' };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiOkResponse({ type: PurchaseOrderResultResponse })
  async cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.orders.cancel(actor, id), message: 'Orden cancelada' };
  }

  @Post(':id/receive')
  @Roles(RoleCode.ADMIN, RoleCode.COMPRAS)
  @ApiCreatedResponse({ type: PurchaseOrderResultResponse })
  async receive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return { data: await this.receipts.receive(actor, id, dto), message: 'Recepción registrada' };
  }
}
