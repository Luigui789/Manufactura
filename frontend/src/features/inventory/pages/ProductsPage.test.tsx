import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode, SessionUser } from '@/features/auth/types';
import type { CreateProductData, Product } from '../types';
import { ProductsPage } from './ProductsPage';

const product: Product = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'MP-ACEITE-01',
  name: 'Aceite usado recolectado',
  category: 'Aceites',
  type: 'RAW_MATERIAL',
  unit: 'LITER',
  isActive: true,
  isLotTracked: false,
  requiresQualityInspection: false,
  createdAt: '2026-10-07T12:00:00.000Z',
  updatedAt: '2026-10-07T12:00:00.000Z',
};

const newData: CreateProductData = {
  code: 'PT-JABON-500G',
  name: 'Jabón ecológico 500 g',
  category: 'Jabones',
  type: 'FINISHED_GOOD',
  unit: 'UNIT',
};

const clients: ReturnType<typeof createAppQueryClient>[] = [];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Solo se simula HTTP: la página, los formularios y los hooks son los reales.
function productsApi(initial: Product[] = [product]) {
  let items = initial.map((item) => ({ ...item }));

  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const address = new URL(url);
    const method = options.method ?? 'GET';
    const base = '/api/products';

    if (method === 'GET' && address.pathname === base) {
      const page = Number(address.searchParams.get('page') ?? 1);
      const limit = Number(address.searchParams.get('limit') ?? 20);

      return response({
        data: items.slice((page - 1) * limit, page * limit),
        meta: { page, limit, total: items.length },
      });
    }

    if (method === 'POST' && address.pathname === base) {
      const data = JSON.parse(String(options.body)) as CreateProductData;
      const created = {
        ...product,
        ...data,
        id: '00000000-0000-4000-8000-000000000099',
      };

      items = [...items, created];
      return response({ data: created, message: 'Producto creado' }, 201);
    }

    const current = items.find((item) =>
      [base + '/' + item.id, base + '/' + item.id + '/status'].includes(address.pathname),
    );

    if (current && method === 'GET') {
      return response({ data: current, message: 'Producto encontrado' });
    }

    if (current && method === 'PATCH') {
      const changes = JSON.parse(String(options.body)) as Partial<Product>;
      const updated = { ...current, ...changes };

      items = items.map((item) => (item.id === current.id ? updated : item));
      return response({ data: updated, message: 'Producto actualizado' });
    }

    return response({ message: 'Ruta no simulada' }, 404);
  });

  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function writes(fetch: ReturnType<typeof productsApi>) {
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
      <ProductsPage />
    </QueryClientProvider>,
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillProduct(data: CreateProductData = newData) {
  fill('Código', data.code);
  fill('Nombre', data.name);
  fill('Categoría', data.category);
  fill('Tipo de producto', data.type);
  fill('Unidad de medida', data.unit);
}

async function openCreate() {
  await screen.findByRole('table', { name: 'Productos' });
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe('Productos: interfaz de Inventario', () => {
  it('muestra los seis atributos y el estado del producto', async () => {
    productsApi();
    mount();

    const table = within(await screen.findByRole('table', { name: 'Productos' }));

    for (const text of [
      product.code,
      product.name,
      product.category,
      'Litro',
      'Materia prima',
      'Activo',
    ]) {
      expect(table.getByText(text)).toBeTruthy();
    }

    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('informa cuando no hay productos', async () => {
    productsApi([]);
    mount();

    expect(await screen.findByText('No hay productos en esta página.')).toBeTruthy();
  });

  it('muestra carga mientras espera al servidor', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    mount();

    expect(screen.getByRole('status').textContent).toBe('Cargando productos…');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('consulta la página siguiente en el servidor', async () => {
    const items = Array.from({ length: 21 }, (_, index) => ({
      ...product,
      id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
      code: 'MP-' + String(index + 1),
      name: 'Producto ' + String(index + 1),
    }));

    const fetch = productsApi(items);
    mount();
    await screen.findByText('Producto 1');

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Producto 21')).toBeTruthy();
    expect(screen.queryByText('Producto 1')).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/products?page=2&limit=20'))).toBe(true);
    expect(screen.getByText('Página 2 de 2 · 21 productos')).toBeTruthy();
  });

  it.each(['ADMIN', 'INVENTARIO'] as const)('%s crea y actualiza el listado', async (role) => {
    const fetch = productsApi();
    mount(role);
    await openCreate();
    fillProduct();

    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(await screen.findByText('Producto PT-JABON-500G creado correctamente')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(newData.name)).toBeTruthy();
    expect(writes(fetch)).toHaveLength(1);

    const [url, options] = writes(fetch)[0];
    expect(url).toBe('http://localhost:3000/api/products');
    expect(options).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(options?.body))).toEqual(newData);
  });

  it('rechaza campos vacíos y nombres demasiado largos sin enviar el formulario', async () => {
    const fetch = productsApi();
    mount();
    await openCreate();

    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(await screen.findByText('El código es obligatorio')).toBeTruthy();
    expect(screen.getByText('El nombre es obligatorio')).toBeTruthy();
    expect(screen.getByText('La categoría es obligatoria')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(0);

    fillProduct({ ...newData, name: 'X'.repeat(201) });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(await screen.findByText('El nombre admite hasta 200 caracteres')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(0);
  });

  it('edita los cinco campos y admite nombres de más de 100 caracteres', async () => {
    const fetch = productsApi();
    mount();
    await screen.findByText(product.name);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect((screen.getByLabelText('Código') as HTMLInputElement).value).toBe(product.code);

    const changes: CreateProductData = {
      ...newData,
      name: 'J'.repeat(150),
      unit: 'GRAM',
    };

    fillProduct(changes);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('Producto PT-JABON-500G actualizado correctamente'),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(changes.name)).toBeTruthy();
    expect(writes(fetch)).toHaveLength(1);

    const [url, options] = writes(fetch)[0];
    expect(url).toBe('http://localhost:3000/api/products/' + product.id);
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual(changes);
  });

  it('consulta el detalle al pulsar Ver', async () => {
    const fetch = productsApi();
    mount();
    await screen.findByText(product.name);

    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Detalle del producto' }));

    expect(await dialog.findByText(product.name)).toBeTruthy();
    expect(dialog.getByText(product.code)).toBeTruthy();
    expect(dialog.getByText('Activo')).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/products/' + product.id))).toBe(true);

    fireEvent.click(dialog.getByText('Cerrar', { selector: 'button' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([true, false])(
    'confirma el cambio de estado partiendo de isActive=%s',
    async (isActive) => {
      const fetch = productsApi([{ ...product, isActive }]);
      mount();
      await screen.findByText(product.name);

      const action = isActive ? 'Desactivar' : 'Activar';

      fireEvent.click(screen.getByRole('button', { name: action }));
      expect(writes(fetch)).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(writes(fetch)).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: action }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      const result = isActive ? 'desactivado' : 'activado';
      expect(await screen.findByText('Producto ' + product.code + ' ' + result)).toBeTruthy();
      expect(writes(fetch)).toHaveLength(1);

      const [url, options] = writes(fetch)[0];
      expect(url).toBe('http://localhost:3000/api/products/' + product.id + '/status');
      expect(options?.method).toBe('PATCH');
      expect(JSON.parse(String(options?.body))).toEqual({ isActive: !isActive });

      const table = within(screen.getByRole('table', { name: 'Productos' }));
      expect(table.getByText(isActive ? 'Inactivo' : 'Activo')).toBeTruthy();
      expect(table.getByText(product.name)).toBeTruthy();
    },
  );

  it('muestra un conflicto de creación y conserva el formulario', async () => {
    const fetch = productsApi();
    mount();
    await openCreate();
    fillProduct();

    fetch.mockResolvedValueOnce(response({ message: 'Ya existe un producto con ese código' }, 409));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(await screen.findByText('Ya existe un producto con ese código')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(newData.name);
    expect(writes(fetch)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(newData.name)).toBeNull();
  });

  it('permite reintentar cuando falla la conexión del listado', async () => {
    const fetch = productsApi();
    fetch.mockRejectedValueOnce(new TypeError('Fallo de red simulado'));
    mount();

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(product.name)).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText('No se pudo conectar con el servidor')).toBeNull(),
    );
  });

  it.each(['COMPRAS', 'PRODUCCION', 'VENTAS'] as const)(
    '%s consulta sin ver acciones de modificación',
    async (role) => {
      const fetch = productsApi();
      mount(role);
      await screen.findByText(product.name);

      for (const name of ['Nuevo producto', 'Editar', 'Activar', 'Desactivar']) {
        expect(screen.queryByRole('button', { name })).toBeNull();
      }

      fireEvent.click(screen.getByRole('button', { name: 'Ver' }));

      const dialog = within(await screen.findByRole('dialog', { name: 'Detalle del producto' }));
      expect(await dialog.findByText(product.name)).toBeTruthy();
      expect(writes(fetch)).toHaveLength(0);
    },
  );
});
