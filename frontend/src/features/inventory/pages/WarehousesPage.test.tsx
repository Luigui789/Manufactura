import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode, SessionUser } from '@/features/auth/types';
import type { CreateWarehouseData, Warehouse } from '../types';
import { WarehousesPage } from './WarehousesPage';

const warehouse: Warehouse = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'ALM-PRINCIPAL',
  name: 'Almacén principal',
  location: 'Planta principal',
  isActive: true,
  createdAt: '2026-10-07T12:00:00.000Z',
  updatedAt: '2026-10-07T12:00:00.000Z',
};

const newData: CreateWarehouseData = {
  code: 'ALM-NORTE',
  name: 'Almacén Norte',
  location: 'Nave Norte',
  isActive: true,
};

const clients: ReturnType<typeof createAppQueryClient>[] = [];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Solo se simula HTTP: se usan la página, los formularios y los hooks reales.
function warehousesApi(initial: Warehouse[] = [warehouse]) {
  let items = initial.map((item) => ({ ...item }));

  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const address = new URL(url);
    const method = options.method ?? 'GET';
    const base = '/api/warehouses';

    if (method === 'GET' && address.pathname === base) {
      const page = Number(address.searchParams.get('page') ?? 1);
      const limit = Number(address.searchParams.get('limit') ?? 20);

      return response({
        data: items.slice((page - 1) * limit, page * limit),
        meta: { page, limit, total: items.length },
      });
    }

    if (method === 'POST' && address.pathname === base) {
      const data = JSON.parse(String(options.body)) as CreateWarehouseData;
      const created = {
        ...warehouse,
        ...data,
        id: '00000000-0000-4000-8000-000000000099',
      };

      items = [...items, created];
      return response({ data: created, message: 'Almacén creado' }, 201);
    }

    const current = items.find((item) =>
      [base + '/' + item.id, base + '/' + item.id + '/status'].includes(address.pathname),
    );

    if (current && method === 'PATCH') {
      const changes = JSON.parse(String(options.body)) as Partial<Warehouse>;
      const updated = { ...current, ...changes };

      items = items.map((item) => (item.id === current.id ? updated : item));
      return response({ data: updated, message: 'Almacén actualizado' });
    }

    return response({ message: 'Ruta no simulada' }, 404);
  });

  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function writes(fetch: ReturnType<typeof warehousesApi>) {
  return fetch.mock.calls.filter(([, options]) =>
    ['POST', 'PATCH', 'DELETE'].includes(options?.method ?? 'GET'),
  );
}

function mount(role: RoleCode = 'ADMIN') {
  const client = createAppQueryClient();
  const user: SessionUser = {
    id: 'test-user',
    email: 'inventory@example.test',
    fullName: 'Persona de prueba',
    role,
    isActive: true,
    mustChangePassword: false,
    createdAt: '',
    updatedAt: '',
  };

  client.setQueryData(SESSION_KEY, user);
  clients.push(client);

  render(
    <QueryClientProvider client={client}>
      <WarehousesPage />
    </QueryClientProvider>,
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillWarehouse(data: Pick<CreateWarehouseData, 'code' | 'name' | 'location'> = newData) {
  fill('Código del Almacén', data.code);
  fill('Nombre del Almacén', data.name);
  fill('Ubicación', data.location);
}

async function openCreate() {
  await screen.findByRole('table', { name: 'Almacenes' });
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo almacén' }));
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe('Almacenes: interfaz de Inventario', () => {
  it('muestra código, nombre, ubicación y estado', async () => {
    warehousesApi();
    mount();

    const table = within(await screen.findByRole('table', { name: 'Almacenes' }));

    for (const text of [warehouse.code, warehouse.name, warehouse.location, 'Activo']) {
      expect(table.getByText(text)).toBeTruthy();
    }

    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('informa cuando no hay almacenes', async () => {
    warehousesApi([]);
    mount();

    expect(await screen.findByText('No hay almacenes en esta página.')).toBeTruthy();
  });

  it('muestra carga mientras espera al servidor', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    mount();

    expect(screen.getByRole('status').textContent).toBe('Cargando almacenes…');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('consulta la página siguiente en el servidor', async () => {
    const items = Array.from({ length: 21 }, (_, index) => ({
      ...warehouse,
      id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
      code: 'ALM-' + String(index + 1),
      name: 'Almacén ' + String(index + 1),
    }));

    const fetch = warehousesApi(items);
    mount();
    await screen.findByText('Almacén 1');

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Almacén 21')).toBeTruthy();
    expect(screen.queryByText('Almacén 1')).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/warehouses?page=2&limit=20'))).toBe(
      true,
    );
    expect(screen.getByText('Página 2 de 2 · 21 almacenes')).toBeTruthy();
  });

  it.each(['ADMIN', 'INVENTARIO'] as const)(
    '%s crea con ubicación y actualiza el listado',
    async (role) => {
      const fetch = warehousesApi();
      mount(role);
      await openCreate();
      fillWarehouse();

      expect(
        (screen.getByRole('checkbox', { name: 'Almacén Activo' }) as HTMLInputElement).checked,
      ).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(await screen.findByText('Almacén creado exitosamente')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();

      const row = (await screen.findByText(newData.name)).closest('tr')!;
      expect(within(row).getByText(newData.location)).toBeTruthy();
      expect(within(row).getByText('Activo')).toBeTruthy();
      expect(writes(fetch)).toHaveLength(1);

      const [url, options] = writes(fetch)[0];
      expect(url).toBe('http://localhost:3000/api/warehouses');
      expect(options).toMatchObject({ method: 'POST', credentials: 'include' });
      expect(JSON.parse(String(options?.body))).toEqual(newData);
    },
  );

  it('permite crear un almacén inicialmente inactivo', async () => {
    const fetch = warehousesApi([]);
    mount();
    await openCreate();
    fillWarehouse();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Almacén Activo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Almacén creado exitosamente')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(1);
    expect(JSON.parse(String(writes(fetch)[0][1]?.body))).toEqual({
      ...newData,
      isActive: false,
    });

    const table = within(screen.getByRole('table', { name: 'Almacenes' }));
    expect(table.getByText('Inactivo')).toBeTruthy();
    expect(table.getByRole('button', { name: 'Activar ' + newData.code })).toBeTruthy();
  });

  it('rechaza campos vacíos y una ubicación demasiado larga', async () => {
    const fetch = warehousesApi();
    mount();
    await openCreate();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('El código debe tener al menos 3 caracteres')).toBeTruthy();
    expect(screen.getByText('El nombre debe tener al menos 3 caracteres')).toBeTruthy();
    expect(screen.getByText('La ubicación es obligatoria')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(0);

    fillWarehouse({ ...newData, location: 'X'.repeat(256) });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('La ubicación admite hasta 255 caracteres')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(0);
  });

  it('edita código, nombre y ubicación sin enviar el estado', async () => {
    const fetch = warehousesApi();
    mount();
    await screen.findByText(warehouse.name);

    fireEvent.click(screen.getByRole('button', { name: 'Editar ' + warehouse.code }));

    expect((screen.getByLabelText('Ubicación') as HTMLInputElement).value).toBe(warehouse.location);
    expect(screen.queryByRole('checkbox', { name: 'Almacén Activo' })).toBeNull();

    const changes = {
      code: 'ALM-SUR',
      name: 'Almacén Sur',
      location: 'Zona de recepción',
    };

    fillWarehouse(changes);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Almacén actualizado exitosamente')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    const row = (await screen.findByText(changes.name)).closest('tr')!;
    expect(within(row).getByText(changes.code)).toBeTruthy();
    expect(within(row).getByText(changes.location)).toBeTruthy();
    expect(within(row).getByText('Activo')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(1);

    const [url, options] = writes(fetch)[0];
    expect(url).toBe('http://localhost:3000/api/warehouses/' + warehouse.id);
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual(changes);
  });

  it('deshabilita confirmar al abrir y al revertir los cambios', async () => {
    const fetch = warehousesApi();
    mount();
    await screen.findByText(warehouse.name);

    fireEvent.click(screen.getByRole('button', { name: 'Editar ' + warehouse.code }));

    const save = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(writes(fetch)).toHaveLength(0);

    fill('Ubicación', 'Ubicación temporal');
    await waitFor(() => expect(save.disabled).toBe(false));

    fill('Ubicación', warehouse.location);
    await waitFor(() => expect(save.disabled).toBe(true));
    fireEvent.click(save);

    expect(writes(fetch)).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('envía únicamente la ubicación modificada al editar', async () => {
    const fetch = warehousesApi();
    mount();
    await screen.findByText(warehouse.name);

    fireEvent.click(screen.getByRole('button', { name: 'Editar ' + warehouse.code }));
    const location = 'Nave Sur, pasillo 2';
    fill('Ubicación', location);

    // Un campo que vuelve a su valor original tampoco debe enviarse.
    fill('Nombre del Almacén', 'Nombre temporal');
    fill('Nombre del Almacén', warehouse.name);

    const save = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);

    expect(await screen.findByText('Almacén actualizado exitosamente')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(location)).toBeTruthy();
    expect(writes(fetch)).toHaveLength(1);

    const [url, options] = writes(fetch)[0];
    expect(url).toBe('http://localhost:3000/api/warehouses/' + warehouse.id);
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({ location });

    const table = within(screen.getByRole('table', { name: 'Almacenes' }));
    for (const text of [warehouse.code, warehouse.name, 'Activo']) {
      expect(table.getByText(text)).toBeTruthy();
    }
  });

  it('rechaza dejar la ubicación vacía al editar', async () => {
    const fetch = warehousesApi();
    mount();
    await screen.findByText(warehouse.name);

    fireEvent.click(screen.getByRole('button', { name: 'Editar ' + warehouse.code }));
    fill('Ubicación', '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('La ubicación es obligatoria')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText(warehouse.location)).toBeTruthy();
  });

  it.each([true, false])(
    'confirma el cambio de estado partiendo de isActive=%s',
    async (isActive) => {
      const fetch = warehousesApi([{ ...warehouse, isActive }]);
      mount();
      await screen.findByText(warehouse.name);

      const action = (isActive ? 'Desactivar ' : 'Activar ') + warehouse.code;

      fireEvent.click(screen.getByRole('button', { name: action }));
      expect(writes(fetch)).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(writes(fetch)).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: action }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(
        await screen.findByText(isActive ? 'Almacén desactivado' : 'Almacén activado'),
      ).toBeTruthy();
      expect(writes(fetch)).toHaveLength(1);

      const [url, options] = writes(fetch)[0];
      expect(url).toBe('http://localhost:3000/api/warehouses/' + warehouse.id + '/status');
      expect(options?.method).toBe('PATCH');
      expect(JSON.parse(String(options?.body))).toEqual({ isActive: !isActive });

      const table = within(screen.getByRole('table', { name: 'Almacenes' }));
      expect(table.getByText(isActive ? 'Inactivo' : 'Activo')).toBeTruthy();
      expect(table.getByText(warehouse.name)).toBeTruthy();
    },
  );

  it('muestra un conflicto de creación y conserva los datos del formulario', async () => {
    const fetch = warehousesApi();
    mount();
    await openCreate();
    fillWarehouse();

    fetch.mockResolvedValueOnce(response({ message: 'Ya existe un almacén con ese código' }, 409));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Ya existe un almacén con ese código')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Ubicación') as HTMLInputElement).value).toBe(newData.location);
    expect(writes(fetch)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(newData.name)).toBeNull();
  });

  it('permite reintentar cuando falla la conexión del listado', async () => {
    const fetch = warehousesApi();
    fetch.mockRejectedValueOnce(new TypeError('Fallo de red simulado'));
    mount();

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(warehouse.name)).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText('No se pudo conectar con el servidor')).toBeNull(),
    );
  });

  it.each(['COMPRAS', 'PRODUCCION', 'VENTAS'] as const)(
    '%s consulta sin ver acciones de modificación',
    async (role) => {
      const fetch = warehousesApi([
        warehouse,
        {
          ...warehouse,
          id: '00000000-0000-4000-8000-000000000002',
          code: 'ALM-SECUNDARIO',
          name: 'Almacén secundario',
          isActive: false,
        },
      ]);

      mount(role);
      await screen.findByText(warehouse.name);

      expect(screen.getByText('Almacén secundario')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Nuevo almacén' })).toBeNull();

      const table = within(screen.getByRole('table', { name: 'Almacenes' }));
      expect(
        table.queryAllByRole('button', { name: /^(Editar|Activar|Desactivar) / }),
      ).toHaveLength(0);
      expect(writes(fetch)).toHaveLength(0);
    },
  );
});
