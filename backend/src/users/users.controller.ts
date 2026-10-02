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

import { type AuthenticatedUser, CurrentUser, Roles } from '../auth/access-policy.js';
import { SESSION_COOKIE } from '../auth/session-cookie.js';
import { PaginationQueryDto } from '../common/pagination/pagination.js';
import { RoleCode } from '../generated/prisma/client.js';
import { ChangeRoleDto, CreateUserDto, ResetPasswordDto } from './dto/users.dto.js';
import { UserResponseDto } from './user-response.js';
import { UsersService } from './users.service.js';

const uuid = new ParseUUIDPipe();

@ApiTags('Users')
@ApiCookieAuth(SESSION_COOKIE)
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({
  status: 403,
  description: 'Rol distinto de ADMIN, acción sobre la propia cuenta o PASSWORD_CHANGE_REQUIRED',
})
@Roles(RoleCode.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de usuarios' })
  async list(@Query() query: PaginationQueryDto) {
    return this.users.list(query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un usuario' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async get(@Param('id', uuid) id: string) {
    return { data: await this.users.get(id), message: 'Usuario encontrado' };
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un usuario con contraseña temporal',
    description: 'El usuario queda con mustChangePassword = true hasta que cambie su contraseña.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiResponse({ status: 409, description: 'Ya existe un usuario con ese correo' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return { data: await this.users.create(actor, dto), message: 'Usuario creado' };
  }

  @Post(':id/enable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activa un usuario' })
  @ApiResponse({ status: 409, description: 'El usuario ya está activo' })
  async enable(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid) id: string) {
    return { data: await this.users.enable(actor, id), message: 'Usuario activado' };
  }

  @Post(':id/disable')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Desactiva un usuario',
    description: 'Invalida sus sesiones. No se permite sobre la propia cuenta ni dejar 0 ADMIN.',
  })
  @ApiResponse({ status: 409, description: 'Ya inactivo o último administrador activo' })
  async disable(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid) id: string) {
    return { data: await this.users.disable(actor, id), message: 'Usuario desactivado' };
  }

  @Patch(':id/role')
  @ApiOperation({
    summary: 'Cambia el rol de un usuario',
    description: 'Invalida sus sesiones. No se permite sobre la propia cuenta ni dejar 0 ADMIN.',
  })
  @ApiResponse({ status: 409, description: 'Mismo rol o último administrador activo' })
  async changeRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return { data: await this.users.changeRole(actor, id, dto), message: 'Rol actualizado' };
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Restablece la contraseña con una temporal',
    description:
      'Obliga a cambiarla en el siguiente acceso e invalida sus sesiones. No se permite sobre ' +
      'la propia cuenta: para eso existe POST /auth/change-password.',
  })
  async resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return {
      data: await this.users.resetPassword(actor, id, dto),
      message: 'Contraseña restablecida',
    };
  }
}
