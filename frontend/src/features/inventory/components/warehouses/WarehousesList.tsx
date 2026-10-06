import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWarehouses } from '../../api/hooks';
import { CreateWarehouseDialog } from './WarehouseDialogs';

export function WarehousesList() {
  const { data: warehouses, isLoading, isError, error } = useWarehouses();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (isLoading) return <p className="p-8 text-center text-gray-500">Cargando almacenes...</p>;
  if (isError) return <p className="p-8 text-center text-red-500">Error: {error?.message}</p>;

  return (
    <div className="space-y-4">
      {/* Cabecera con título y botón de crear */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Almacenes</h2>
        <Button onClick={() => setIsCreateOpen(true)}>Nuevo Almacén</Button>
      </div>

      {/* Tabla de datos */}
      <div className="rounded-md border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Código
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ubicación
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!warehouses || warehouses.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No hay almacenes registrados.
                </td>
              </tr>
            ) : (
              warehouses.map((warehouse) => (
                <tr key={warehouse.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {warehouse.code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {warehouse.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {warehouse.location || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${warehouse.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {warehouse.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Diálogo de creación que se muestra cuando isCreateOpen es true */}
      {isCreateOpen && (
        <CreateWarehouseDialog
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(message) => {
            console.log(message);
            setIsCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}
