import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import type { SessionUser } from '@/features/auth/types';
import type { ManufacturingStructure, StructureNode } from '../api/structure';
import { ManufacturingStructurePage } from './ManufacturingStructurePage';

const SOAP = '00000000-0000-4000-8000-000000000001';
const OIL = '00000000-0000-4000-8000-000000000002';
const product = (id: string, code: string, name: string, type: string, unit: string) =>
  ({ id, code, name, type, unit, isActive: true }) as StructureNode['product'];

const filtered: StructureNode = {
  product: product(OIL, 'INT-OIL-FILTERED', 'Aceite usado filtrado', 'INTERMEDIATE', 'MILLILITER'),
  bom: {
    id: 'bom-oil',
    name: 'BOM Aceite filtrado',
    isActive: true,
    activeVersion: { id: 'v-oil', version: 1, outputQuantity: '1000.0000' },
  },
  route: {
    id: 'route-oil',
    code: 'RT-FILTRADO',
    name: 'Ruta filtrado',
    isActive: true,
    operationCount: 1,
    totalStandardMinutes: '30.00',
    operations: [
      { id: 'o1', sequence: 10, name: 'Filtración', description: null, standardMinutes: '30.00' },
    ],
  },
  routeStatus: 'ACTIVE',
  components: [
    {
      product: product('raw', 'MP-OIL-USED', 'Aceite usado recibido', 'RAW_MATERIAL', 'MILLILITER'),
      quantity: '1000.0000',
      unit: 'MILLILITER',
      type: 'RAW_MATERIAL',
      isManufactured: false,
      child: null,
    },
  ],
  issues: [],
  readiness: 'READY',
};

const ready: ManufacturingStructure = {
  product: product(SOAP, 'PT-JABON-500', 'Jabón ecológico 500 g', 'FINISHED_GOOD', 'UNIT'),
  bom: {
    id: 'bom-soap',
    name: 'BOM Jabón 500 g',
    isActive: true,
    activeVersion: { id: 'v-soap', version: 1, outputQuantity: '1.0000' },
  },
  route: {
    id: 'route-soap',
    code: 'RT-JABON-500',
    name: 'Ruta Jabón 500 g',
    isActive: true,
    operationCount: 3,
    totalStandardMinutes: '21625.00',
    // Desordenadas a propósito: la vista las muestra por secuencia.
    operations: [
      { id: 'c', sequence: 30, name: 'Curado', description: null, standardMinutes: '21600.00' },
      { id: 'a', sequence: 10, name: 'Mezclado', description: null, standardMinutes: '15.00' },
      { id: 'b', sequence: 20, name: 'Moldeado', description: null, standardMinutes: '10.00' },
    ],
  },
  routeStatus: 'ACTIVE',
  components: [
    {
      product: filtered.product,
      quantity: '500.0000',
      unit: 'MILLILITER',
      type: 'INTERMEDIATE',
      isManufactured: true,
      child: filtered,
    },
    {
      product: product('naoh', 'MP-NAOH', 'Soda cáustica', 'RAW_MATERIAL', 'GRAM'),
      quantity: '70.0000',
      unit: 'GRAM',
      type: 'RAW_MATERIAL',
      isManufactured: false,
      child: null,
    },
    {
      product: product('box', 'CO-CAJA', 'Caja', 'CONSUMABLE', 'UNIT'),
      quantity: '1.0000',
      unit: 'UNIT',
      type: 'CONSUMABLE',
      isManufactured: false,
      child: null,
    },
  ],
  issues: [],
  readiness: 'READY',
  maxDepth: 2,
};

const incomplete: ManufacturingStructure = {
  ...ready,
  route: { ...ready.route!, isActive: false },
  routeStatus: 'INACTIVE',
  issues: [{ code: 'ROUTE_INACTIVE', message: 'La ruta de producción está inactiva' }],
  readiness: 'INCOMPLETE',
  components: [
    {
      ...ready.components[0],
      child: {
        ...filtered,
        bom: null,
        route: null,
        routeStatus: 'MISSING',
        components: [],
        issues: [
          { code: 'MISSING_BOM', message: 'El producto no tiene fórmula de producción' },
          { code: 'MISSING_ROUTE', message: 'El producto no tiene ruta de producción' },
        ],
        readiness: 'INCOMPLETE',
      },
    },
    ...ready.components.slice(1),
  ],
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const clients: ReturnType<typeof createAppQueryClient>[] = [];

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function mount(path: string, handler: (url: string) => Promise<Response>) {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  const client = createAppQueryClient();
  clients.push(client);
  client.setQueryData(SESSION_KEY, {
    id: 'actor',
    role: 'VENTAS',
    mustChangePassword: false,
  } as SessionUser);
  const fetch = vi.fn(handler);
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/production/structure" element={<ManufacturingStructurePage />} />
          <Route path="/production/structure/:productId" element={<ManufacturingStructurePage />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetch;
}

afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

describe('Estructura de manufactura', () => {
  it('landing: el selector solo ofrece productos fabricados y navega al elegir', async () => {
    const fetch = mount('/production/structure', async () =>
      json({
        data: [{ ...ready.product, category: 'Jabón', isLotTracked: true }],
        meta: { page: 1, limit: 20, total: 1 },
      }),
    );
    expect(screen.getByRole('heading', { name: 'Estructura de manufactura' })).toBeTruthy();
    const options = within(screen.getByLabelText('Tipo de producto')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Producto terminado',
      'Producto intermedio',
    ]);
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) => url.includes('type=FINISHED_GOOD') && url.includes('isActive=true'),
        ),
      ).toBe(true),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Seleccionar PT-JABON-500 · Jabón ecológico/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/production/structure/' + SOAP),
    );
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/manufacturing-structure/' + SOAP))).toBe(
      true,
    );
  });

  it('muestra el estado de carga', () => {
    mount('/production/structure/' + SOAP, () => new Promise(() => {}));
    expect(screen.getByText('Cargando estructura…')).toBeTruthy();
  });

  it('muestra el error de la API y permite reintentar', async () => {
    const fetch = mount('/production/structure/' + SOAP, async () =>
      json(
        {
          statusCode: 422,
          code: 'INVALID_MANUFACTURING_STRUCTURE_ROOT',
          message: 'La estructura solo existe para productos intermedios o terminados',
        },
        422,
      ),
    );
    expect(
      await screen.findByText('La estructura solo existe para productos intermedios o terminados'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('link', { name: 'Elegir otro producto' })).toBeTruthy();
  });

  it('árbol READY: terminado → intermedio expandido → materia prima y consumible como hojas', async () => {
    mount('/production/structure/' + SOAP, async () => json({ data: ready }));
    expect(
      await screen.findByRole('heading', { name: 'Estructura de Jabón ecológico 500 g' }),
    ).toBeTruthy();
    const root = screen.getByRole('article', { name: 'Estructura de PT-JABON-500' });
    expect(within(root).getAllByText('Listo').length).toBeGreaterThan(0);
    expect(within(root).getByText('BOM Jabón 500 g · v1 · 1.0000 Unidad')).toBeTruthy();
    expect(within(root).getByText(/Ruta Jabón 500 g · 3 operaciones/)).toBeTruthy();
    expect(screen.getByText(/2 niveles de componentes/)).toBeTruthy();

    const components = within(root).getByRole('list', { name: 'Componentes de PT-JABON-500' });
    const intermediate = within(components).getByRole('article', {
      name: 'Estructura de INT-OIL-FILTERED',
    });
    expect(within(intermediate).getByText('Producto intermedio')).toBeTruthy();
    expect(
      within(intermediate).getByText('BOM Aceite filtrado · v1 · 1000.0000 Mililitro'),
    ).toBeTruthy();
    expect(within(intermediate).getByText(/Ruta filtrado · 1 operación/)).toBeTruthy();
    expect(
      within(intermediate).getByText('Aceite usado recibido — 1000.0000 Mililitro'),
    ).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Estructura de MP-OIL-USED' })).toBeNull();
    expect(screen.getByText('Soda cáustica — 70.0000 Gramo')).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Estructura de MP-NAOH' })).toBeNull();
    expect(screen.getByText('Caja — 1.0000 Unidad')).toBeTruthy();
    expect(screen.getByText(/CO-CAJA · Consumible/)).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Estructura de CO-CAJA' })).toBeNull();
  });

  it('ordena las operaciones de la ruta por secuencia', async () => {
    mount('/production/structure/' + SOAP, async () => json({ data: ready }));
    const list = await screen.findByRole('list', { name: 'Operaciones de PT-JABON-500' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('10 · Mezclado'),
      expect.stringContaining('20 · Moldeado'),
      expect.stringContaining('30 · Curado'),
    ]);
  });

  it('enlaza a la fórmula y a la ruta de cada nivel fabricado', async () => {
    mount('/production/structure/' + SOAP, async () => json({ data: ready }));
    await screen.findByRole('article', { name: 'Estructura de PT-JABON-500' });
    expect(
      screen.getAllByRole('link', { name: 'Ver BOM' }).map((link) => link.getAttribute('href')),
    ).toEqual(['/production/boms/bom-soap', '/production/boms/bom-oil']);
    expect(
      screen.getAllByRole('link', { name: 'Ver ruta' }).map((link) => link.getAttribute('href')),
    ).toEqual(['/production/routes/route-soap', '/production/routes/route-oil']);
  });

  it('INCOMPLETE: muestra avisos MISSING_BOM, MISSING_ROUTE y ROUTE_INACTIVE', async () => {
    mount('/production/structure/' + SOAP, async () => json({ data: incomplete }));
    const root = await screen.findByRole('article', { name: 'Estructura de PT-JABON-500' });
    expect(within(root).getAllByText('Incompleto').length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('list', { name: 'Pendientes de PT-JABON-500' })).getByText(
        'Ruta inactiva',
      ),
    ).toBeTruthy();
    const pending = screen.getByRole('list', { name: 'Pendientes de INT-OIL-FILTERED' });
    expect(within(pending).getByText('Falta fórmula (BOM)')).toBeTruthy();
    expect(within(pending).getByText('Falta ruta')).toBeTruthy();
    expect(screen.getByText(/configuración pendiente/)).toBeTruthy();
    // Sin fórmula ni ruta no se ofrecen enlaces para ese nivel.
    expect(screen.getAllByRole('link', { name: 'Ver BOM' })).toHaveLength(1);
  });

  it('se adapta a pantallas estrechas sin anchos fijos', async () => {
    mount('/production/structure/' + SOAP, async () => json({ data: ready }));
    const root = await screen.findByRole('article', { name: 'Estructura de PT-JABON-500' });
    expect(root.className).toContain('min-w-0');
    const components = within(root).getByRole('list', { name: 'Componentes de PT-JABON-500' });
    expect(components.className).toContain('pl-3');
    expect(components.className).toContain('sm:pl-5');
  });
});
