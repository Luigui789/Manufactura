export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function apiFetch<T>(route: string, options: RequestInit = {}): Promise<T> {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (!base) throw new ApiError(0, 'Falta configurar VITE_API_URL');
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, '')}${route}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      credentials: 'include',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }
  const requestId = response.headers.get('X-Request-Id') ?? undefined;
  // Nunca interpretar ni mostrar el cuerpo interno de un error de servidor.
  if (response.status >= 500) {
    throw new ApiError(
      response.status,
      `Error interno del servidor${requestId ? ` (ref. ${requestId})` : ''}`,
      undefined,
      requestId,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const message =
      typeof fields.message === 'string'
        ? fields.message
        : Array.isArray(fields.message) && fields.message.every((item) => typeof item === 'string')
          ? fields.message.join('. ')
          : 'No se pudo completar la operación';
    throw new ApiError(
      response.status,
      message,
      typeof fields.code === 'string'
        ? fields.code
        : fields.error === 'PASSWORD_CHANGE_REQUIRED'
          ? fields.error
          : undefined,
      requestId,
    );
  }
  return body as T;
}

export type ApiResponse<T> = { data: T; message: string };
