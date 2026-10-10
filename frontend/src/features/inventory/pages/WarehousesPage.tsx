import { WarehousesList } from '../components/warehouses/WarehousesList';

export function WarehousesPage() {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gestión de Almacenes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra los almacenes para el inventario de materias primas y productos terminados.
          </p>
        </div>
      </div>

      {/* Aquí cargamos nuestra tabla y diálogos */}
      <WarehousesList />
    </section>
  );
}
