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
import { RoleCode } from '../../generated/prisma/client.js';
import { SetCatalogStatusDto } from '../../common/catalog.dto.js';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto.js';
import { ProductsQueryDto } from './dto/products-query.dto.js';
import { ProductResultDto, ProductsListDto } from './products-response.js';
import { ProductsService } from './products.service.js';

@ApiTags('Products')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({
  status: 400,
  description: 'Datos, filtros, paginación o UUID inválidos',
})
@ApiResponse({
  status: 401,
  description: 'Sin sesión válida',
})
@ApiResponse({
  status: 403,
  description: 'Acceso denegado o cambio de contraseña pendiente',
})
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({
    summary: 'Lista paginada de productos',
    description:
      'Permite filtrar por estado y tipo, y buscar por código o nombre. El total corresponde a los filtros aplicados.',
  })
  @ApiOkResponse({ type: ProductsListDto })
  list(@Query() query: ProductsQueryDto) {
    return this.products.list(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta el detalle de un producto' })
  @ApiOkResponse({ type: ProductResultDto })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      data: await this.products.get(id),
      message: 'Producto encontrado',
    };
  }

  @Post()
  @Roles(RoleCode.ADMIN, RoleCode.INVENTARIO)
  @ApiOperation({ summary: 'Crea un producto' })
  @ApiCreatedResponse({ type: ProductResultDto })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un producto con ese código',
  })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return {
      data: await this.products.create(actor, dto),
      message: 'Producto creado',
    };
  }

  @Patch(':id')
  @Roles(RoleCode.ADMIN, RoleCode.INVENTARIO)
  @ApiOperation({ summary: 'Actualiza un producto' })
  @ApiOkResponse({ type: ProductResultDto })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({
    status: 409,
    description:
      'Código duplicado o cambio de unidad o tipo bloqueado por movimientos de inventario',
  })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return {
      data: await this.products.update(actor, id, dto),
      message: 'Producto actualizado',
    };
  }

  @Patch(':id/status')
  @Roles(RoleCode.ADMIN, RoleCode.INVENTARIO)
  @ApiOperation({ summary: 'Activa o desactiva un producto' })
  @ApiOkResponse({ type: ProductResultDto })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({
    status: 409,
    description:
      'El producto ya tiene ese estado o se intenta desactivarlo con existencias distintas de cero',
  })
  async setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCatalogStatusDto,
  ) {
    return {
      data: await this.products.setStatus(actor, id, dto.isActive),
      message: dto.isActive ? 'Producto activado' : 'Producto desactivado',
    };
  }
}
