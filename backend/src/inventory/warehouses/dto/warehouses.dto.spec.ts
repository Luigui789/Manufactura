import 'reflect-metadata';

import { BadRequestException, type Type, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { SetCatalogStatusDto } from '../../../common/catalog.dto.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './warehouses.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
});

function validate<T extends object>(metatype: Type<T>, input: unknown): Promise<T> {
  return pipe.transform(input, {
    type: 'body',
    metatype,
  }) as Promise<T>;
}

const validWarehouse = {
  code: 'ALM-PRUEBA',
  name: 'Almacén de prueba',
  location: 'Zona norte',
};

describe('Validación de creación de almacenes', () => {
  it('conserva los metadatos usados por la conversión implícita', () => {
    expect(Reflect.getMetadata('design:type', CreateWarehouseDto.prototype, 'isActive')).toBe(
      Boolean,
    );

    expect(Reflect.getMetadata('design:type', CreateWarehouseDto.prototype, 'name')).toBe(String);
  });

  it('recorta espacios y convierte el código a mayúsculas', async () => {
    const result = await validate(CreateWarehouseDto, {
      code: '  alm-prueba  ',
      name: '  Almacén de prueba  ',
      location: '  Zona norte  ',
    });

    expect(result).toMatchObject(validWarehouse);
  });

  it.each([true, false])('conserva el booleano isActive=%s', async (isActive) => {
    const result = await validate(CreateWarehouseDto, {
      ...validWarehouse,
      isActive,
    });

    expect(result.isActive).toBe(isActive);
  });

  it('permite omitir el estado para que el servicio aplique su valor inicial', async () => {
    const result = await validate(CreateWarehouseDto, {
      ...validWarehouse,
    });

    expect(result.isActive).toBeUndefined();
  });

  it.each(['false', 'true', 0, 1, null])(
    'rechaza un estado que no sea booleano: %j',
    async (isActive) => {
      await expect(
        validate(CreateWarehouseDto, {
          ...validWarehouse,
          isActive,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each([undefined, null, '', '   ', 123])(
    'rechaza una ubicación inválida: %j',
    async (location) => {
      await expect(
        validate(CreateWarehouseDto, {
          ...validWarehouse,
          location,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each([
    { field: 'code', value: 'AB', reason: 'código demasiado corto' },
    { field: 'code', value: 'A'.repeat(51), reason: 'código demasiado largo' },
    { field: 'name', value: 'AB', reason: 'nombre demasiado corto' },
    { field: 'name', value: 'A'.repeat(101), reason: 'nombre demasiado largo' },
    {
      field: 'location',
      value: 'A'.repeat(256),
      reason: 'ubicación demasiado larga',
    },
    { field: 'code', value: 12345, reason: 'código numérico' },
    { field: 'name', value: 12345, reason: 'nombre numérico' },
  ])('rechaza $reason', async ({ field, value }) => {
    await expect(
      validate(CreateWarehouseDto, {
        ...validWarehouse,
        [field]: value,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza propiedades adicionales', async () => {
    await expect(
      validate(CreateWarehouseDto, {
        ...validWarehouse,
        extra: 'no permitido',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Validación de edición de almacenes', () => {
  it('permite actualizar únicamente el nombre', async () => {
    const result = await validate(UpdateWarehouseDto, {
      name: '  Almacén actualizado  ',
    });

    expect(result.name).toBe('Almacén actualizado');
    expect(result.code).toBeUndefined();
    expect(result.location).toBeUndefined();
  });

  it.each(['code', 'name', 'location'])('rechaza null en %s', async (field) => {
    await expect(
      validate(UpdateWarehouseDto, {
        [field]: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza cambiar el estado mediante la edición general', async () => {
    await expect(
      validate(UpdateWarehouseDto, {
        name: 'Almacén actualizado',
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza propiedades adicionales', async () => {
    await expect(
      validate(UpdateWarehouseDto, {
        extra: 'no permitido',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Validación del cambio de estado', () => {
  it.each([true, false])('acepta y conserva isActive=%s', async (isActive) => {
    const result = await validate(SetCatalogStatusDto, {
      isActive,
    });

    expect(result.isActive).toBe(isActive);
  });

  it.each(['false', 'true', 0, 1, null])('rechaza un estado inválido: %j', async (isActive) => {
    await expect(
      validate(SetCatalogStatusDto, {
        isActive,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige indicar el estado', async () => {
    await expect(validate(SetCatalogStatusDto, {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
