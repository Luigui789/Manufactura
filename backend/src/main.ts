import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { SESSION_COOKIE } from './auth/session-cookie.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  // Solo el origen del frontend, con credenciales para la cookie de sesion;
  // nunca '*'. X-Request-Id se expone para mostrarlo en los errores 5xx.
  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  // El ValidationPipe global se registra como APP_PIPE en AppModule: una sola
  // configuracion efectiva, la misma en produccion y en las pruebas e2e.

  const openApiConfig = new DocumentBuilder()
    .setTitle('EcoSoap ERP API')
    .setDescription(
      'API REST del ERP de EcoSoap Nicaragua S.A. La sesion viaja en la cookie HttpOnly ' +
        `${SESSION_COOKIE}: ejecuta POST /api/auth/login desde esta pagina y el navegador ` +
        'enviara la cookie en las demas peticiones.',
    )
    .setVersion('0.1.0')
    .addTag('Health', 'Verificacion de conectividad del servicio y la base de datos')
    .addTag('Auth', 'Inicio y cierre de sesion, usuario actual y cambio de contrasena')
    .addTag('Users', 'Administracion de usuarios; solo ADMIN')
    .addCookieAuth(
      SESSION_COOKIE,
      { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
      SESSION_COOKIE,
    )
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApiConfig));

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);

  logger.log(`API escuchando en http://localhost:${port}/api`);
  logger.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

await bootstrap();
