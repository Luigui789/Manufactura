import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
  });

  // El frontend ayuda al usuario, pero la regla la garantiza el backend:
  // whitelist descarta lo no declarado en el DTO y forbidNonWhitelisted lo
  // rechaza explicitamente en lugar de ignorarlo en silencio.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('EcoSoap ERP API')
    .setDescription(
      'API REST del ERP de EcoSoap Nicaragua S.A. Los modulos de Compras, ' +
        'Inventario, Produccion y Ventas se documentaran aqui a medida que se implementen.',
    )
    .setVersion('0.1.0')
    .addTag('Health', 'Verificacion de conectividad del servicio y la base de datos')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApiConfig));

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);

  logger.log(`API escuchando en http://localhost:${port}/api`);
  logger.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

await bootstrap();
