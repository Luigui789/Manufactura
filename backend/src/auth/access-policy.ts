import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { RoleCode } from '../generated/prisma/client.js';

/**
 * Políticas de acceso (ADR 010). Toda ruta declara exactamente una; una ruta
 * sin política se deniega.
 */
export type AccessPolicy =
  { kind: 'public' } | { kind: 'authenticated' } | { kind: 'roles'; roles: readonly RoleCode[] };

export const ACCESS_POLICY = 'ecosoap:access-policy';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'ecosoap:allow-pending-password-change';

/** Usuario autenticado que JwtAuthGuard deja en la petición, leído de la base. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  mustChangePassword: boolean;
};

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

type PolicyDecorator = ClassDecorator & MethodDecorator;

/**
 * Una sola clave de metadatos para las tres políticas: declarar dos en el mismo
 * método o en la misma clase falla al cargar la aplicación. La del método
 * sustituye a la de la clase.
 */
function declarePolicy(policy: AccessPolicy): PolicyDecorator {
  return ((target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const metadataTarget = (descriptor?.value as object | undefined) ?? target;
    if (Reflect.hasOwnMetadata(ACCESS_POLICY, metadataTarget)) {
      throw new Error('Una ruta solo puede declarar una política de acceso');
    }
    Reflect.defineMetadata(ACCESS_POLICY, policy, metadataTarget);
    return descriptor;
  }) as PolicyDecorator;
}

/** No requiere autenticación. */
export const Public = (): PolicyDecorator => declarePolicy({ kind: 'public' });

/** Cualquier usuario autenticado y activo. */
export const Authenticated = (): PolicyDecorator => declarePolicy({ kind: 'authenticated' });

/** Autenticación y uno de los roles declarados, comparado con el rol actual de la base. */
export const Roles = (...roles: [RoleCode, ...RoleCode[]]): PolicyDecorator =>
  declarePolicy({ kind: 'roles', roles });

/** Marca las únicas rutas usables mientras mustChangePassword es true. */
export const AllowPendingPasswordChange =
  (): MethodDecorator =>
  (_target: object, _key: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true, descriptor.value as object);
    return descriptor;
  };

/** Inyecta el usuario autenticado en el handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      // Solo ocurriría si se usa en una ruta @Public(): es un error de programación.
      throw new Error('@CurrentUser() requiere una ruta autenticada');
    }
    return user;
  },
);
