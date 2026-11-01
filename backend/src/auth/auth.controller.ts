import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';

import { UserResponseDto } from '../users/user-response.js';
import {
  AllowPendingPasswordChange,
  Authenticated,
  type AuthenticatedUser,
  CurrentUser,
  Public,
} from './access-policy.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto.js';
import {
  clearSessionCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './session-cookie.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inicia sesión',
    description:
      'Deja la sesión en la cookie HttpOnly ecosoap_session; el token nunca viaja en el cuerpo. ' +
      'Desde Swagger, ejecutar este login deja la cookie en el navegador para las demás rutas.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas (respuesta única)' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos desde esta IP' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(this.isProduction));
    return { data: session.user, message: 'Sesión iniciada' };
  }

  @Get('me')
  @Authenticated()
  @AllowPendingPasswordChange()
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: 'Usuario de la sesión actual, con su rol y mustChangePassword' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Sin sesión válida' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.auth.me(user), message: 'Sesión activa' };
  }

  @Post('logout')
  @Authenticated()
  @AllowPendingPasswordChange()
  @HttpCode(200)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary: 'Cierra todas las sesiones del usuario',
    description: 'Logout global: incrementa la versión de sesión e invalida todos sus tokens.',
  })
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user);
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(this.isProduction));
    return { data: null, message: 'Sesión cerrada' };
  }

  @Post('change-password')
  @Authenticated()
  @AllowPendingPasswordChange()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary: 'Cambia la contraseña propia',
    description:
      'Exige la contraseña actual. Invalida las demás sesiones y renueva la cookie de la actual.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiResponse({
    status: 422,
    description: 'Contraseña actual incorrecta o nueva igual a la actual',
  })
  @ApiResponse({ status: 429, description: 'Demasiados intentos desde esta IP' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.changePassword(user, dto);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(this.isProduction));
    return { data: session.user, message: 'Contraseña actualizada' };
  }
}
