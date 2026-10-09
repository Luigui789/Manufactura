export interface Supplier {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// null deja sin dato un campo de contacto; el backend rechaza null en code y name.
export type CreateSupplierPayload = Pick<Supplier, 'code' | 'name'> &
  Partial<Pick<Supplier, 'taxId' | 'email' | 'phone' | 'address'>>;
export type UpdateSupplierPayload = Partial<CreateSupplierPayload>;
