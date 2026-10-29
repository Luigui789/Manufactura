import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaleDispatchForm } from './SaleDispatchForm';
import type { SaleOrder } from '../api/sales-orders';

vi.mock('@/features/inventory/api/inventory-hooks', () => ({
  useInventoryStock: () => ({ data: { data: [{ quantity: '20.0000' }] }, isPending: false }),
}));

vi.mock('@/features/inventory/components/InventoryEntityPicker', async () => {
  const React = await import('react');
  const warehouses = [
    { id: 'warehouse-a', code: 'ALM-A', name: 'Almacén A' },
    { id: 'warehouse-b', code: 'ALM-B', name: 'Almacén B' },
    { id: 'warehouse-c', code: 'ALM-C', name: 'Almacén C' },
  ];
  const lots = [
    { id: 'lot-a', code: 'LOT-A', name: 'Jabón · Liberado' },
    { id: 'lot-b', code: 'LOT-B', name: 'Jabón · Liberado' },
    { id: 'lot-c', code: 'LOT-C', name: 'Jabón · Liberado' },
  ];
  return {
    InventoryEntityPicker: ({
      kind,
      value,
      onChange,
    }: {
      kind: 'warehouse' | 'lot';
      value: string;
      onChange: (id: string, entity?: { id: string; code: string; name: string }) => void;
    }) => {
      const entities = kind === 'warehouse' ? warehouses : lots;
      return React.createElement(
        'select',
        {
          'aria-label': kind === 'warehouse' ? 'Almacén' : 'Lote',
          value,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
            const entity = entities.find((item) => item.id === event.target.value);
            onChange(event.target.value, entity);
          },
        },
        React.createElement('option', { value: '' }, 'Seleccionar'),
        ...entities.map((entity) =>
          React.createElement('option', { key: entity.id, value: entity.id }, entity.code),
        ),
      );
    },
  };
});

const order = {
  id: 'order-1',
  number: 'OV-2026-000001',
  status: 'CONFIRMED',
  orderedAt: '2026-10-28T12:00:00Z',
  total: '10.00',
  itemsCount: 1,
  customer: { id: 'customer-1', code: 'CLI-1', name: 'Cliente' },
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      productCode: 'PT-JABON',
      productName: 'Jabón',
      productUnit: 'LITER',
      isLotTracked: true,
      quantity: '10',
      quantityPending: '10',
      unitPrice: '1',
      lineTotal: '10',
    },
  ],
  createdAt: '2026-10-28T12:00:00Z',
  updatedAt: '2026-10-28T12:00:00Z',
} as SaleOrder;

function renderForm(onSubmit = vi.fn()) {
  render(<SaleDispatchForm order={order} pending={false} onSubmit={onSubmit} />);
  return onSubmit;
}

function addRow() {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar asignación' }));
}

function setSelect(label: string, index: number, value: string) {
  fireEvent.change(screen.getAllByLabelText(label)[index], { target: { value } });
}

function fillRow(index: number, warehouse: string, lot: string, quantity: string) {
  setSelect('Producto de la orden', index, 'item-1');
  setSelect('Almacén', index, warehouse);
  setSelect('Lote', index, lot);
  fireEvent.change(screen.getAllByLabelText(/Cantidad a despachar/)[index], {
    target: { value: quantity },
  });
}

describe('Formulario de despacho: identidad estable de filas', () => {
  afterEach(cleanup);

  it('al quitar A conserva en resumen y payload el almacén y lote de B', () => {
    const submit = renderForm();
    addRow();
    fillRow(0, 'warehouse-a', 'lot-a', '2');
    fillRow(1, 'warehouse-b', 'lot-b', '3');
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar línea' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar despacho' }));

    const summary = screen.getByRole('region', { name: 'Resumen del despacho' });
    expect(summary.textContent).toContain('3 Litro · ALM-B · LOT-B');
    expect(summary.textContent).not.toContain('ALM-A');
    expect(summary.textContent).not.toContain('LOT-A');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar despacho' }));
    expect(submit).toHaveBeenCalledWith({
      items: [
        { saleOrderItemId: 'item-1', warehouseId: 'warehouse-b', lotId: 'lot-b', quantity: '3' },
      ],
    });
  });

  it('al quitar la fila B conserva las selecciones de A y C', () => {
    const submit = renderForm();
    addRow();
    addRow();
    fillRow(0, 'warehouse-a', 'lot-a', '1');
    fillRow(1, 'warehouse-b', 'lot-b', '2');
    fillRow(2, 'warehouse-c', 'lot-c', '3');
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar línea' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar despacho' }));

    const summary = screen.getByRole('region', { name: 'Resumen del despacho' });
    expect(summary.textContent).toContain('1 Litro · ALM-A · LOT-A');
    expect(summary.textContent).toContain('3 Litro · ALM-C · LOT-C');
    expect(summary.textContent).not.toContain('ALM-B');
    expect(summary.textContent).not.toContain('LOT-B');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar despacho' }));
    expect(submit).toHaveBeenCalledWith({
      items: [
        { saleOrderItemId: 'item-1', warehouseId: 'warehouse-a', lotId: 'lot-a', quantity: '1' },
        { saleOrderItemId: 'item-1', warehouseId: 'warehouse-c', lotId: 'lot-c', quantity: '3' },
      ],
    });
  });
});
