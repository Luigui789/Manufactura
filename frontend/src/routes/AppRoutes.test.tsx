import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { SessionUser } from '@/features/auth/types';
import { AppRoutes } from './AppRoutes';
import {
  overview as iiotOverview,
  page as iiotPage,
  response as iiotResponse,
} from '@/features/iiot/test/fixtures';

const account: SessionUser = {
  id: 'admin-test',
  email: 'admin@example.test',
  fullName: 'Administrador de prueba',
  role: 'ADMIN',
  isActive: true,
  mustChangePassword: false,
  createdAt: '',
  updatedAt: '',
};
const other: SessionUser = {
  ...account,
  id: 'ventas-test',
  email: 'ventas@example.test',
  fullName: 'Persona de ventas',
  role: 'VENTAS',
};
const password = 'una frase temporal de prueba';
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mount(path = '/', user: SessionUser | null = account, loadSession = false) {
  const client = createAppQueryClient();
  if (!loadSession) client.setQueryData(SESSION_KEY, user);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
});

describe('Aceptación F1–F5', () => {
  it('protege la ruta IIoT sin sesión', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = mount('/production/orders/order/iiot', null);
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    client.clear();
  });
  it('carga IIoT por URL para VENTAS y mantiene Producción activa sin módulo global', async () => {
    const summary = iiotOverview('COMPLETED');
    summary.telemetry = { totalReadings: 0, latestByMetric: [], lastReadingAt: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        iiotResponse(url.endsWith('/overview') ? { data: summary } : iiotPage([])),
      ),
    );
    const client = mount('/production/orders/order/iiot', other);
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Monitoreo IIoT · OP-000001' },
        { timeout: 10000 },
      ),
    ).toBeTruthy();
    const nav = within(screen.getByRole('navigation', { name: 'Menú principal' }));
    expect(
      nav.getByRole('link', { name: 'Producción · Órdenes' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(nav.queryByRole('link', { name: /IIoT/ })).toBeNull();
    client.clear();
  });
  it('F1: correo inválido y contraseña vacía no llaman al servidor', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mount('/login', null);
    fill('Correo electrónico', 'correo inválido');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Introduce un correo válido')).toBeTruthy();
    expect(screen.getByText('Introduce tu contraseña')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('F2: sin sesión redirige a login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ message: 'Sesión requerida' }, 401)),
    );
    mount('/users', null, true);
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).toBeNull();
  });
  it('F3: con sesión muestra el contenido protegido', () => {
    mount();
    expect(screen.getByText('Bienvenido, Administrador de prueba')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Proveedores' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Productos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Almacenes' })).toBeTruthy();
  });
  it.each(['COMPRAS', 'PRODUCCION', 'INVENTARIO', 'VENTAS'] as const)(
    'F4: %s no ve Usuarios ni accede por URL',
    (role) => {
      mount('/users', { ...account, role });
      expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
      expect(screen.getByRole('heading', { name: '403 · Acceso denegado' })).toBeTruthy();
    },
  );
  it.each(['/', '/users', '/login', '/desconocida'])(
    'F5: cambio pendiente en %s lleva a contraseña sin menú',
    async (path) => {
      mount(path, { ...account, mustChangePassword: true });
      expect(
        await screen.findByText(
          'Tu contraseña es temporal. Debes cambiarla antes de acceder al ERP.',
        ),
      ).toBeTruthy();
      expect(screen.queryByRole('navigation')).toBeNull();
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    },
  );
  it('no monta contenido protegido durante la carga de sesión', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    mount('/users', null, true);
    expect(screen.getByRole('status').textContent).toBe('Cargando sesión…');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('Integración de los catálogos de Compras, Inventario y Ventas', () => {
  it('abre el dashboard de producción para una sesión autenticada y consulta su API', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        data: {
          period: {
            from: '2026-10-01',
            to: '2026-10-30',
            timeZone: 'America/Managua',
            granularity: 'day',
          },
          orders: { draft: 0, inProgress: 0, completed: 0, cancelled: 0, total: 0 },
          quantity: { planned: '0.0000', produced: '0.0000', completionRate: null },
          productionByPeriod: [],
          recentOrders: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    mount('/production/dashboard', { ...account, role: 'PRODUCCION' });

    expect(
      await screen.findByRole('heading', { name: 'Dashboard de producción' }, { timeout: 10000 }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Producción · Dashboard' })).toBeTruthy();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/production/dashboard',
        expect.objectContaining({ credentials: 'include' }),
      ),
    );
  });

  it.each([
    ['/purchases/suppliers', 'Gestión de Proveedores', 'suppliers', 'COMPRAS'],
    ['/sales/customers', 'Gestión de Clientes', 'customers', 'VENTAS'],
    ['/inventory/products', 'Gestión de Productos', 'products', 'INVENTARIO'],
    ['/inventory/warehouses', 'Gestión de Almacenes', 'warehouses', 'INVENTARIO'],
    ['/inventory/stock', 'Existencias', 'inventory/stock', 'INVENTARIO'],
    ['/inventory/movements', 'Movimientos', 'inventory/movements', 'INVENTARIO'],
    ['/inventory/lots', 'Lotes', 'inventory/lots', 'INVENTARIO'],
  ] as const)(
    'abre %s y consulta su API con el rol responsable',
    async (path, heading, endpoint, role) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(response({ data: [], meta: { page: 1, limit: 20, total: 0 } }));
      vi.stubGlobal('fetch', fetch);
      mount(path, { ...account, role });

      expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Productos' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Almacenes' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Existencias' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Movimientos' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Lotes' })).toBeTruthy();
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/${endpoint}?`),
          expect.objectContaining({ credentials: 'include' }),
        ),
      );
    },
  );

  it.each(['INVENTARIO', 'VENTAS'] as const)(
    'conserva la restricción de proveedores para %s sin ocultar Inventario',
    (role) => {
      mount('/purchases/suppliers', { ...account, role });
      expect(screen.getByRole('heading', { name: '403 · Acceso denegado' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Proveedores' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Productos' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Almacenes' })).toBeTruthy();
    },
  );

  it.each(['COMPRAS', 'INVENTARIO'] as const)(
    'conserva la restricción de clientes para %s sin ocultar Inventario',
    (role) => {
      mount('/sales/customers', { ...account, role });
      expect(screen.getByRole('heading', { name: '403 · Acceso denegado' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Productos' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Almacenes' })).toBeTruthy();
      if (role === 'COMPRAS') {
        expect(screen.getByRole('link', { name: 'Proveedores' })).toBeTruthy();
      }
    },
  );
});

describe('Formularios y sesión', () => {
  it('login normaliza correo, envía cookies y abre el inicio', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ data: account }));
    vi.stubGlobal('fetch', fetch);
    mount('/login', null);
    fill('Correo electrónico', 'ADMIN@example.test');
    fill('Contraseña', password);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Bienvenido, Administrador de prueba')).toBeTruthy();
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      body: JSON.stringify({ email: account.email, password }),
    });
  });
  it.each([
    [401, 'Correo o contraseña incorrectos'],
    [429, 'Demasiados intentos. Espera un minuto'],
  ] as const)('login %s informa sin crear sesión', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ message: 'mensaje backend' }, status)),
    );
    mount('/login', null);
    fill('Correo electrónico', account.email);
    fill('Contraseña', password);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('cambio de contraseña confirma y sale del bloqueo con cookie renovada', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ data: account }));
    vi.stubGlobal('fetch', fetch);
    mount('/account/password', { ...account, mustChangePassword: true });
    fill('Contraseña actual', password);
    fill('Nueva contraseña', 'una frase nueva de prueba');
    fill('Confirmar nueva contraseña', 'distinta');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fill('Confirmar nueva contraseña', 'una frase nueva de prueba');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Bienvenido, Administrador de prueba')).toBeTruthy();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      currentPassword: password,
      newPassword: 'una frase nueva de prueba',
    });
  });
  it('logout limpia toda la caché y lleva a login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ data: null })));
    const client = mount();
    client.setQueryData(['users', 1], { secret: 'dato privado' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(client.getQueryData(['users', 1])).toBeUndefined();
    expect(client.getQueryData(SESSION_KEY)).toBeNull();
  });
  it('un 401 fuera de login vacía caché y redirige', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ message: 'Sesión revocada' }, 401)),
    );
    const client = mount('/users');
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(client.getQueryData(['users', 1])).toBeUndefined();
    expect(screen.getByText('Tu sesión expiró o fue cerrada')).toBeTruthy();
  });
  it('PASSWORD_CHANGE_REQUIRED en el formato NestJS bloquea el menú', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith('/auth/me')
            ? response({ data: { ...account, mustChangePassword: true } })
            : response(
                {
                  message: 'Debes cambiar tu contraseña antes de continuar',
                  error: 'PASSWORD_CHANGE_REQUIRED',
                },
                403,
              ),
        ),
      ),
    );
    mount('/users');
    expect(
      await screen.findByText(
        'Tu contraseña es temporal. Debes cambiarla antes de acceder al ERP.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('403 por rol consulta de nuevo la sesión y elimina el menú de ADMIN', async () => {
    const fetch = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith('/auth/me')
            ? response({ data: other })
            : response({ message: 'Sin permiso' }, 403),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    mount('/users');
    expect(await screen.findByRole('heading', { name: '403 · Acceso denegado' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
  });
});

describe('Administración de usuarios', () => {
  function usersFetch() {
    const fetch = vi
      .fn()
      .mockImplementation((_url: string, options: RequestInit) =>
        Promise.resolve(
          options.method
            ? response({ data: other, message: 'Operación completada' })
            : response({ data: [account, other], meta: { page: 1, limit: 20, total: 21 } }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }
  it('deshabilita las tres acciones peligrosas sobre la propia cuenta', async () => {
    usersFetch();
    mount('/users');
    const row = (await screen.findByText('Administrador de prueba (tú)')).closest('tr')!;
    for (const name of ['Desactivar', 'Cambiar rol', 'Restablecer contraseña'])
      expect((within(row).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('alta valida confirmación y solo envía campos del DTO', async () => {
    const fetch = usersFetch();
    mount('/users');
    await screen.findByText('Persona de ventas');
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    fill('Nombre completo', 'Nueva persona');
    fill('Correo electrónico', 'NUEVA@example.test');
    fill('Contraseña temporal', password);
    fill('Confirmar contraseña temporal', 'distinta');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeTruthy();
    expect(fetch.mock.calls.filter((call) => call[1].method)).toHaveLength(0);
    fill('Confirmar contraseña temporal', password);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Operación completada')).toBeTruthy();
    const post = fetch.mock.calls.find((call) => call[1].method === 'POST')!;
    expect(JSON.parse(post[1].body)).toEqual({
      fullName: 'Nueva persona',
      email: 'nueva@example.test',
      role: 'VENTAS',
      temporaryPassword: password,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('desactivar exige confirmación antes de llamar al endpoint', async () => {
    const fetch = usersFetch();
    mount('/users');
    const row = (await screen.findByText('Persona de ventas')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    expect(fetch.mock.calls.filter((call) => call[1].method)).toHaveLength(0);
    expect(screen.getByRole('dialog').textContent).toContain('Se bloqueará el acceso');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Operación completada')).toBeTruthy();
    expect(fetch.mock.calls.some((call) => call[0].endsWith('/ventas-test/disable'))).toBe(true);
  });
  it('paginación consulta la página siguiente en el servidor', async () => {
    const fetch = usersFetch();
    mount('/users');
    await screen.findByText('Persona de ventas');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(fetch.mock.calls.some((call) => call[0].includes('page=2&limit=20'))).toBe(true),
    );
  });
});

describe('Purchase and inventory routes after merging develop', () => {
  it.each([
    ['/purchases/orders', 'Órdenes de compra'],
    ['/purchases/orders/new', 'Nueva orden de compra'],
    ['/purchases/orders/order', 'OC-2026-000001'],
  ])('preserves purchase route %s and both navigation groups', async (path, heading) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        response(
          url.endsWith('/purchase-orders/order')
            ? {
                data: {
                  id: 'order',
                  number: 'OC-2026-000001',
                  supplier: { code: 'PROV', name: 'Proveedor' },
                  status: 'CONFIRMED',
                  orderedAt: '2026-10-13T20:00:00Z',
                  expectedDate: '2026-10-14',
                  total: '0.00',
                  items: [],
                  receipts: [],
                },
              }
            : { data: [], meta: { page: 1, limit: 20, total: 0 } },
        ),
      ),
    );
    const client = mount(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    const nav = within(screen.getByRole('navigation', { name: 'Menú principal' }));
    for (const name of ['Compras', 'Existencias', 'Movimientos', 'Lotes'])
      expect(nav.getByRole('link', { name })).toBeTruthy();
    client.clear();
  });
});

describe('Navegación del ERP', () => {
  it.each(['ADMIN', 'COMPRAS', 'PRODUCCION', 'INVENTARIO', 'VENTAS'] as const)(
    'agrupa los módulos permitidos sin Administración vacía para %s',
    (role) => {
      mount('/', { ...account, role });
      const nav = within(screen.getByRole('navigation', { name: 'Menú principal' }));
      for (const group of ['General', 'Operaciones', 'Inventario', 'Maestros']) {
        expect(nav.getByText(group, { exact: true })).toBeTruthy();
      }
      expect(nav.getByRole('link', { name: 'Producción · Órdenes' })).toBeTruthy();
      expect(nav.getByRole('link', { name: 'Producción · Fórmulas' })).toBeTruthy();
      if (role === 'ADMIN') {
        expect(nav.getByText('Administración', { exact: true })).toBeTruthy();
        expect(nav.getByRole('link', { name: 'Usuarios' })).toBeTruthy();
      } else {
        expect(nav.queryByText('Administración', { exact: true })).toBeNull();
        expect(nav.queryByRole('link', { name: 'Usuarios' })).toBeNull();
      }
      expect(!!nav.queryByRole('link', { name: 'Proveedores' })).toBe(
        role === 'ADMIN' || role === 'COMPRAS',
      );
      expect(!!nav.queryByRole('link', { name: 'Clientes' })).toBe(
        role === 'ADMIN' || role === 'VENTAS',
      );
      expect(nav.getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBe('page');
    },
  );

  it.each([
    ['/production/orders/order', 'Producción · Órdenes', 'Orden de producción OP-2026-000001'],
    ['/production/boms/formula', 'Producción · Fórmulas', 'Fórmula jabón'],
  ])('mantiene activo el módulo al abrir el detalle %s', async (path, active, heading) => {
    const product = {
      id: 'product',
      code: 'JABON',
      name: 'Jabón',
      type: 'FINISHED_GOOD',
      unit: 'UNIT',
      isActive: true,
    };
    const formula = {
      id: 'formula',
      name: 'Fórmula jabón',
      isActive: true,
      productId: product.id,
      product,
      versions: [],
    };
    const updatedAt = '2026-10-10T12:00:00Z';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith('/requirements'))
          return response({
            data: { updatedAt, canStart: false, eligibilityIssues: [], items: [] },
          });
        if (url.pathname.includes('/production/orders/'))
          return response({
            data: {
              id: 'order',
              number: 'OP-2026-000001',
              product,
              warehouse: { id: 'warehouse', code: 'ALM', name: 'Principal' },
              bomVersion: { id: 'version', version: 1, bom: formula },
              status: 'CANCELLED',
              quantityPlanned: '10.0000',
              quantityProduced: '0.0000',
              plannedStartAt: null,
              plannedEndAt: null,
              lot: null,
              createdAt: updatedAt,
              updatedAt,
            },
          });
        return response({ data: formula });
      }),
    );
    mount(path, other);
    expect(
      await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 10000 }),
    ).toBeTruthy();
    const nav = within(screen.getByRole('navigation', { name: 'Menú principal' }));
    expect(nav.getByRole('link', { name: active }).getAttribute('aria-current')).toBe('page');
    const inactive =
      active === 'Producción · Órdenes' ? 'Producción · Fórmulas' : 'Producción · Órdenes';
    expect(nav.getByRole('link', { name: inactive }).getAttribute('aria-current')).toBeNull();
    expect(nav.getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBeNull();
  });

  it('abre el menú accesible y lo cierra con Escape devolviendo el foco', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Abrir menú' });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'EcoSoap ERP' });
    expect(within(dialog).getByRole('navigation', { name: 'Menú principal' })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBe(
      'page',
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('cierra el menú al navegar y conserva activa la sección elegida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ data: [], meta: { page: 1, limit: 20, total: 0 } })),
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const dialog = await screen.findByRole('dialog', { name: 'EcoSoap ERP' });
    fireEvent.click(within(dialog).getByRole('link', { name: 'Producción · Fórmulas' }));
    expect(
      await screen.findByRole('heading', { name: 'Fórmulas de producción', level: 1 }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      within(screen.getByRole('navigation', { name: 'Menú principal' }))
        .getByRole('link', { name: 'Producción · Fórmulas' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('Production routes navigation and authentication', () => {
  it.each(['/production/routes', '/production/routes/new', '/production/routes/route'])(
    'requires a session: %s',
    async (path) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const client = mount(path, null);

      expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
      expect(fetch).not.toHaveBeenCalled();
      client.clear();
    },
  );

  it('opens routes from URL and exposes navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ data: [], meta: { page: 1, limit: 20, total: 0 } })),
    );

    const client = mount('/production/routes', other);
    expect(await screen.findByRole('heading', { name: 'Rutas de producción' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Producción · Rutas' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Crear ruta' })).toBeNull();
    client.clear();
  });

  it('opens the new route form for production users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ data: [], meta: { page: 1, limit: 20, total: 0 } })),
    );

    const client = mount('/production/routes/new', { ...account, role: 'PRODUCCION' });
    expect(await screen.findByRole('heading', { name: 'Crear ruta de producción' })).toBeTruthy();
    client.clear();
  });
});

it('opens production route detail for a read-only user', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      response({
        data: {
          id: 'route',
          code: 'RT-1',
          name: 'Ruta estándar',
          productId: 'product',
          product: { code: 'PT-1', name: 'Jabón' },
          isActive: true,
          description: null,
          operationCount: 1,
          totalStandardMinutes: '15.00',
          operations: [
            {
              id: 'operation',
              sequence: 10,
              name: 'Mezclado',
              description: null,
              standardMinutes: '15.00',
            },
          ],
        },
      }),
    ),
  );
  const client = mount('/production/routes/route', other);
  expect(await screen.findByRole('heading', { name: 'Ruta estándar' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Editar operaciones' })).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Ver estructura de manufactura' }).getAttribute('href'),
  ).toBe('/production/structure/product');
  client.clear();
});

describe('Manufacturing structure navigation', () => {
  it('requires a session', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = mount('/production/structure', null);
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    client.clear();
  });

  it('opens the structure landing for any role and exposes navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ data: [], meta: { page: 1, limit: 20, total: 0 } })),
    );
    const client = mount('/production/structure', other);
    expect(await screen.findByRole('heading', { name: 'Estructura de manufactura' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Producción · Estructura' }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByRole('link', { name: 'Producción · Rutas' }).length).toBeGreaterThan(0);
    client.clear();
  });
});
