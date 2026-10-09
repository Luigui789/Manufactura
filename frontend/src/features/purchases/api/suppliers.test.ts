import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSuppliers, createSupplier, updateSupplier, toggleSupplierStatus } from './suppliers';
import { apiFetch } from '@/services/api-client';

vi.mock('@/services/api-client', () => ({
  apiFetch: vi.fn(),
}));

describe('Suppliers API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSuppliers debe hacer un GET a /api/suppliers', async () => {
    await getSuppliers();
    expect(apiFetch).toHaveBeenCalledWith('/api/suppliers');
  });

  it('createSupplier debe hacer un POST con el payload stringificado', async () => {
    const payload = { name: 'Eco', phone: '123', email: 'eco@eco.com', address: 'Nicaragua' };
    await createSupplier(payload);

    expect(apiFetch).toHaveBeenCalledWith('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });

  it('updateSupplier debe hacer un PATCH a la ruta del ID', async () => {
    const payload = { name: 'Eco Editado' };
    await updateSupplier({ id: '123', payload });

    expect(apiFetch).toHaveBeenCalledWith('/api/suppliers/123', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  });

  it('toggleSupplierStatus debe hacer un PATCH al endpoint de status', async () => {
    await toggleSupplierStatus({ id: '123', isActive: false });

    expect(apiFetch).toHaveBeenCalledWith('/api/suppliers/123/status', {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    });
  });
});
