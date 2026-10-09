import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SupplierFormData } from '../../schemas';
import { supplierSchema } from '../../schemas';
import { useCreateSupplier, useUpdateSupplier } from '../../hooks/useSuppliers';
import type { Supplier } from '../../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierToEdit?: Supplier | null;
}

export function SupplierDialogs({ open, onOpenChange, supplierToEdit }: Props) {
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const isEditing = !!supplierToEdit;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', phone: '', email: '', address: '' },
  });

  useEffect(() => {
    if (open) {
      if (supplierToEdit) {
        reset({
          name: supplierToEdit.name,
          phone: supplierToEdit.phone,
          email: supplierToEdit.email,
          address: supplierToEdit.address,
        });
      } else {
        reset({ name: '', phone: '', email: '', address: '' });
      }
    }
  }, [open, supplierToEdit, reset]);

  const onSubmit = async (data: SupplierFormData) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: supplierToEdit.id, payload: data });
      } else {
        await createMutation.mutateAsync(data);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error al guardar proveedor:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Razón Social</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <span className="text-red-500 text-sm">{errors.name.message}</span>}
          </div>
          <div>
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <span className="text-red-500 text-sm">{errors.email.message}</span>}
          </div>
          <div>
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" {...register('phone')} />
            {errors.phone && <span className="text-red-500 text-sm">{errors.phone.message}</span>}
          </div>
          <div>
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" {...register('address')} />
            {errors.address && (
              <span className="text-red-500 text-sm">{errors.address.message}</span>
            )}
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
