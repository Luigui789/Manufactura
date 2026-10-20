import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { RoleCode, SessionUser } from '@/features/auth/types';
import type { Product } from '@/features/inventory/types';
import type { Bom, BomVersion } from '../api/boms';
import { BomsPage } from './BomsPage';
import { BomDetailPage } from './BomDetailPage';

const output: Product = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'JABON',
  name: 'Jabón',
  category: 'Jabones',
  type: 'FINISHED_GOOD',
  unit: 'UNIT',
  isActive: true,
  isLotTracked: true,
  requiresQualityInspection: false,
  createdAt: '',
  updatedAt: '',
};
const component: Product = {
  ...output,
  id: '00000000-0000-4000-8000-000000000002',
  code: 'ACEITE',
  name: 'Aceite',
  type: 'RAW_MATERIAL',
  unit: 'GRAM',
};
const version: BomVersion = {
  id: '00000000-0000-4000-8000-000000000004',
  bomId: '00000000-0000-4000-8000-000000000003',
  version: 1,
  isActive: true,
  outputQuantity: '1.0000',
  createdByUserId: 'actor',
  createdAt: '',
  items: [
    {
      id: 'item',
      componentProductId: component.id,
      quantity: '500.0000',
      componentProduct: component,
    },
  ],
};
const clients: ReturnType<typeof createAppQueryClient>[] = [];
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(role: RoleCode, { empty = false, detail = false } = {}) {
  const bom: Bom = {
    id: version.bomId,
    productId: output.id,
    product: output,
    name: 'Fórmula jabón',
    isActive: true,
    createdAt: '',
    updatedAt: '',
    versions: empty ? [] : [structuredClone(version)],
  };
  const client = createAppQueryClient();
  const user: SessionUser = {
    id: 'actor',
    email: 'production@example.test',
    fullName: 'Producción',
    role,
    isActive: true,
    mustChangePassword: false,
    createdAt: '',
    updatedAt: '',
  };
  client.setQueryData(SESSION_KEY, user);
  clients.push(client);
  let exists = !empty;
  const base = '/api/production/boms';
  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const method = options.method ?? 'GET';
    if (path === '/api/products') {
      const type = new URL(url).searchParams.get('type');
      const products = [output, component].filter((p) => p.type === type);
      return response({ data: products, meta: { page: 1, limit: 20, total: products.length } });
    }
    if (path === base && method === 'GET')
      return response({
        data: exists ? [bom] : [],
        meta: { page: 1, limit: 20, total: exists ? 1 : 0 },
      });
    if (path === base && method === 'POST') {
      const value = JSON.parse(String(options.body)) as { name: string; productId: string };
      bom.name = value.name;
      exists = true;
      return response({ data: bom, message: 'Creada' }, 201);
    }
    if (path === base + '/' + bom.id && method === 'GET')
      return response({ data: bom, message: 'Encontrada' });
    if (path === base + '/' + bom.id + '/versions' && method === 'POST') {
      const value = JSON.parse(String(options.body)) as {
        outputQuantity: string;
        items: { productId: string; quantity: string }[];
      };
      const created = {
        ...version,
        version: bom.versions.length + 1,
        outputQuantity: value.outputQuantity,
        items: value.items.map((item) => ({
          id: 'item',
          componentProductId: item.productId,
          componentProduct: component,
          quantity: item.quantity,
        })),
      };
      bom.versions = [created, ...bom.versions];
      return response({ data: created, message: 'Creada' }, 201);
    }
    if (path.endsWith('/calculate')) {
      const value = JSON.parse(String(options.body)) as { quantityPlanned: string };
      return response(
        {
          data: {
            bomId: bom.id,
            bomVersionId: version.id,
            version: 1,
            product: output,
            outputQuantity: '1.0000',
            quantityPlanned: value.quantityPlanned,
            items: [
              {
                productId: component.id,
                code: component.code,
                name: component.name,
                unit: component.unit,
                quantity: '500.0000',
                requiredQuantity: '50000.0000',
              },
            ],
          },
          message: 'Calculado',
        },
        201,
      );
    }
    return response({ message: 'Ruta no simulada' }, 404);
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[detail ? '/production/boms/' + bom.id : '/production/boms']}>
        <Routes>
          <Route path="/production/boms" element={<BomsPage />} />
          <Route path="/production/boms/:id" element={<BomDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, bom, fetch };
}
beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'));
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
describe('Producción: fórmulas y versiones', () => {
  it('permite consulta y cálculo para VENTAS sin mostrar controles de edición', async () => {
    const { fetch } = setup('VENTAS');
    fireEvent.click(await screen.findByRole('link', { name: 'Fórmula jabón' }));
    await screen.findByRole('heading', { name: 'Fórmula jabón' });
    expect(screen.queryByRole('button', { name: 'Nueva fórmula' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nueva versión' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar nombre' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    await screen.findByText(/50000.0000/);
    const call = fetch.mock.calls.find(([url]) => url.endsWith('/calculate'))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ quantityPlanned: '100' });
  });
  it('crea fórmula y versión con cantidades string usando los formularios reales', async () => {
    const { fetch } = setup('PRODUCCION', { empty: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva fórmula' }));
    const create = within(screen.getByRole('dialog', { name: 'Nueva fórmula' }));
    fireEvent.change(create.getByLabelText('Nombre de la fórmula'), {
      target: { value: 'Fórmula nueva' },
    });
    fireEvent.click(await create.findByRole('button', { name: /Seleccionar JABON · Jabón/ }));
    fireEvent.click(create.getByRole('button', { name: 'Crear fórmula' }));
    await screen.findByText('Fórmula nueva', { selector: 'h1' });
    fireEvent.click(screen.getByRole('button', { name: 'Nueva versión' }));
    const createVersion = within(screen.getByRole('dialog', { name: 'Nueva versión' }));
    fireEvent.click(
      await createVersion.findByRole('button', { name: /Seleccionar ACEITE · Aceite/ }),
    );
    fireEvent.change(createVersion.getByLabelText('Cantidad del componente 1'), {
      target: { value: '500.1234' },
    });
    fireEvent.click(createVersion.getByRole('button', { name: 'Guardar versión' }));
    await screen.findByText(/500.1234/);
    const call = fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/versions') && options?.method === 'POST',
    )!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      outputQuantity: '1',
      items: [{ productId: component.id, quantity: '500.1234' }],
    });
  });
  it('impide enviar decimales inválidos y conserva los campos del formulario', async () => {
    const { fetch } = setup('ADMIN', { detail: true });
    await screen.findByRole('heading', { name: 'Fórmula jabón' });
    fireEvent.change(screen.getByLabelText(/Cantidad a fabricar/), {
      target: { value: '0.00001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    await screen.findByText('Usa hasta 14 enteros y 4 decimales');
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/calculate'))).toHaveLength(0);
    expect((screen.getByLabelText(/Cantidad a fabricar/) as HTMLInputElement).value).toBe(
      '0.00001',
    );
  });
  it('oculta cálculo obsoleto si un refetch cambia la versión activa automáticamente', async () => {
    const { client, bom } = setup('PRODUCCION', { detail: true });
    await screen.findByRole('heading', { name: 'Fórmula jabón' });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    await screen.findByText(/50000.0000/);
    bom.versions = [
      { ...version, id: '00000000-0000-4000-8000-000000000005', version: 2, isActive: true },
      { ...version, isActive: false },
    ];
    await client.invalidateQueries({ queryKey: ['boms'] });
    await waitFor(() => expect(screen.queryByText(/50000.0000/)).toBeNull());
    expect(
      screen.getByRole('button', { name: 'Versión 2 · Activa' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
  it('preserva componentes escritos si otra sesión desactiva la fórmula', async () => {
    const { client, bom } = setup('PRODUCCION', { detail: true });
    await screen.findByRole('heading', { name: 'Fórmula jabón' });
    const deactivate = screen.getByRole('button', {
      name: 'Desactivar fórmula',
    }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole('button', { name: 'Nueva versión' }));
    fireEvent.change(screen.getByLabelText('Cantidad del componente 1'), {
      target: { value: '123.4567' },
    });
    expect(deactivate.disabled).toBe(true);
    bom.isActive = false;
    await client.invalidateQueries({ queryKey: ['boms'] });
    await screen.findByText('La fórmula fue desactivada. Tu borrador se conserva.');
    expect((screen.getByLabelText('Cantidad del componente 1') as HTMLInputElement).value).toBe(
      '123.4567',
    );
    expect(
      (screen.getByRole('button', { name: 'Guardar versión' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('separa resultados y selección, permite cambiar y cancela el alta sin modificar datos', async () => {
    const { fetch } = setup('PRODUCCION');
    await screen.findByRole('link', { name: 'Fórmula jabón' });
    expect(screen.queryByRole('button', { name: 'Anterior' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nueva fórmula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva fórmula' });
    const form = within(dialog);
    expect(
      await form.findByRole('table', { name: 'Resultados de producto de salida' }),
    ).toBeTruthy();
    expect(form.queryByText('Producto seleccionado')).toBeNull();
    expect(form.queryByRole('button', { name: 'Anterior' })).toBeNull();
    expect(form.queryByRole('button', { name: 'Siguiente' })).toBeNull();

    fireEvent.click(form.getByRole('button', { name: /Seleccionar JABON · Jabón/ }));
    expect(form.getByText('Producto seleccionado')).toBeTruthy();
    expect(form.queryByRole('table', { name: 'Resultados de producto de salida' })).toBeNull();
    fireEvent.click(form.getByRole('button', { name: 'Cambiar' }));
    expect(form.getByRole('table', { name: 'Resultados de producto de salida' })).toBeTruthy();
    fireEvent.click(form.getByRole('button', { name: 'Conservar selección' }));
    expect(form.getByText('JABON · Jabón')).toBeTruthy();
    expect(form.queryByRole('table', { name: 'Resultados de producto de salida' })).toBeNull();

    fireEvent.click(form.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET'),
    ).toBe(true);
  });
});
