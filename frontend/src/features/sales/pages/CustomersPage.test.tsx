import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode, SessionUser } from '@/features/auth/types';
import type { Customer } from '../types';
import CustomersPage from './CustomersPage';

const customer: Customer = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'CLI-SUPERNORTE',
  name: 'Supermercados del Norte S.A.',
  taxId: 'J0310000000001',
  email: 'compras@supernorte.com.ni',
  phone: '+505 2222-0000',
  address: 'Bello Horizonte, Managua',
  isActive: true,
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
};

const clients: ReturnType<typeof createAppQueryClient>[] = [];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Solo se simula HTTP: la página, los formularios y los hooks son los reales.
function customersApi(
  initial: Customer[] = [customer],
  failWrites?: { status: number; message: string },
) {
  let items = initial.map((item) => ({ ...item }));

  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const address = new URL(url);
    const method = options.method ?? 'GET';
    const base = '/api/customers';

    if (method !== 'GET' && failWrites) {
      return response({ message: failWrites.message }, failWrites.status);
    }

    if (method === 'GET' && address.pathname === base) {
      const page = Number(address.searchParams.get('page') ?? 1);
      const limit = Number(address.searchParams.get('limit') ?? 20);

      return response({
        data: items.slice((page - 1) * limit, page * limit),
        meta: { page, limit, total: items.length },
      });
    }

    if (method === 'POST' && address.pathname === base) {
      const data = JSON.parse(String(options.body)) as Partial<Customer>;
      const created = { ...customer, ...data, id: '00000000-0000-4000-8000-000000000099' };

      items = [...items, created];
      return response({ data: created, message: 'Cliente creado' }, 201);
    }

    const current = items.find((item) =>
      [base + '/' + item.id, base + '/' + item.id + '/status'].includes(address.pathname),
    );

    if (current && method === 'PATCH') {
      const changes = JSON.parse(String(options.body)) as Partial<Customer>;
      const updated = { ...current, ...changes };

      items = items.map((item) => (item.id === current.id ? updated : item));
      return response({ data: updated, message: 'Cliente actualizado' });
    }

    return response({ message: 'Ruta no simulada' }, 404);
  });

  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function writes(fetch: ReturnType<typeof customersApi>) {
  return fetch.mock.calls.filter(([, options]) =>
    ['POST', 'PATCH', 'DELETE'].includes(options?.method ?? 'GET'),
  );
}

function mount(role: RoleCode = 'VENTAS') {
  const client = createAppQueryClient();
  const user: SessionUser = {
    id: 'test-user',
    email: 'ventas@example.test',
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
      <CustomersPage />
    </QueryClientProvider>,
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const client of clients.splice(0)) client.clear();
});

describe('Clientes: interfaz de Ventas', () => {
  it('lista desde /api/customers con paginación y muestra los datos del cliente', async () => {
    const fetch = customersApi();
    mount();

    const table = within(await screen.findByRole('table', { name: 'Clientes' }));

    for (const text of [customer.code, customer.name, customer.email!, customer.phone!, 'Activo']) {
      expect(table.getByText(text)).toBeTruthy();
    }

    expect(String(fetch.mock.calls[0][0])).toBe(
      'http://localhost:3000/api/customers?page=1&limit=20',
    );
    expect(screen.getByText('Página 1 de 1 · 1 clientes')).toBeTruthy();
  });

  it('un rol sin permiso de gestión no ve acciones de modificación', async () => {
    customersApi();
    mount('COMPRAS');

    await screen.findByRole('table', { name: 'Clientes' });
    expect(screen.queryByRole('button', { name: 'Nuevo cliente' })).toBeNull();
    expect(screen.queryByRole('button', { name: `Editar ${customer.code}` })).toBeNull();
  });

  it('crea un cliente y envía null en los campos de contacto vacíos', async () => {
    const fetch = customersApi([]);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    fill('Código', 'CLI-CENTRAL');
    fill('Razón social', 'Distribuidora Central S.A.');
    fill('Correo (opcional)', 'pedidos@central.com.ni');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Cliente CLI-CENTRAL creado correctamente')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    const [url, options] = writes(fetch)[0];
    expect(url).toBe('http://localhost:3000/api/customers');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({
      code: 'CLI-CENTRAL',
      name: 'Distribuidora Central S.A.',
      taxId: null,
      email: 'pedidos@central.com.ni',
      phone: null,
      address: null,
    });
  });

  it('valida en el formulario sin llamar al backend', async () => {
    const fetch = customersApi([]);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    fill('Código', 'AB');
    fill('Correo (opcional)', 'no-es-correo');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El código debe tener al menos 3 caracteres')).toBeTruthy();
    expect(screen.getByText('La razón social debe tener al menos 3 caracteres')).toBeTruthy();
    expect(screen.getByText('Debe ser un correo electrónico válido')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(0);
  });

  it('edita solo los campos modificados y vaciar uno lo envía como null', async () => {
    const fetch = customersApi();
    mount();

    fireEvent.click(await screen.findByRole('button', { name: `Editar ${customer.code}` }));

    const save = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fill('Teléfono (opcional)', '+505 8888-0000');
    fill('Dirección (opcional)', '');
    fireEvent.click(save);

    expect(
      await screen.findByText(`Cliente ${customer.code} actualizado correctamente`),
    ).toBeTruthy();

    const [url, options] = writes(fetch)[0];
    expect(url).toBe(`http://localhost:3000/api/customers/${customer.id}`);
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({ phone: '+505 8888-0000', address: null });
  });

  it('pide confirmación antes de desactivar y envía un booleano', async () => {
    const fetch = customersApi();
    mount();

    fireEvent.click(await screen.findByRole('button', { name: `Desactivar ${customer.code}` }));
    expect(writes(fetch)).toHaveLength(0);

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Cliente desactivado')).toBeTruthy();
    const [url, options] = writes(fetch)[0];
    expect(url).toBe(`http://localhost:3000/api/customers/${customer.id}/status`);
    expect(JSON.parse(String(options?.body))).toEqual({ isActive: false });
  });

  it('muestra el error del backend y mantiene el diálogo abierto', async () => {
    customersApi([], { status: 409, message: 'Ya existe un cliente con ese código' });
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    fill('Código', 'CLI-SUPERNORTE');
    fill('Razón social', 'Otra empresa S.A.');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ya existe un cliente con ese código')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });
});
