import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  EmptyState,
  EntitySummary,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
} from './erp';
import { FormField } from './FormField';

describe('Patrones compartidos del ERP', () => {
  it('muestra estado semántico en español sin exponer el enum', () => {
    render(<StatusBadge status="QUARANTINED" />);
    expect(screen.getByText('En cuarentena')).toBeTruthy();
    expect(screen.queryByText('QUARANTINED')).toBeNull();
  });
  it('una sola página muestra el total y omite controles inútiles', () => {
    render(<Pagination page={1} pages={1} total={4} label="Resultados" onPageChange={vi.fn()} />);
    expect(screen.getByText('4 resultados')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('pagina por intención y bloquea controles mientras consulta', () => {
    const change = vi.fn();
    const { rerender } = render(
      <Pagination page={1} pages={3} label="Resultados" onPageChange={change} />,
    );
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(change).toHaveBeenCalledWith(2);
    rerender(<Pagination page={2} pages={3} busy label="Resultados" onPageChange={change} />);
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it('asocia ayuda y error al campo sin perder una descripción adicional', () => {
    render(
      <>
        <p id="extra">Referencia adicional</p>
        <FormField
          id="quantity"
          label="Cantidad"
          helper="Hasta cuatro decimales"
          error="Indicá una cantidad positiva"
          aria-describedby="extra"
        />
      </>,
    );
    const input = screen.getByLabelText('Cantidad');
    expect(input.getAttribute('aria-describedby')).toBe('quantity-help quantity-error extra');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Indicá una cantidad positiva');
  });
  it('el breadcrumb identifica solo la ubicación final', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="OC-001"
          breadcrumbs={[
            { label: 'Compras', to: '/purchases/orders' },
            { label: 'Órdenes' },
            { label: 'OC-001' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Compras' }).getAttribute('href')).toBe(
      '/purchases/orders',
    );
    expect(screen.getByText('Órdenes').getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('OC-001');
  });
  it('diferencia selección de resultados y permite cambiarla', () => {
    const change = vi.fn();
    render(
      <EntitySummary label="Producto seleccionado" onChange={change}>
        MT-001 · Aceite
      </EntitySummary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(change).toHaveBeenCalledOnce();
    expect(screen.getByText('Producto seleccionado')).toBeTruthy();
  });
  it('anuncia carga y orienta el vacío', () => {
    const { rerender } = render(<LoadingState label="Cargando lotes…" />);
    expect(screen.getByRole('status').textContent).toContain('Cargando lotes…');
    rerender(
      <EmptyState title="Sin lotes" description="Registrá una recepción para generar un lote." />,
    );
    expect(screen.getByText('Registrá una recepción para generar un lote.')).toBeTruthy();
  });
});
