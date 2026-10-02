import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RoleCode } from '../../generated/prisma/client.js';
import {
  AllowPendingPasswordChange,
  Authenticated,
  type AuthenticatedUser,
  Public,
  Roles,
} from '../access-policy.js';
import { isAllowedRequest } from './cross-origin-protection.guard.js';
import {
  PASSWORD_CHANGE_REQUIRED,
  PasswordChangeRequiredGuard,
} from './password-change-required.guard.js';
import { RolesGuard } from './roles.guard.js';

const trusted = new Set(['http://localhost:5173']);

function req(method: string, headers: Record<string, string>) {
  return { method, headers: { host: 'localhost:3000', ...headers } };
}

describe('Protección de origen (Origin + Fetch Metadata)', () => {
  it.each([
    ['GET sin control', req('GET', { 'sec-fetch-site': 'cross-site' }), true],
    ['same-origin', req('POST', { 'sec-fetch-site': 'same-origin' }), true],
    ['none (navegación del usuario)', req('POST', { 'sec-fetch-site': 'none' }), true],
    [
      'same-site desde el frontend de confianza',
      req('POST', { 'sec-fetch-site': 'same-site', origin: 'http://localhost:5173' }),
      true,
    ],
    [
      'same-site desde otro origen',
      req('POST', { 'sec-fetch-site': 'same-site', origin: 'http://localhost:8080' }),
      false,
    ],
    ['cross-site sin origen', req('POST', { 'sec-fetch-site': 'cross-site' }), false],
    ['sin cabeceras de navegador', req('POST', {}), true],
    ['sin Fetch Metadata, Origin = Host', req('POST', { origin: 'http://localhost:3000' }), true],
    [
      'sin Fetch Metadata, Origin de confianza',
      req('POST', { origin: 'http://localhost:5173' }),
      true,
    ],
    [
      'sin Fetch Metadata, Origin ajeno',
      req('POST', { origin: 'https://atacante.example' }),
      false,
    ],
    ['Origin null', req('DELETE', { origin: 'null' }), false],
  ])('%s', (_name, request, allowed) => {
    expect(isAllowedRequest(request, trusted)).toBe(allowed);
  });

  it('ignora el puerto por defecto del Host', () => {
    expect(
      isAllowedRequest(
        { method: 'POST', headers: { host: 'erp.example:443', origin: 'https://erp.example' } },
        trusted,
      ),
    ).toBe(true);
  });
});

class Sample {
  @Public()
  open() {}

  @Authenticated()
  anyone() {}

  @Roles(RoleCode.ADMIN)
  admins() {}

  @Authenticated()
  @AllowPendingPasswordChange()
  pendingAllowed() {}

  undeclared() {}
}

function context(handler: keyof Sample, user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => Object.getOwnPropertyDescriptor(Sample.prototype, handler)?.value as object,
    getClass: () => Sample,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function user(role: RoleCode, mustChangePassword = false): AuthenticatedUser {
  return { id: 'id', email: 'e@example.test', fullName: 'U', role, mustChangePassword };
}

describe('Políticas de acceso y RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('Public y Authenticated pasan; Roles comprueba el rol', () => {
    expect(guard.canActivate(context('open'))).toBe(true);
    expect(guard.canActivate(context('anyone', user(RoleCode.VENTAS)))).toBe(true);
    expect(guard.canActivate(context('admins', user(RoleCode.ADMIN)))).toBe(true);
    expect(() => guard.canActivate(context('admins', user(RoleCode.VENTAS)))).toThrow(
      ForbiddenException,
    );
  });

  it('una ruta sin política se deniega', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => guard.canActivate(context('undeclared', user(RoleCode.ADMIN)))).toThrow(
      ForbiddenException,
    );
  });

  it('dos políticas en el mismo destino fallan al cargar', () => {
    expect(() => {
      class Broken {
        @Public()
        @Roles(RoleCode.ADMIN)
        route() {}
      }
      return Broken;
    }).toThrow('Una ruta solo puede declarar una política de acceso');
  });

  it('la política del método sustituye a la de la clase', () => {
    @Roles(RoleCode.ADMIN)
    class AdminOnly {
      @Public()
      health() {}
    }
    const ctx = {
      getHandler: () =>
        Object.getOwnPropertyDescriptor(AdminOnly.prototype, 'health')?.value as object,
      getClass: () => AdminOnly,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

describe('PasswordChangeRequiredGuard', () => {
  const guard = new PasswordChangeRequiredGuard(new Reflector());

  it('sin cambio pendiente pasa', () => {
    expect(guard.canActivate(context('admins', user(RoleCode.ADMIN)))).toBe(true);
  });

  it('con cambio pendiente solo pasa en rutas marcadas', () => {
    expect(guard.canActivate(context('pendingAllowed', user(RoleCode.ADMIN, true)))).toBe(true);
    try {
      guard.canActivate(context('admins', user(RoleCode.ADMIN, true)));
      throw new Error('debía rechazar');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        error: PASSWORD_CHANGE_REQUIRED,
      });
    }
  });

  it('las rutas públicas no tienen usuario y pasan', () => {
    expect(guard.canActivate(context('open'))).toBe(true);
  });
});
