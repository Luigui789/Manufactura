import {
  Body,
  Controller,
  Delete,
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
  CreateManualActivityDto,
  FinalizeFootprintDto,
  SustainabilityOrdersQueryDto,
  UpdateManualActivityDto,
} from './footprints.dto.js';
import { FootprintsService } from './footprints.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('Sustainability · Production footprints')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('sustainability/production-orders')
export class FootprintsController {
  constructor(private readonly footprints: FootprintsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Lista órdenes completadas con el estado de su huella parcial' })
  list(@Query() query: SustainabilityOrdersQueryDto) {
    return this.footprints.listOrders(query);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Resumen de sostenibilidad y circularidad de una orden' })
  async summary(@Param('id', uuid()) id: string) {
    return { data: await this.footprints.orderSummary(id), message: 'Resumen consultado' };
  }

  @Get(':id/footprint')
  @Authenticated()
  @ApiOperation({ summary: 'Consulta la huella de la orden o null; nunca la crea' })
  async get(@Param('id', uuid()) id: string) {
    return { data: await this.footprints.get(id), message: 'Huella consultada' };
  }

  @Post(':id/footprint')
  @HttpCode(201)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Crea la huella DRAFT de una OP COMPLETED desde su ledger' })
  async create(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid()) id: string) {
    return { data: await this.footprints.create(actor, id), message: 'Huella creada' };
  }

  @Post(':id/footprint/sync')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Resincroniza actividades automáticas con los consumos reales' })
  async sync(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid()) id: string) {
    return { data: await this.footprints.sync(actor, id), message: 'Huella sincronizada' };
  }

  @Post(':id/footprint/activities')
  @HttpCode(201)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Agrega una actividad manual; la unidad la define el factor' })
  async addActivity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid()) id: string,
    @Body() dto: CreateManualActivityDto,
  ) {
    return {
      data: await this.footprints.addManual(actor, id, dto),
      message: 'Actividad registrada',
    };
  }

  @Patch(':id/footprint/activities/:activityId')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Edita una actividad MANUAL de una huella DRAFT' })
  async updateActivity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid()) id: string,
    @Param('activityId', uuid()) activityId: string,
    @Body() dto: UpdateManualActivityDto,
  ) {
    return {
      data: await this.footprints.updateManual(actor, id, activityId, dto),
      message: 'Actividad actualizada',
    };
  }

  @Delete(':id/footprint/activities/:activityId')
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Elimina una actividad MANUAL de una huella DRAFT' })
  async removeActivity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid()) id: string,
    @Param('activityId', uuid()) activityId: string,
  ) {
    return {
      data: await this.footprints.removeManual(actor, id, activityId),
      message: 'Actividad eliminada',
    };
  }

  @Post(':id/footprint/finalize')
  @HttpCode(200)
  @Roles(RoleCode.ADMIN, RoleCode.PRODUCCION)
  @ApiOperation({ summary: 'Resincroniza, valida factores y congela la huella' })
  async finalize(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid()) id: string,
    @Body() dto: FinalizeFootprintDto,
  ) {
    return {
      data: await this.footprints.finalize(actor, id, dto),
      message: 'Huella finalizada',
    };
  }
}
