import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { navigation } from '@/layouts/navigation';
import type {
  CarbonActivity,
  EmissionFactor,
  Footprint,
  OrderSummary,
  SustainabilityOrder,
} from './api/sustainability';
import { CARBON_DISCLAIMER } from './components/CarbonDisclaimer';
import { trimDecimal } from './labels';
import { CircularMaterialsPage } from './pages/CircularMaterialsPage';
import { EmissionFactorsPage } from './pages/EmissionFactorsPage';
import { FootprintDetailPage } from './pages/FootprintDetailPage';
import { SustainabilityPage } from './pages/SustainabilityPage';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const product = { id: 'pt', code: 'PT-JABON', name: 'Jabón ecológico', unit: 'UNIT' as const };
const energyFactor: EmissionFactor = {
  id: 'f-energy',
  code: 'TEST-ELECTRICITY',
  name: 'Electricidad TEST',
  category: 'ENERGY',
  activityUnit: 'KWH',
  kgCo2ePerUnit: '0.50000000',
  productId: null,
  product: null,
  sourceName: 'TEST_FIXTURE',
  sourceReference: 'Tabla TEST 1',
  sourceYear: 2024,
  notes: null,
  isActive: true,
  createdBy: { id: 'admin', fullName: 'Admin' },
  createdAt: '2026-10-31T00:00:00Z',
  updatedAt: '2026-10-31T00:00:00Z',
};
const sodaFactor: EmissionFactor = {
  ...energyFactor,
  id: 'f-soda',
  code: 'TEST-RAW-001',
  name: 'Soda TEST',
  category: 'RAW_MATERIAL',
  activityUnit: 'KILOGRAM',
  kgCo2ePerUnit: '2.10000000',
  productId: 'soda',
  product: { id: 'soda', code: 'MP-SODA', name: 'Soda cáustica', unit: 'GRAM', isActive: true },
  sourceName: 'Fuente X',
};
const auto: CarbonActivity = {
  id: 'a-auto',
  category: 'RAW_MATERIAL',
  source: 'PRODUCTION_CONSUMPTION',
  description: 'Consumo de MP-SODA',
  activityQuantity: '0.70000000',
  activityUnit: 'KILOGRAM',
  originalQuantity: '700.0000',
  originalUnit: 'GRAM',
  emissionFactorId: 'f-soda',
  factorCodeSnapshot: 'TEST-RAW-001',
  factorNameSnapshot: 'Soda TEST',
  factorValueSnapshot: '2.10000000',
  factorSourceNameSnapshot: 'Fuente X',
  factorSourceReferenceSnapshot: 'Tabla X',
  factorSourceYearSnapshot: null,
  emissionsKgCo2e: '1.47000000',
  inventoryMovementId: 'mov-1',
  inventoryMovement: {
    id: 'mov-1',
    quantity: '-700.0000',
    occurredAt: '2026-10-31T00:00:00Z',
    product: { id: 'soda', code: 'MP-SODA', name: 'Soda cáustica', unit: 'GRAM' },
    lot: null,
  },
  createdBy: null,
};
const manual: CarbonActivity = {
  ...auto,
  id: 'a-manual',
  category: 'ENERGY',
  source: 'MANUAL',
  description: 'Electricidad del proceso',
  activityQuantity: '5.00000000',
  activityUnit: 'KWH',
  originalQuantity: null,
  originalUnit: null,
  emissionFactorId: 'f-energy',
  factorCodeSnapshot: 'TEST-ELECTRICITY',
  factorValueSnapshot: '0.50000000',
  factorSourceNameSnapshot: 'TEST_FIXTURE',
  emissionsKgCo2e: '2.50000000',
  inventoryMovementId: null,
  inventoryMovement: null,
  createdBy: { id: 'prod', fullName: 'Producción' },
};
const circularity = [
  {
    profileId: 'cp',
    metricCode: 'USED_COOKING_OIL_RECOVERED',
    displayName: 'Aceite de cocina usado valorizado',
    productId: 'oil',
    productCode: 'MP-OIL',
    productName: 'Aceite usado',
    consumedQuantity: '100000.0000',
    consumedUnit: 'MILLILITER' as const,
    quantity: '100.00000000',
    reportingUnit: 'LITER' as const,
  },
];
function footprint(overrides: Partial<Footprint> = {}): Footprint {
  return {
    id: 'fp',
    status: 'DRAFT',
    scope: 'PARTIAL_CRADLE_TO_GATE',
    productionOrderId: 'op',
    lotId: 'lot',
    quantityProduced: '200.0000',
    outputUnit: 'UNIT',
    totalKgCo2e: null,
    kgCo2ePerOutputUnit: null,
    totalsByCategory: {
      RAW_MATERIAL: '20.00000000',
      ENERGY: '2.50000000',
      INBOUND_TRANSPORT: '0.00000000',
      PACKAGING: '0.00000000',
      WASTE: '0.00000000',
    },
    totalKgCo2ePreview: '22.50000000',
    kgCo2ePerOutputUnitPreview: '0.11250000',
    missingFactors: [],
    boundaryNotes: null,
    calculatedAt: null,
    finalizedAt: null,
    finalizedBy: null,
    productionOrder: { id: 'op', number: 'OP-2026-000001', status: 'COMPLETED', product },
    lot: { id: 'lot', code: 'LOT-2026-000001', status: 'RELEASED' },
    activities: [auto, manual],
    circularity,
    circularityNotice: '',
    disclaimer: CARBON_DISCLAIMER,
    ...overrides,
  };
}
const summary: OrderSummary = {
  id: 'op',
  number: 'OP-2026-000001',
  status: 'COMPLETED',
  quantityProduced: '200.0000',
  completedAt: '2026-10-31T00:00:00Z',
  product,
  lot: { id: 'lot', code: 'LOT-2026-000001', status: 'RELEASED' },
  footprint: null,
  canCreateFootprint: true,
  circularity,
  circularityNotice: '',
  disclaimer: CARBON_DISCLAIMER,
};

type Handler = (url: string, init?: RequestInit) => Response | undefined;
const clients: ReturnType<typeof createAppQueryClient>[] = [];
function setup(path: string, role: string, handler: Handler) {
  vi.stubEnv('VITE_API_URL', 'http://localhost/api');
  const client = createAppQueryClient();
  clients.push(client);
  client.setQueryData(SESSION_KEY, { id: 'u', role, isActive: true, mustChangePassword: false });
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const response = handler(url, init);
    if (!response) throw new Error('Unhandled ' + (init?.method ?? 'GET') + ' ' + url);
    return response;
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/sustainability" element={<SustainabilityPage />} />
          <Route path="/sustainability/emission-factors" element={<EmissionFactorsPage />} />
          <Route path="/sustainability/circular-materials" element={<CircularMaterialsPage />} />
          <Route path="/sustainability/production-orders/:id" element={<FootprintDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return fetch;
}
const page = <T,>(data: T[]) => json({ data, meta: { page: 1, limit: 20, total: data.length } });
const posts = (fetch: ReturnType<typeof setup>) =>
  fetch.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');

function detail(role: string, current: Footprint | null, extra: Handler = () => undefined) {
  let state = current;
  return setup('/sustainability/production-orders/op', role, (url, init) => {
    const custom = extra(url, init);
    if (custom) return custom;
    if (url.endsWith('/production-orders/op/footprint') && !init?.method)
      return json({ data: state });
    if (url.endsWith('/production-orders/op'))
      return json({ data: { ...summary, footprint: state && { id: 'fp', status: state.status } } });
    if (url.includes('/emission-factors?')) return page([energyFactor]);
    if (url.endsWith('/footprint') && init?.method === 'POST') {
      state = footprint();
      return json({ data: state }, 201);
    }
    if (url.endsWith('/finalize')) {
      state = footprint({
        status: 'FINALIZED',
        totalKgCo2e: '22.50000000',
        kgCo2ePerOutputUnit: '0.11250000',
        boundaryNotes: (JSON.parse(String(init?.body)) as { boundaryNotes: string }).boundaryNotes,
        finalizedAt: '2026-10-31T12:00:00Z',
        finalizedBy: { id: 'u', fullName: 'Producción' },
      });
      return json({ data: state });
    }
    if (url.endsWith('/footprint/activities') && init?.method === 'POST')
      return json({ data: state }, 201);
    return undefined;
  });
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe('Sustainability navigation and listing', () => {
  it('exposes Sostenibilidad in the Análisis group for every role', () => {
    const entry = navigation.find((item) => item.to === '/sustainability');
    expect(entry).toMatchObject({ label: 'Sostenibilidad', group: 'Análisis' });
    expect([...(entry?.roles ?? [])].sort()).toEqual([
      'ADMIN',
      'COMPRAS',
      'INVENTARIO',
      'PRODUCCION',
      'VENTAS',
    ]);
  });

  it('lists completed orders with footprint state, totals and intensity', async () => {
    const orders: SustainabilityOrder[] = [
      { ...summary, footprint: null },
      {
        ...summary,
        id: 'op2',
        number: 'OP-2026-000002',
        footprint: {
          id: 'f2',
          status: 'DRAFT',
          finalizedAt: null,
          totalKgCo2e: null,
          kgCo2ePerOutputUnit: null,
        },
      },
      {
        ...summary,
        id: 'op3',
        number: 'OP-2026-000003',
        footprint: {
          id: 'f3',
          status: 'FINALIZED',
          finalizedAt: '2026-10-31T00:00:00Z',
          totalKgCo2e: '22.50000000',
          kgCo2ePerOutputUnit: '0.11250000',
        },
      },
    ];
    setup('/sustainability', 'VENTAS', (url) =>
      url.includes('/sustainability/production-orders?') ? page(orders) : undefined,
    );
    const table = await screen.findByRole('table', { name: 'Órdenes completadas y su huella' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('Sin calcular')).toBeTruthy();
    expect(within(rows[2]).getByText('Borrador')).toBeTruthy();
    expect(within(rows[3]).getByText('Finalizado')).toBeTruthy();
    expect(within(rows[3]).getByText('22.50 kg CO₂e')).toBeTruthy();
    expect(within(rows[3]).getByText('0.1125 kg CO₂e / unidad')).toBeTruthy();
    expect(screen.getByText(CARBON_DISCLAIMER)).toBeTruthy();
  });

  it('shows loading, empty and error states', async () => {
    let fail = false;
    setup('/sustainability', 'ADMIN', (url) =>
      url.includes('production-orders?')
        ? fail
          ? json({ message: 'Servicio no disponible' }, 409)
          : page([])
        : undefined,
    );
    expect(screen.getByText('Cargando órdenes completadas…')).toBeTruthy();
    expect(await screen.findByText('No hay órdenes completadas para estos filtros.')).toBeTruthy();
    fail = true;
    fireEvent.change(screen.getByLabelText('Estado de huella'), { target: { value: 'FINALIZED' } });
    expect(await screen.findByText('Servicio no disponible')).toBeTruthy();
  });
});

describe('Emission factor catalog UI', () => {
  it('lets ADMIN create, edit and toggle factors with visible sources', async () => {
    const fetch = setup('/sustainability/emission-factors', 'ADMIN', (url, init) => {
      if (url.includes('/emission-factors?')) return page([energyFactor, sodaFactor]);
      if (init?.method) return json({ data: energyFactor });
      return undefined;
    });
    expect((await screen.findAllByText('Tabla TEST 1')).length).toBe(2);
    expect(screen.getByText('0.50 kg CO₂e/kWh')).toBeTruthy();
    expect(screen.getByText('MP-SODA · Soda cáustica')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(posts(fetch)[0][0]).toContain('/emission-factors/f-energy/status');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo factor' }));
    const form = screen.getByRole('form', { name: 'Nuevo factor de emisión' });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear factor' }));
    expect(await within(form).findByText('La fuente es obligatorio')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Código/), { target: { value: 'TEST-WASTE' } });
    fireEvent.change(within(form).getByLabelText(/^Nombre/), { target: { value: 'Residuo' } });
    fireEvent.change(within(form).getByLabelText('Categoría'), { target: { value: 'WASTE' } });
    fireEvent.change(within(form).getByLabelText(/Coeficiente/), { target: { value: '-1' } });
    fireEvent.change(within(form).getByLabelText(/^Fuente/), { target: { value: 'TEST_FIXTURE' } });
    fireEvent.change(within(form).getByLabelText(/Referencia reproducible/), {
      target: { value: 'TEST_FIXTURE' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear factor' }));
    expect(
      await within(form).findByText('Coeficiente no negativo: hasta 12 enteros y 8 decimales'),
    ).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Coeficiente/), { target: { value: '0.3' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear factor' }));
    await waitFor(() => expect(posts(fetch)).toHaveLength(2));
    const body = JSON.parse(String(posts(fetch)[1][1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: 'TEST-WASTE',
      category: 'WASTE',
      kgCo2ePerUnit: '0.3',
      sourceName: 'TEST_FIXTURE',
      productId: null,
    });
  });

  it('keeps the catalog read-only for non-admin roles', async () => {
    setup('/sustainability/emission-factors', 'PRODUCCION', (url) =>
      url.includes('/emission-factors?') ? page([energyFactor]) : undefined,
    );
    expect(await screen.findByText('TEST-ELECTRICITY')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuevo factor' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull();
    expect(screen.getByText(/solo Administración puede crearlos/)).toBeTruthy();
  });

  it('locks identity fields when editing', async () => {
    setup('/sustainability/emission-factors', 'ADMIN', (url) =>
      url.includes('/emission-factors?') ? page([energyFactor]) : undefined,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar factor de emisión' });
    expect((within(form).getByLabelText(/Código/) as HTMLInputElement).disabled).toBe(true);
    expect((within(form).getByLabelText('Categoría') as HTMLSelectElement).disabled).toBe(true);
    expect((within(form).getByLabelText('Unidad de actividad') as HTMLSelectElement).disabled).toBe(
      true,
    );
  });
});

describe('Footprint detail UI', () => {
  it('without footprint offers creation to PRODUCCION and shows circularity', async () => {
    const fetch = detail('PRODUCCION', null);
    expect(await screen.findByRole('heading', { name: '1. Aviso metodológico' })).toBeTruthy();
    expect(screen.getAllByText('Sin calcular').length).toBeGreaterThan(0);
    expect(screen.getByText(CARBON_DISCLAIMER)).toBeTruthy();
    expect(screen.getByText('100 L')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Calcular huella (borrador)' }));
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(await screen.findByRole('table', { name: 'Materias primas automáticas' })).toBeTruthy();
  });

  it('DRAFT shows automatic materials with factor and source, totals, intensity and circularity apart', async () => {
    detail('PRODUCCION', footprint());
    const table = await screen.findByRole('table', { name: 'Materias primas automáticas' });
    const row = within(table).getAllByRole('row')[1];
    for (const text of [
      'MP-SODA · Soda cáustica',
      '700 g',
      '0.7 kg',
      'TEST-RAW-001 · 2.10 kg CO₂e/kg',
      'Fuente X',
      '1.47 kg CO₂e',
    ])
      expect(within(row).getByText(text)).toBeTruthy();
    const categories = screen.getByRole('list', { name: 'Huella por categoría' });
    expect(within(categories).getByText('Materias primas')).toBeTruthy();
    expect(within(categories).getByText('20.00 kg CO₂e')).toBeTruthy();
    expect(within(categories).getByText('2.50 kg CO₂e')).toBeTruthy();
    expect(screen.getByText('22.50 kg CO₂e')).toBeTruthy();
    expect(screen.getByText('0.1125 kg CO₂e / unidad')).toBeTruthy();
    expect(screen.getByText('Vista previa de borrador')).toBeTruthy();
    expect(screen.getByText('Aceite de cocina usado valorizado')).toBeTruthy();
    expect(screen.getByText('100 L')).toBeTruthy();
    expect(
      screen.getByText(
        'Este indicador se presenta por separado y no se descuenta automáticamente de la huella de carbono.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByText(CARBON_DISCLAIMER)).toHaveLength(1);
  });

  it('shows missing factors to everyone but the configure action only to ADMIN', async () => {
    const missing = footprint({
      missingFactors: [
        {
          productId: 'soda',
          code: 'MP-SODA',
          name: 'Soda cáustica',
          unit: 'GRAM',
          consumedQuantity: '700.0000',
        },
      ],
    });
    detail('PRODUCCION', missing);
    expect(
      await screen.findByText(
        'Faltan factores para calcular la huella completa del alcance seleccionado',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/MP-SODA · Soda cáustica — 700 g/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Configurar factor' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Revisar finalización' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('ADMIN gets the configure-factor link prefilled with the product', async () => {
    detail(
      'ADMIN',
      footprint({
        missingFactors: [
          {
            productId: 'soda',
            code: 'MP-SODA',
            name: 'Soda cáustica',
            unit: 'GRAM',
            consumedQuantity: '700.0000',
          },
        ],
      }),
    );
    const link = await screen.findByRole('link', { name: 'Configurar factor' });
    expect(link.getAttribute('href')).toContain('/sustainability/emission-factors?productId=soda');
  });

  it('manual form takes the unit and source from the factor', async () => {
    const fetch = detail('PRODUCCION', footprint());
    const form = await screen.findByRole('form', { name: 'Nueva actividad manual' });
    expect(within(form).queryByLabelText(/Unidad/)).toBeNull();
    const factor = within(form).getByLabelText('Factor');
    await within(form).findByRole('option', { name: 'TEST-ELECTRICITY · Electricidad TEST' });
    fireEvent.change(factor, { target: { value: 'f-energy' } });
    expect(within(form).getByText('kWh')).toBeTruthy();
    expect(within(form).getByText('0.50 kg CO₂e/kWh')).toBeTruthy();
    expect(within(form).getByText(/TEST_FIXTURE \(2024\) · Tabla TEST 1/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Descripción/), {
      target: { value: 'Electricidad del proceso' },
    });
    fireEvent.change(within(form).getByLabelText(/Cantidad/), { target: { value: '8.5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar actividad' }));
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(JSON.parse(String(posts(fetch)[0][1]?.body))).toEqual({
      emissionFactorId: 'f-energy',
      description: 'Electricidad del proceso',
      quantity: '8.5',
    });
  });

  it('requires boundary notes and an explicit review before finalizing', async () => {
    const fetch = detail('PRODUCCION', footprint());
    const finalize = await screen.findByRole('button', { name: 'Revisar finalización' });
    fireEvent.click(finalize);
    expect(
      await screen.findByText('Describe los límites del sistema (mínimo 10 caracteres)'),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Límites del sistema (obligatorio)'), {
      target: { value: 'Incluye MP y electricidad. Excluye distribución.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar finalización' }));
    expect(await screen.findByText('Una huella finalizada no puede modificarse.')).toBeTruthy();
    expect(screen.getByText('Confirmar finalización')).toBeTruthy();
    expect(posts(fetch)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar huella' }));
    expect(await screen.findByText('Huella finalizada e inmutable.')).toBeTruthy();
    expect(posts(fetch)).toHaveLength(1);
  });

  it('FINALIZED is read-only and still shows the disclaimer', async () => {
    detail(
      'ADMIN',
      footprint({
        status: 'FINALIZED',
        totalKgCo2e: '22.50000000',
        kgCo2ePerOutputUnit: '0.11250000',
        boundaryNotes: 'Incluye MP. Excluye uso.',
        finalizedAt: '2026-10-31T12:00:00Z',
        finalizedBy: { id: 'u', fullName: 'Responsable' },
      }),
    );
    expect(await screen.findByText('Huella finalizada e inmutable.')).toBeTruthy();
    expect(screen.getByText(CARBON_DISCLAIMER)).toBeTruthy();
    expect(screen.getByText('Responsable')).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sincronizar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
    expect(screen.queryByText('Vista previa de borrador')).toBeNull();
  });

  it('read-only roles see the DRAFT without mutation controls', async () => {
    detail('VENTAS', footprint());
    expect(
      await screen.findByText(
        'Borrador pendiente de finalización por Producción o Administración.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sincronizar/ })).toBeNull();
  });

  it('shows API errors from mutations', async () => {
    detail('PRODUCCION', footprint(), (url, init) =>
      url.endsWith('/finalize')
        ? json({ message: 'La huella finalizada es inmutable' }, 409)
        : init?.method === 'POST' && url.endsWith('/sync')
          ? json({ message: 'Error de sincronización' }, 409)
          : undefined,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar con consumos reales' }));
    expect(await screen.findByText('Error de sincronización')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Límites del sistema (obligatorio)'), {
      target: { value: 'Incluye MP y electricidad.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar finalización' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar huella' }));
    expect(await screen.findByText('La huella finalizada es inmutable')).toBeTruthy();
  });
});

describe('Circular materials and helpers', () => {
  it('lists circular profiles separately from carbon', async () => {
    setup('/sustainability/circular-materials', 'INVENTARIO', (url) =>
      url.includes('/circular-materials?')
        ? page([
            {
              id: 'cp',
              productId: 'oil',
              metricCode: 'USED_COOKING_OIL_RECOVERED',
              displayName: 'Aceite de cocina usado valorizado',
              reportingUnit: 'LITER',
              isActive: true,
              product: {
                id: 'oil',
                code: 'MP-OIL',
                name: 'Aceite usado',
                unit: 'MILLILITER',
                isActive: true,
              },
            },
          ])
        : undefined,
    );
    expect(await screen.findByText('USED_COOKING_OIL_RECOVERED')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuevo material circular' })).toBeNull();
    expect(screen.getByText(/no se descuenta automáticamente/)).toBeTruthy();
  });

  it('formats exact decimals without floating point', () => {
    expect(trimDecimal('22.50000000')).toBe('22.50');
    expect(trimDecimal('0.11250000')).toBe('0.1125');
    expect(trimDecimal('100.00000000', 0)).toBe('100');
    expect(trimDecimal('0.30000000')).toBe('0.30');
  });
});
