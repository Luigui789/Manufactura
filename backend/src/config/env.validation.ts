import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Contrato de las variables de entorno que el backend necesita.
 *
 * Se valida al arrancar, no en el primer uso: si falta DATABASE_URL, el proceso
 * debe morir de inmediato con un mensaje claro en lugar de fallar mas tarde
 * dentro de una consulta (principio de fail fast).
 */
class EnvironmentVariables {
  @IsEnum(NodeEnv, { message: 'NODE_ENV debe ser development, production o test' })
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt({ message: 'PORT debe ser un numero entero' })
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty({
    message: 'DATABASE_URL es obligatoria: copia .env.example como .env en la raiz del repositorio',
  })
  DATABASE_URL: string;

  @IsUrl(
    { require_tld: false },
    { message: 'FRONTEND_URL debe ser una URL valida, por ejemplo http://localhost:5173' },
  )
  FRONTEND_URL: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    // Las variables de entorno siempre llegan como texto; PORT debe terminar
    // siendo un numero.
    enableImplicitConversion: true,
  });

  const errores = validateSync(parsed, { skipMissingProperties: false });

  if (errores.length > 0) {
    const detalle = errores
      .map((error) => Object.values(error.constraints ?? {}).join('; '))
      .join('\n  - ');

    throw new Error(
      `Variables de entorno invalidas:\n  - ${detalle}\n\n` +
        'Revisa el archivo .env de la raiz del monorepo (usa .env.example como referencia).',
    );
  }

  return parsed;
}
