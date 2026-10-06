import { z } from 'zod';
import { warehouseSchema, createWarehouseSchema } from './schemas';

export type Warehouse = z.infer<typeof warehouseSchema>;
export type CreateWarehouseData = z.infer<typeof createWarehouseSchema>;
