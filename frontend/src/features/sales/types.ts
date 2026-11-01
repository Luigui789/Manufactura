export interface Customer {
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
export type CreateCustomerPayload = Pick<Customer, 'code' | 'name'> &
  Partial<Pick<Customer, 'taxId' | 'email' | 'phone' | 'address'>>;
export type UpdateCustomerPayload = Partial<CreateCustomerPayload>;
