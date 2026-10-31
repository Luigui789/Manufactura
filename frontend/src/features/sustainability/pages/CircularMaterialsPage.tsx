import { useId, useState } from 'react';
import { Link } from 'react-router';
import { CatalogPicker } from '@/components/CatalogPicker';
import { EmptyState, LoadingState, PageHeader, Pagination, StatusBadge } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSession } from '@/features/auth/hooks/use-auth';
import {
  CARBON_UNITS,
  type CarbonUnit,
  useCircularProfiles,
  useCreateCircularProfile,
  useSetCircularStatus,
} from '../api/sustainability';
import { UNIT_SYMBOLS } from '../labels';

const CIRCULARITY_NOTICE =
  'Este indicador se presenta por separado y no se descuenta automáticamente de la huella de carbono.';

function CircularForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const create = useCreateCircularProfile();
  const [productId, setProductId] = useState('');
  const [metricCode, setMetricCode] = useState('USED_COOKING_OIL_RECOVERED');
  const [displayName, setDisplayName] = useState('Aceite de cocina usado valorizado');
  const [reportingUnit, setReportingUnit] = useState<CarbonUnit>('LITER');
  const [error, setError] = useState('');
  return (
    <form
      aria-label="Nuevo material circular"
      className="space-y-4 rounded-lg border p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!productId || !metricCode.trim() || !displayName.trim()) {
          setError('Producto, código y nombre son obligatorios');
          return;
        }
        setError('');
        create.mutate(
          {
            productId,
            metricCode: metricCode.trim(),
            displayName: displayName.trim(),
            reportingUnit,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <h2 className="text-base font-semibold">Nuevo material circular</h2>
      <CatalogPicker
        kind="product"
        value={productId}
        onChange={setProductId}
        productTypeOptions={['RAW_MATERIAL', 'CONSUMABLE']}
        disabled={create.isPending}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          id={id + '-code'}
          label="Código de métrica"
          required
          maxLength={80}
          value={metricCode}
          onChange={(event) => setMetricCode(event.target.value)}
        />
        <FormField
          id={id + '-name'}
          label="Nombre visible"
          required
          maxLength={150}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <div className="space-y-2">
          <Label htmlFor={id + '-unit'}>Unidad de reporte</Label>
          <select
            id={id + '-unit'}
            className="h-10 w-full rounded-md border bg-background px-3"
            value={reportingUnit}
            onChange={(event) => setReportingUnit(event.target.value as CarbonUnit)}
          >
            {CARBON_UNITS.slice(0, 5).map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_SYMBOLS[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ErrorNotice error={create.error} />
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Guardando…' : 'Crear perfil circular'}
      </Button>
    </form>
  );
}

export function CircularMaterialsPage() {
  const session = useSession();
  const isAdmin = session.data?.role === 'ADMIN';
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useCircularProfiles(page);
  const toggle = useSetCircularStatus();
  return (
    <section className="space-y-6">
      <PageHeader
        title="Materiales circulares"
        description="Materiales recuperados que se miden desde los consumos reales de producción."
        breadcrumbs={[
          { label: 'Análisis' },
          { label: 'Sostenibilidad', to: '/sustainability' },
          { label: 'Materiales circulares' },
        ]}
        actions={
          isAdmin &&
          !creating && <Button onClick={() => setCreating(true)}>Nuevo material circular</Button>
        }
      />
      <p className="rounded-md border bg-muted/30 p-3 text-sm">{CIRCULARITY_NOTICE}</p>
      {isAdmin && creating && (
        <div className="space-y-2">
          <CircularForm onDone={() => setCreating(false)} />
          <Button variant="ghost" onClick={() => setCreating(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {query.isPending && <LoadingState label="Cargando materiales circulares…" />}
      <ErrorNotice error={query.error ?? toggle.error} />
      {query.data?.data.length === 0 && (
        <EmptyState
          title="No hay materiales circulares configurados."
          description="Por ejemplo: aceite de cocina usado valorizado, reportado en litros."
        />
      )}
      {!!query.data?.data.length && (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label="Materiales circulares">
            <TableHeader>
              <TableRow>
                {[
                  'Métrica',
                  'Nombre',
                  'Producto',
                  'Unidad',
                  'Estado',
                  ...(isAdmin ? ['Acciones'] : []),
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>{profile.metricCode}</TableCell>
                  <TableCell className="whitespace-normal">{profile.displayName}</TableCell>
                  <TableCell className="whitespace-normal">
                    {profile.product.code} · {profile.product.name}
                  </TableCell>
                  <TableCell>{UNIT_SYMBOLS[profile.reportingUnit]}</TableCell>
                  <TableCell>
                    <StatusBadge status={profile.isActive} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        variant="outline"
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({ id: profile.id, isActive: !profile.isActive })
                        }
                      >
                        {profile.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {query.data && (
        <Pagination
          page={page}
          pages={Math.max(1, Math.ceil(query.data.meta.total / query.data.meta.limit))}
          total={query.data.meta.total}
          label="materiales circulares"
          onPageChange={setPage}
          busy={query.isFetching}
          unavailable={query.isError}
        />
      )}
      <Button asChild variant="ghost">
        <Link to="/sustainability">Volver a sostenibilidad</Link>
      </Button>
    </section>
  );
}
