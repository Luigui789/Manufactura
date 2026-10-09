export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateSupplierPayload = Omit<Supplier, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>;
export type UpdateSupplierPayload = Partial<CreateSupplierPayload>;
