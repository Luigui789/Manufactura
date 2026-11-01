import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';

/**
 * Prueba de extremo a extremo de la unica funcionalidad que entrega la etapa de
 * configuracion inicial: que la cadena NestJS -> Prisma -> PostgreSQL responde.
 *
 * REQUIERE PostgreSQL en ejecucion (`pnpm db:up`). Es deliberado: la prueba
 * verifica una conexion real, no un doble de prueba, porque lo que esta en duda
 * es precisamente la infraestructura.
 */
describe('HealthController (e2e)', () => {
  // El parametro de tipo hace que getHttpServer() devuelva Server en lugar de
  // any, que es uno de los tipos que supertest acepta. No se importa el tipo
  // App de 'supertest/types' porque @types/supertest no declara exports y esa
  // ruta no resuelve bajo moduleResolution nodenext.
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde 200 con la base de datos conectada', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(respuesta.body).toMatchObject({
      data: { status: 'ok', database: 'up' },
      message: 'Servicio operativo',
    });
    expect(typeof (respuesta.body as { data: { timestamp: unknown } }).data.timestamp).toBe(
      'string',
    );
  });
});
