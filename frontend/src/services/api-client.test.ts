import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './api-client';
import { loginSchema, passwordSchema } from '@/features/auth/schemas';

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
});
describe('Cliente HTTP y política de contraseña', () => {
  it('F6: 5xx usa referencia y nunca el cuerpo interno', async () => {
    const response = new Response('Prisma P2002 secret JWT stack trace', {
      status: 500,
      headers: { 'X-Request-Id': 'req-test' },
    });
    const json = vi.spyOn(response, 'json');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(apiFetch('/users')).rejects.toMatchObject({
      status: 500,
      message: 'Error interno del servidor (ref. req-test)',
      requestId: 'req-test',
    });
    expect(json).not.toHaveBeenCalled();
  });
  it('sin red muestra mensaje comprensible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/auth/me')).rejects.toThrow('No se pudo conectar con el servidor');
  });
  it('errores 4xx de validación muestran los mensajes del backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: ['Correo inválido', 'Nombre requerido'] }), {
          status: 400,
        }),
      ),
    );
    await expect(apiFetch('/users')).rejects.toMatchObject({
      message: 'Correo inválido. Nombre requerido',
    });
  });
  it('respuesta no JSON de error no filtra HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>proxy interno</html>', { status: 403 })),
    );
    await expect(apiFetch('/users')).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>proxy interno</html>', { status: 403 })),
    );
    await expect(apiFetch('/users')).rejects.toThrow('No se pudo completar la operación');
  });
  it('normaliza NFC y cuenta caracteres Unicode igual que el backend', () => {
    expect(passwordSchema.safeParse('a'.repeat(14)).success).toBe(false);
    expect(passwordSchema.safeParse('😀'.repeat(15)).success).toBe(true);
    expect(passwordSchema.safeParse('😀'.repeat(129)).success).toBe(false);
    expect(passwordSchema.parse('e\u0301'.repeat(15))).toBe('é'.repeat(15));
    expect(
      loginSchema.safeParse({ email: 'persona@example.test', password: '😀'.repeat(128) }).success,
    ).toBe(true);
  });
});
