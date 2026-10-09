import { useState } from 'react';
import { useSuppliers, useToggleSupplierStatus } from '../hooks/useSuppliers';
import { SupplierDialogs } from '../components/suppliers/SupplierDialogs';
import type { Supplier } from '../types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ErrorNotice } from '@/components/ErrorNotice';

export default function SuppliersPage() {
  const { data: suppliers, isLoading, isError, error } = useSuppliers();
  const toggleStatusMutation = useToggleSupplierStatus();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const handleCreate = () => {
    setSelectedSupplier(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsDialogOpen(true);
  };

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleStatusMutation.mutate({ id, isActive: !currentStatus });
  };

  if (isLoading) return <div className="p-8 text-center">Cargando proveedores...</div>;
  if (isError) return <ErrorNotice error={error as Error} />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Gestión de Proveedores</h1>
        <Button onClick={handleCreate}>+ Nuevo Proveedor</Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razón Social</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers?.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className="font-medium">{supplier.name}</TableCell>
                <TableCell>
                  <div className="text-sm">{supplier.email}</div>
                  <div className="text-sm text-gray-500">{supplier.phone}</div>
                </TableCell>
                <TableCell>{supplier.address}</TableCell>
                <TableCell>
                  <Badge variant={supplier.isActive ? 'default' : 'secondary'}>
                    {supplier.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(supplier)}>
                    Editar
                  </Button>
                  <Button
                    variant={supplier.isActive ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => handleToggleStatus(supplier.id, supplier.isActive)}
                    disabled={toggleStatusMutation.isPending}
                  >
                    {supplier.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {suppliers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  No hay proveedores registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SupplierDialogs
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        supplierToEdit={selectedSupplier}
      />
    </div>
  );
}
