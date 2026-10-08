import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SupplierDialogs } from './SupplierDialogs';
import * as hooks from '../../hooks/useSuppliers';

vi.mock('../../hooks/useSuppliers', () => ({
  useCreateSupplier: vi.fn(),
  useUpdateSupplier: vi.fn(),
}));

describe('SupplierDialogs Component', () => {
  const mockCreateMutateAsync = vi.fn();
  const mockUpdateMutateAsync = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(hooks, 'useCreateSupplier').mockReturnValue({ mutateAsync: mockCreateMutateAsync, isPending: false } as any);
    vi.spyOn(hooks, 'useUpdateSupplier').mockReturnValue({ mutateAsync: mockUpdateMutateAsync, isPending: false } as any);
  });

  it('debe renderizar el título "Nuevo Proveedor" cuando no hay datos iniciales', () => {
    render(<SupplierDialogs open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText('Nuevo Proveedor')).toBeDefined();
  });

  it('debe renderizar el título "Editar Proveedor" y llenar el formulario si recibe datos', () => {
    const supplierToEdit = {
      id: '1', name: 'Eco', phone: '123', email: 'test@eco.com', address: 'Dirección', isActive: true, createdAt: '', updatedAt: ''
    };
    
    render(<SupplierDialogs open={true} onOpenChange={mockOnOpenChange} supplierToEdit={supplierToEdit} />);
    expect(screen.getByText('Editar Proveedor')).toBeDefined();
    expect((screen.getByLabelText('Razón Social') as HTMLInputElement).value).toBe('Eco');
  });

  it('debe mostrar errores de validación si se envía vacío', async () => {
    render(<SupplierDialogs open={true} onOpenChange={mockOnOpenChange} />);
    
    const submitButton = screen.getByText('Guardar');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('El nombre o razón social es obligatorio')).toBeDefined();
      expect(screen.getByText('El teléfono es obligatorio')).toBeDefined();
    });
    
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it('debe llamar a la mutación de creación si los datos son válidos', async () => {
    render(<SupplierDialogs open={true} onOpenChange={mockOnOpenChange} />);
    
    fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'Nueva Empresa' } });
    fireEvent.change(screen.getByLabelText('Correo Electrónico'), { target: { value: 'empresa@test.com' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-8888' } });
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Managua' } });

    const submitButton = screen.getByText('Guardar');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        name: 'Nueva Empresa',
        email: 'empresa@test.com',
        phone: '8888-8888',
        address: 'Managua'
      });
      // Verifica que el diálogo intenta cerrarse tras el éxito
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});