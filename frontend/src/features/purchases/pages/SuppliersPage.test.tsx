import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode, SessionUser } from '@/features/auth/types';
import type { Supplier } from '../types';
import SuppliersPage from './SuppliersPage';

const supplier: Supplier = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'PROV-ACEITES',
  name: 'Recicladora del Pacífico S.A.',
  taxId: 'J0310000000001',
  email: 'compras@recicladora.com.ni',
  phone: '+505 2222-0000',
  address: 'Km 7 Carretera Norte, Managua',
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
function suppliersApi(
  initial: Supplier[] = [supplier],
  failWrites?: { status: number; message: string },
) {
  let items = initial.map((item) => ({ ...item }));

  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const address = new URL(url);
    const method = options.method ?? 'GET';
    const base = '/api/suppliers';

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
      const data = JSON.parse(String(options.body)) as Partial<Supplier>;
      const created = { ...supplier, ...data, id: '00000000-0000-4000-8000-000000000099' };

      items = [...items, created];
      return response({ data: created, message: 'Proveedor creado' }, 201);
    }

    const current = items.find((item) =>
      [base + '/' + item.id, base + '/' + item.id + '/status'].includes(address.pathname),
    );

    if (current && method === 'PATCH') {
      const changes = JSON.parse(String(options.body)) as Partial<Supplier>;
      const updated = { ...current, ...changes };

      items = items.map((item) => (item.id === current.id ? updated : item));
      return response({ data: updated, message: 'Proveedor actualizado' });
    }

    return response({ message: 'Ruta no simulada' }, 404);
  });

  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function writes(fetch: ReturnType<typeof suppliersApi>) {
  return fetch.mock.calls.filter(([, options]) =>
    ['POST', 'PATCH', 'DELETE'].includes(options?.method ?? 'GET'),
  );
}

function mount(role: RoleCode = 'COMPRAS') {
  const client = createAppQueryClient();
  const user: SessionUser = {
    id: 'test-user',
    email: 'compras@example.test',
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
      <SuppliersPage />
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

describe('Proveedores: interfaz de Compras', () => {
  it('lista desde /api/suppliers con paginación y muestra los datos del proveedor', async () => {
    const fetch = suppliersApi();
    mount();

    const table = within(await screen.findByRole('table', { name: 'Proveedores' }));

    for (const text of [supplier.code, supplier.name, supplier.email!, supplier.phone!, 'Activo']) {
      expect(table.getByText(text)).toBeTruthy();
    }

    expect(String(fetch.mock.calls[0][0])).toBe(
      'http://localhost:3000/api/suppliers?page=1&limit=20',
    );
    expect(screen.getByText('Página 1 de 1 · 1 proveedores')).toBeTruthy();
  });

  it('un rol sin permiso de gestión no ve acciones de modificación', async () => {
    suppliersApi();
    mount('VENTAS');

    await screen.findByRole('table', { name: 'Proveedores' });
    expect(screen.queryByRole('button', { name: 'Nuevo proveedor' })).toBeNull();
    expect(screen.queryByRole('button', { name: `Editar ${supplier.code}` })).toBeNull();
  });

  it('crea un proveedor y envía null en los campos de contacto vacíos', async () => {
    const fetch = suppliersApi([]);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo proveedor' }));
    fill('Código', 'PROV-SODA');
    fill('Razón social', 'Químicos Industriales S.A.');
    fill('Correo (opcional)', 'ventas@quimicos.com.ni');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Proveedor PROV-SODA creado correctamente')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    const [url, options] = writes(fetch)[0];
    expect(url).toBe('http://localhost:3000/api/suppliers');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({
      code: 'PROV-SODA',
      name: 'Químicos Industriales S.A.',
      taxId: null,
      email: 'ventas@quimicos.com.ni',
      phone: null,
      address: null,
    });
  });

  it('valida en el formulario sin llamar al backend', async () => {
    const fetch = suppliersApi([]);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo proveedor' }));
    fill('Código', 'AB');
    fill('Correo (opcional)', 'no-es-correo');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El código debe tener al menos 3 caracteres')).toBeTruthy();
    expect(screen.getByText('La razón social debe tener al menos 3 caracteres')).toBeTruthy();
    expect(screen.getByText('Debe ser un correo electrónico válido')).toBeTruthy();
    expect(writes(fetch)).toHaveLength(0);
  });

  it('edita solo los campos modificados y vaciar uno lo envía como null', async () => {
    const fetch = suppliersApi();
    mount();

    fireEvent.click(await screen.findByRole('button', { name: `Editar ${supplier.code}` }));

    const save = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fill('Teléfono (opcional)', '+505 8888-0000');
    fill('Dirección (opcional)', '');
    fireEvent.click(save);

    expect(
      await screen.findByText(`Proveedor ${supplier.code} actualizado correctamente`),
    ).toBeTruthy();

    const [url, options] = writes(fetch)[0];
    expect(url).toBe(`http://localhost:3000/api/suppliers/${supplier.id}`);
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({ phone: '+505 8888-0000', address: null });
  });

  it('pide confirmación antes de desactivar y envía un booleano', async () => {
    const fetch = suppliersApi();
    mount();

    fireEvent.click(await screen.findByRole('button', { name: `Desactivar ${supplier.code}` }));
    expect(writes(fetch)).toHaveLength(0);

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Proveedor desactivado')).toBeTruthy();
    const [url, options] = writes(fetch)[0];
    expect(url).toBe(`http://localhost:3000/api/suppliers/${supplier.id}/status`);
    expect(JSON.parse(String(options?.body))).toEqual({ isActive: false });
  });

  it('muestra el error del backend y mantiene el diálogo abierto', async () => {
    suppliersApi([], { status: 409, message: 'Ya existe un proveedor con ese código' });
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo proveedor' }));
    fill('Código', 'PROV-ACEITES');
    fill('Razón social', 'Otra empresa S.A.');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ya existe un proveedor con ese código')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });
});
