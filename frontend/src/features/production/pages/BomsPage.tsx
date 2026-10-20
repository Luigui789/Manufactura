import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EmptyState,
  FormSection,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
} from '@/components/erp';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
import { useBoms, useCreateBom } from '../api/boms';
import { createBomSchema, type CreateBomFormData } from '../schemas';
import { ProductPicker } from '../components/ProductPicker';

function CreateBomForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const mutation = useCreateBom();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateBomFormData>({
    resolver: zodResolver(createBomSchema),
    defaultValues: { name: '', productId: '' },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl" showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Nueva fórmula</DialogTitle>
          <DialogDescription>
            Define qué vas a fabricar. Después podrás agregar sus componentes y cantidades.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-6"
          aria-busy={mutation.isPending}
          onSubmit={handleSubmit((value) =>
            mutation.mutate(value, {
              onSuccess: (bom) => void navigate('/production/boms/' + bom.id),
            }),
          )}
        >
          <fieldset disabled={mutation.isPending} className="space-y-6">
            <FormSection
              title="1. Identificación"
              description="Un nombre claro facilita encontrar la fórmula."
            >
              <FormField
                id="bom-name"
                label="Nombre de la fórmula"
                placeholder="Ej. Jabón neutro de 100 g"
                autoComplete="off"
                maxLength={120}
                error={errors.name?.message}
                {...register('name')}
              />
            </FormSection>
            <FormSection
              title="2. Producto de salida"
              description="Selecciona el producto que se obtiene al fabricar."
            >
              <Controller
                name="productId"
                control={control}
                render={({ field }) => (
                  <ProductPicker
                    label="Producto de salida"
                    output
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.productId?.message}
                  />
                )}
              />
            </FormSection>
            <FormSection title="3. Siguiente paso">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Al crear la fórmula abrirás su detalle. Allí podrás crear una versión con la
                cantidad de salida y los componentes necesarios. Crear la fórmula no mueve
                inventario.
              </p>
            </FormSection>
          </fieldset>
          <ErrorNotice error={mutation.error} />
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button disabled={mutation.isPending} type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? 'Creando fórmula…' : 'Crear fórmula'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BomsPage() {
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const session = useSession();
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const boms = useBoms(page, search, status);
  const pages = boms.data ? Math.max(1, Math.ceil(boms.data.meta.total / boms.data.meta.limit)) : 1;
  const hasFilters = search !== '' || status !== 'all';

  const clearFilters = () => {
    setInput('');
    setSearch('');
    setStatus('all');
    setPage(1);
  };

  return (
    <section className="space-y-6">
      <PageHeader
        title="Fórmulas de producción"
        description="Define los productos que fabricas y consulta sus versiones de componentes y cantidades."
        breadcrumbs={[{ label: 'Producción' }, { label: 'Fórmulas' }]}
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Nueva fórmula
            </Button>
          )
        }
      />
      <form
        className="flex flex-wrap items-end gap-3 border-y py-4"
        role="search"
        aria-label="Buscar fórmulas"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <div className="min-w-0 flex-1 space-y-2 sm:min-w-64">
          <Label htmlFor="bom-search">Buscar fórmula</Label>
          <Input
            id="bom-search"
            type="search"
            placeholder="Nombre de la fórmula o producto"
            value={input}
            maxLength={100}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bom-status">Estado</Label>
          <select
            id="bom-status"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:min-w-36"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          <Search className="size-4" aria-hidden="true" />
          Buscar
        </Button>
        {(hasFilters || input) && (
          <Button type="button" variant="ghost" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        )}
      </form>
      {boms.isPending && <LoadingState label="Cargando fórmulas…" />}
      <ErrorNotice error={boms.error} />
      {boms.isError && (
        <Button variant="outline" disabled={boms.isFetching} onClick={() => void boms.refetch()}>
          Reintentar
        </Button>
      )}
      {boms.data && boms.data.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table aria-label="Fórmulas de producción">
            <TableHeader>
              <TableRow>
                <TableHead>Fórmula</TableHead>
                <TableHead>Producto de salida</TableHead>
                <TableHead>Versión activa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boms.data.data.map((bom) => {
                const activeVersion = bom.versions.find((version) => version.isActive);
                return (
                  <TableRow key={bom.id}>
                    <TableCell className="min-w-44 whitespace-normal font-medium">
                      <Link
                        className="underline-offset-4 hover:underline"
                        to={'/production/boms/' + bom.id}
                      >
                        {bom.name}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-44 whitespace-normal">
                      <p className="font-medium">{bom.product.name}</p>
                      <p className="text-xs text-muted-foreground">{bom.product.code}</p>
                    </TableCell>
                    <TableCell>
                      {activeVersion ? 'Versión ' + activeVersion.version : 'Sin versión activa'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={bom.isActive} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={'/production/boms/' + bom.id}
                          aria-label={'Ver fórmula ' + bom.name}
                        >
                          Ver detalle <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {boms.data?.data.length === 0 && (
        <EmptyState
          title={hasFilters ? 'No hay fórmulas que coincidan.' : 'Todavía no hay fórmulas'}
          description={
            hasFilters
              ? 'Prueba con otro nombre o estado.'
              : 'Crea una fórmula para definir qué producto vas a fabricar.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      )}
      {boms.data && (
        <Pagination
          page={page}
          pages={pages}
          total={boms.data.meta.total}
          label="fórmulas"
          onPageChange={setPage}
          busy={boms.isFetching}
          unavailable={boms.isError}
        />
      )}
      {canManage && creating && <CreateBomForm onClose={() => setCreating(false)} />}
    </section>
  );
}
