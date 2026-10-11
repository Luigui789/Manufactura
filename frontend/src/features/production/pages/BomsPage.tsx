import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <form
      noValidate
      className="space-y-4 rounded border p-4"
      onSubmit={handleSubmit((value) =>
        mutation.mutate(value, { onSuccess: (bom) => void navigate('/production/boms/' + bom.id) }),
      )}
    >
      <h2 className="text-lg font-semibold">Nueva fórmula</h2>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <FormField
          id="bom-name"
          label="Nombre de la fórmula"
          error={errors.name?.message}
          {...register('name')}
        />
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
      </fieldset>
      <ErrorNotice error={mutation.error} />
      <div className="flex gap-2">
        <Button disabled={mutation.isPending} type="submit">
          Crear fórmula
        </Button>
        <Button disabled={mutation.isPending} type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
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
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Fórmulas de producción</h1>
      <p>Versiones de componentes y cantidades para fabricar un producto.</p>
      {canManage && !creating && <Button onClick={() => setCreating(true)}>Nueva fórmula</Button>}
      {canManage && creating && <CreateBomForm onClose={() => setCreating(false)} />}
      <form
        className="flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Buscar fórmulas"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <div>
          <Label htmlFor="bom-search">Buscar fórmula</Label>
          <Input
            id="bom-search"
            value={input}
            maxLength={100}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="bom-status">Estado</Label>
          <select
            id="bom-status"
            className="h-9 rounded border px-3"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {boms.isPending && <p role="status">Cargando fórmulas…</p>}
      <ErrorNotice error={boms.error} />
      {boms.isError && (
        <Button variant="outline" onClick={() => void boms.refetch()}>
          Reintentar
        </Button>
      )}
      <ul className="space-y-3">
        {boms.data?.data.map((bom) => (
          <li key={bom.id} className="rounded border p-4">
            <Link className="font-medium underline" to={'/production/boms/' + bom.id}>
              {bom.name}
            </Link>
            <p>
              {bom.product.code} · {bom.product.name} · {bom.isActive ? 'Activa' : 'Inactiva'}
            </p>
            <p>
              {bom.versions.find((v) => v.isActive)
                ? 'Versión activa: ' + bom.versions.find((v) => v.isActive)?.version
                : 'Sin versión activa'}
            </p>
          </li>
        ))}
      </ul>
      {boms.data?.data.length === 0 && <p>No hay fórmulas que coincidan.</p>}
      <nav aria-label="Paginación de fórmulas" className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={page <= 1 || boms.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page} de {pages}
        </span>
        <Button
          variant="outline"
          disabled={!boms.data || boms.isError || boms.isFetching || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </nav>
    </section>
  );
}
