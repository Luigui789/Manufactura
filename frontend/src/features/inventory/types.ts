import { z } from 'zod';
import {
  warehouseSchema,
  createWarehouseSchema,
  productSchema,
  createProductSchema,
} from './schemas';

export type Warehouse = z.infer<typeof warehouseSchema>;
export type CreateWarehouseData = z.infer<typeof createWarehouseSchema>;

export type WarehouseFilters = {
  isActive?: boolean;
  search?: string;
};

export type Product = z.infer<typeof productSchema>;
export type CreateProductData = z.infer<typeof createProductSchema>;
export type UpdateProductData = Partial<CreateProductData>;

export type ProductFilters = {
  isActive?: boolean;
  type?: Product['type'];
  search?: string;
};
