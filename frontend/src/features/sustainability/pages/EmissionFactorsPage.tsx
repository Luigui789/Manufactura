import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadingState, PageHeader, Pagination, StatusBadge } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  CARBON_CATEGORIES,
  type CarbonCategory,
  type EmissionFactor,
  useEmissionFactors,
  useSetFactorStatus,
} from '../api/sustainability';
import { FactorForm } from '../components/FactorForm';
import { CATEGORY_LABELS, trimDecimal, UNIT_SYMBOLS } from '../labels';

export function EmissionFactorsPage() {
  const session = useSession();
  const isAdmin = session.data?.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const prefillId = params.get('productId') ?? '';
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CarbonCategory | ''>('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<EmissionFactor | 'new' | null>(
    prefillId && isAdmin ? 'new' : null,
  );
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const query = useEmissionFactors({
    page,
    search,
    category: category || undefined,
    isActive: status === 'all' ? undefined : status === 'active',
  });
  const toggle = useSetFactorStatus();
  return (
    <section className="space-y-6">
      <PageHeader
        title="Factores de emisión"
        description="Coeficientes kg CO₂e por unidad de actividad, cada uno con su fuente documentada."
        breadcrumbs={[
          { label: 'Análisis' },
          { label: 'Sostenibilidad', to: '/sustainability' },
          { label: 'Factores de emisión' },
        ]}
        actions={
          isAdmin &&
          editing === null && (
            <Button
              onClick={() => {
                setNotice('');
                setEditing('new');
              }}
            >
              Nuevo factor
            </Button>
          )
        }
      />
      {!isAdmin && (
        <p className="text-sm text-muted-foreground">
          Los factores son configuración gobernada: solo Administración puede crearlos o
          modificarlos.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {isAdmin && editing !== null && (
        <div className="space-y-2">
          <FactorForm
            key={editing === 'new' ? 'new' : editing.id}
            factor={editing === 'new' ? undefined : editing}
            prefill={
              editing === 'new' && prefillId
                ? {
                    productId: prefillId,
                    productLabel: params.get('product') ?? prefillId,
                  }
                : undefined
            }
            onDone={(saved) => {
              setEditing(null);
              setNotice(`Factor ${saved.code} guardado.`);
              if (prefillId) setParams({});
            }}
          />
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(null);
              if (prefillId) setParams({});
            }}
          >
            Cancelar
          </Button>
        </div>
      )}
      <form
        role="search"
        className="flex flex-wrap items-end gap-3 border-y py-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="factor-search">Buscar código, nombre, fuente o producto</Label>
          <Input
            id="factor-search"
            type="search"
            maxLength={100}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="factor-category">Categoría</Label>
          <select
            id="factor-category"
            className="h-9 rounded-md border bg-background px-3"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as CarbonCategory | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {CARBON_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="factor-status">Estado</Label>
          <select
            id="factor-status"
            className="h-9 rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {query.isPending && <LoadingState label="Cargando factores…" />}
      <ErrorNotice error={query.error ?? toggle.error} />
      {query.isError && (
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
          Reintentar
        </Button>
      )}
      {query.data?.data.length === 0 && (
        <EmptyState
          title="No hay factores de emisión registrados."
          description="Los factores reales se cargan después de documentar su fuente; nunca se inventan."
        />
      )}
      {!!query.data?.data.length && (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label="Factores de emisión">
            <TableHeader>
              <TableRow>
                {[
                  'Código',
                  'Nombre',
                  'Categoría',
                  'Coeficiente',
                  'Producto',
                  'Fuente',
                  'Estado',
                  ...(isAdmin ? ['Acciones'] : []),
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((factor) => (
                <TableRow key={factor.id}>
                  <TableCell>{factor.code}</TableCell>
                  <TableCell className="whitespace-normal">{factor.name}</TableCell>
                  <TableCell>{CATEGORY_LABELS[factor.category]}</TableCell>
                  <TableCell className="tabular-nums">
                    {trimDecimal(factor.kgCo2ePerUnit)} kg CO₂e/{UNIT_SYMBOLS[factor.activityUnit]}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {factor.product ? `${factor.product.code} · ${factor.product.name}` : '—'}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-sm">
                    <span className="font-medium">{factor.sourceName}</span>
                    {factor.sourceYear ? ` (${factor.sourceYear})` : ''}
                    <span className="block break-words text-muted-foreground">
                      {factor.sourceReference}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={factor.isActive} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setNotice('');
                            setEditing(factor);
                          }}
                        >
                          Editar
                        </Button>
                        {confirm === factor.id ? (
                          <>
                            <Button
                              variant={factor.isActive ? 'destructive' : 'default'}
                              disabled={toggle.isPending}
                              onClick={() =>
                                toggle.mutate(
                                  { id: factor.id, isActive: !factor.isActive },
                                  { onSettled: () => setConfirm(null) },
                                )
                              }
                            >
                              {factor.isActive ? 'Confirmar desactivación' : 'Confirmar activación'}
                            </Button>
                            <Button variant="outline" onClick={() => setConfirm(null)}>
                              Volver
                            </Button>
                          </>
                        ) : (
                          <Button variant="outline" onClick={() => setConfirm(factor.id)}>
                            {factor.isActive ? 'Desactivar' : 'Activar'}
                          </Button>
                        )}
                      </div>
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
          label="factores"
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
