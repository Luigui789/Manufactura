import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, SESSION_KEY } from '@/app/query-client';
import { StatusBadge } from '@/components/erp';
import { lotStatusLabel, movementLabel } from '@/features/inventory/inventory-labels';
import { QualityDispositionPanel } from './QualityDisposition';
import { LotProductionDetail } from './LotProductionDetail';
import type { Inspection, QualityDispositionType } from '../api/quality';
const inspection: Inspection = {
  id: 'inspection',
  lotId: 'lot',
  result: 'REJECTED',
  observations: 'Inspección rechazada',
  nonConformities: 'Defecto original',
  inspectedAt: '2026-10-31T12:00:00Z',
  inspectedBy: { id: 'actor', fullName: 'Inspectora' },
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const clients: ReturnType<typeof createAppQueryClient>[] = [];
function setup({
  role = 'PRODUCCION',
  status = 'REJECTED',
  existing = null,
  error = false,
  integrated = false,
  approved = false,
}: {
  role?: string;
  status?: string;
  existing?: QualityDispositionType | null;
  error?: boolean;
  integrated?: boolean;
  approved?: boolean;
} = {}) {
  vi.stubEnv('VITE_API_URL', 'http://localhost/api');
  const client = createAppQueryClient();
  clients.push(client);
  client.setQueryData(SESSION_KEY, {
    id: 'actor',
    role,
    isActive: true,
    mustChangePassword: false,
  });
  let disposition = existing
    ? {
        id: 'd',
        lotId: 'lot',
        inspectionId: 'inspection',
        type: existing,
        reason: 'Motivo conservado',
        decidedAt: '2026-10-31T12:00:00Z',
        decidedByUserId: 'actor',
        decidedBy: { id: 'actor', fullName: 'Decisora' },
      }
    : null;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      if (error) return response({ message: 'Otra persona ya decidió' }, 409);
      const payload = JSON.parse(String(options.body)) as {
        type: QualityDispositionType;
        reason: string;
      };
      disposition = {
        id: 'd',
        lotId: 'lot',
        inspectionId: 'inspection',
        ...payload,
        decidedAt: '2026-10-31T12:00:00Z',
        decidedByUserId: 'actor',
        decidedBy: { id: 'actor', fullName: 'Decisora' },
      };
      return response({ data: disposition }, 201);
    }
    if (url.endsWith('/disposition')) return response({ data: disposition });
    if (url.endsWith('/inspection'))
      return response({ data: { ...inspection, result: approved ? 'APPROVED' : 'REJECTED' } });
    return response({ data: { rootLotId: 'lot', lots: [] } });
  });
  vi.stubGlobal('fetch', fetch);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        {integrated ? (
          <LotProductionDetail lotId="lot" status={status} />
        ) : (
          <QualityDispositionPanel lotId="lot" status={status} inspection={inspection} />
        )}
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { fetch, invalidate };
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Quality disposition UI', () => {
  it('shows the form and exceptional-release warning for rejected lots', async () => {
    setup();
    expect(await screen.findByRole('form', { name: 'Disponer lote rechazado' })).toBeTruthy();
    expect(screen.getByText(/La inspección original permanecerá rechazada/)).toBeTruthy();
  });
  it('read-only VENTAS sees pending disposition without controls', async () => {
    setup({ role: 'VENTAS' });
    expect(await screen.findByText('Pendiente de disposición')).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
  });
  it.each(['RELEASE', 'REWORK', 'SCRAP'] as const)(
    'confirms %s, requires a reason, invalidates dependent queries and becomes read-only',
    async (type) => {
      const { fetch, invalidate } = setup();
      fireEvent.change(await screen.findByLabelText('Disposición'), { target: { value: type } });
      fireEvent.click(screen.getByRole('button', { name: 'Revisar disposición' }));
      expect(await screen.findByText('Indica el motivo de la disposición')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Motivo de disposición'), {
        target: { value: 'Decisión humana' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Revisar disposición' }));
      expect(await screen.findByText('Confirmar disposición definitiva')).toBeTruthy();
      expect(fetch.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar disposición' }));
      expect(await screen.findByText('Decisora')).toBeTruthy();
      expect(screen.queryByRole('form')).toBeNull();
      for (const key of [
        'production-quality',
        'quality-disposition',
        'production-traceability',
        'production-orders',
        'inventory',
        'lots',
        'production-dashboard',
      ])
        expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
      expect(
        await screen.findByText(
          { RELEASE: 'Liberado', REWORK: 'Reproceso', SCRAP: 'Descartado' }[type],
        ),
      ).toBeTruthy();
    },
  );
  it('shows mutation error and requires a fresh confirmation', async () => {
    setup({ error: true });
    fireEvent.change(await screen.findByLabelText('Motivo de disposición'), {
      target: { value: 'Motivo' },
    });
    fireEvent.click(screen.getByText('Revisar disposición'));
    fireEvent.click(await screen.findByText('Confirmar disposición'));
    expect(await screen.findByText('Otra persona ya decidió')).toBeTruthy();
    expect(screen.queryByText('Confirmar disposición definitiva')).toBeNull();
  });
  it('preserves rejected inspection and nonconformities after exceptional release', async () => {
    setup({ integrated: true, status: 'RELEASED', existing: 'RELEASE' });
    expect(await screen.findByText('Defecto original')).toBeTruthy();
    expect(screen.getByText('Rechazado')).toBeTruthy();
    expect(
      await screen.findByText(/Inspección rechazada · Liberado posteriormente por disposición/),
    ).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
  });
  it('shows no disposition actions for approved inspection', async () => {
    setup({ integrated: true, status: 'RELEASED', approved: true });
    expect(await screen.findByText('Aprobado')).toBeTruthy();
    expect(screen.queryByText('Revisar disposición')).toBeNull();
  });
  it.each(['REWORK', 'SCRAPPED'] as const)('has labels and badges for %s', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(lotStatusLabel(status))).toBeTruthy();
    expect(lotStatusLabel(status)).not.toBe(status);
    expect(movementLabel('QUALITY_SCRAP')).toBe('Descarte por calidad');
  });
  it('changing a reviewed decision requires reviewing again', async () => {
    const { fetch } = setup();
    fireEvent.change(await screen.findByLabelText('Motivo de disposición'), {
      target: { value: 'Motivo' },
    });
    fireEvent.click(screen.getByText('Revisar disposición'));
    await screen.findByText('Confirmar disposición');
    fireEvent.change(screen.getByLabelText('Disposición'), { target: { value: 'SCRAP' } });
    fireEvent.click(screen.getByText('Revisar disposición'));
    await waitFor(() =>
      expect(fetch.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0),
    );
  });
});
