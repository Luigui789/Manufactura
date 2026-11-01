import type { Product } from './types';

export const PRODUCT_TYPE_LABELS: Record<Product['type'], string> = {
  RAW_MATERIAL: 'Materia prima',
  INTERMEDIATE: 'Producto intermedio',
  FINISHED_GOOD: 'Producto terminado',
  CONSUMABLE: 'Consumible',
};

export const PRODUCT_UNIT_LABELS: Record<Product['unit'], string> = {
  UNIT: 'Unidad',
  GRAM: 'Gramo',
  KILOGRAM: 'Kilogramo',
  MILLILITER: 'Mililitro',
  LITER: 'Litro',
};
