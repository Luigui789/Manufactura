import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
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
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../auth/access-policy.js';
import { SESSION_COOKIE } from '../../auth/session-cookie.js';
import { SetCatalogStatusDto } from '../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../common/pagination/pagination.js';
import { RoleCode } from '../../generated/prisma/client.js';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customers.dto.js';
import { CustomerResultDto, CustomersListDto } from './customers-response.js';
import { CustomersService } from './customers.service.js';

@ApiTags('Customers')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 400, description: 'Datos, paginación o UUID inválidos' })
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'Acceso denegado' })
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista paginada de clientes' })
  @ApiOkResponse({ type: CustomersListDto })
  list(@Query() query: PaginationQueryDto) {
    return this.customers.list(query.page, query.limit);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta el detalle de un cliente' })
  @ApiOkResponse({ type: CustomerResultDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      data: await this.customers.get(id),
      message: 'Cliente encontrado',
    };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiOperation({ summary: 'Crea un cliente' })
  @ApiCreatedResponse({ type: CustomerResultDto })
  @ApiResponse({ status: 409, description: 'Ya existe un cliente con ese código' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCustomerDto) {
    return {
      data: await this.customers.create(actor, dto),
      message: 'Cliente creado',
    };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiOperation({ summary: 'Actualiza un cliente' })
  @ApiOkResponse({ type: CustomerResultDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiResponse({ status: 409, description: 'Ya existe un cliente con ese código' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return {
      data: await this.customers.update(actor, id, dto),
      message: 'Cliente actualizado',
    };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN, RoleCode.VENTAS)
  @ApiOperation({ summary: 'Activa o desactiva un cliente' })
  @ApiOkResponse({ type: CustomerResultDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiResponse({ status: 409, description: 'El cliente ya tiene ese estado' })
  async setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.customers.setStatus(actor, id, dto.isActive),
      message: dto.isActive ? 'Cliente activado' : 'Cliente desactivado',
    };
  }
}
