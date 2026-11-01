/**
 * C5 — Dataset oficial de demostración EcoSoap. Única fuente de verdad del dataset:
 * códigos, cantidades y supuestos se definen aquí y en ningún otro archivo.
 *
 * Origen de los datos (ver docs/demo-dataset.md):
 * - Jabón en barra, aceite filtrado y sus rutas: documentados en
 *   docs/multilevel-manufacturing.md y docs/production-routes.md.
 * - Jabón líquido: SUPUESTO ACADÉMICO DEL CASO ECOSOAP. No existe formulación,
 *   presentación ni tiempos documentados en la Entrega 1.
 * - Factores de emisión: supuestos académicos ilustrativos, sin fuente externa.
 */
import type {
  CarbonActivityCategory,
  CarbonActivityUnit,
  ProductType,
  RoleCode,
  UnitOfMeasure,
} from '../generated/prisma/client.js';

export const DEMO_DATASET_LOCK_KEY = 'ecosoap:demo-dataset:v1';
/** Marca de idempotencia del stock inicial: InventoryMovement.requestId. */
export const DEMO_INITIAL_STOCK_MARKER = 'ecosoap-demo-initial-stock-v1';
export const DEMO_WAREHOUSE_CODE = 'ALM-PRINCIPAL';
export const DEMO_PASSWORD_ENV = 'DEMO_USER_PASSWORD';

export type DemoUser = { email: string; fullName: string; role: RoleCode };
export const DEMO_USERS: readonly DemoUser[] = [
  { email: 'admin.demo@ecosoap.test', fullName: 'Demo Administración', role: 'ADMIN' },
  { email: 'compras.demo@ecosoap.test', fullName: 'Demo Compras', role: 'COMPRAS' },
  { email: 'inventario.demo@ecosoap.test', fullName: 'Demo Inventario', role: 'INVENTARIO' },
  { email: 'produccion.demo@ecosoap.test', fullName: 'Demo Producción', role: 'PRODUCCION' },
  { email: 'ventas.demo@ecosoap.test', fullName: 'Demo Ventas', role: 'VENTAS' },
];

export type DemoProduct = {
  code: string;
  name: string;
  category: string;
  type: ProductType;
  unit: UnitOfMeasure;
  isLotTracked: boolean;
  requiresQualityInspection: boolean;
};
const product = (
  code: string,
  name: string,
  category: string,
  type: ProductType,
  unit: UnitOfMeasure,
  isLotTracked = false,
  requiresQualityInspection = false,
): DemoProduct => ({ code, name, category, type, unit, isLotTracked, requiresQualityInspection });

export const P = {
  ACU: 'MP-ACU',
  ACU_FIL: 'INT-ACU-FIL',
  NAOH: 'MP-NAOH',
  WATER: 'MP-AGUA',
  ESSENCE: 'MP-ESENCIA',
  BAR: 'PT-JABON-500',
  // Sin volumen en el código: la presentación del jabón líquido no está documentada.
  LIQUID: 'PT-JABON-LIQ',
  BOTTLE: 'ENV-BOTELLA-LIQ',
  CAP: 'ENV-TAPA-LIQ',
  LABEL: 'ENV-ETIQ-LIQ',
} as const;

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  product(
    P.ACU,
    'Aceite de cocina usado recibido',
    'Materia prima reciclada',
    'RAW_MATERIAL',
    'MILLILITER',
    true,
  ),
  product(
    P.ACU_FIL,
    'Aceite de cocina usado filtrado',
    'Producto intermedio',
    'INTERMEDIATE',
    'MILLILITER',
    true,
  ),
  product(P.NAOH, 'Soda cáustica', 'Materia prima', 'RAW_MATERIAL', 'GRAM'),
  product(P.WATER, 'Agua', 'Materia prima', 'RAW_MATERIAL', 'MILLILITER'),
  product(P.ESSENCE, 'Esencia aromática', 'Materia prima', 'RAW_MATERIAL', 'MILLILITER'),
  product(
    P.BAR,
    'Jabón ecológico EcoSoap 500 g',
    'Producto terminado',
    'FINISHED_GOOD',
    'UNIT',
    true,
    true,
  ),
  product(
    P.LIQUID,
    'Jabón líquido EcoSoap',
    'Producto terminado',
    'FINISHED_GOOD',
    'UNIT',
    true,
    true,
  ),
  product(P.BOTTLE, 'Botella para jabón líquido', 'Material de empaque', 'CONSUMABLE', 'UNIT'),
  product(P.CAP, 'Tapa para jabón líquido', 'Material de empaque', 'CONSUMABLE', 'UNIT'),
  product(P.LABEL, 'Etiqueta EcoSoap jabón líquido', 'Material de empaque', 'CONSUMABLE', 'UNIT'),
];

export type DemoParty = { code: string; name: string };
/** Organizaciones ficticias; ninguna corresponde a una empresa real. */
export const DEMO_SUPPLIERS: readonly DemoParty[] = [
  { code: 'SUP-ACU-001', name: 'Red de Recolección de Aceite EcoSoap' },
  { code: 'SUP-INS-001', name: 'Proveedor de Insumos EcoSoap' },
  { code: 'SUP-ENV-001', name: 'Proveedor de Envases EcoSoap' },
];
export const DEMO_CUSTOMERS: readonly DemoParty[] = [
  { code: 'CLI-VERDE-001', name: 'Distribuidora Verde Demo' },
  { code: 'CLI-ECOVIDA-001', name: 'Tienda EcoVida Demo' },
];

export type DemoBom = {
  productCode: string;
  name: string;
  outputQuantity: string;
  items: readonly { productCode: string; quantity: string }[];
};
export const DEMO_BOMS: readonly DemoBom[] = [
  {
    productCode: P.ACU_FIL,
    name: 'BOM Aceite filtrado',
    outputQuantity: '1000',
    items: [{ productCode: P.ACU, quantity: '1000' }],
  },
  {
    // Documentado en docs/multilevel-manufacturing.md §10. La barra no tiene empaque
    // físico documentado, por eso su BOM no incluye material de empaque.
    productCode: P.BAR,
    name: 'BOM Jabón ecológico EcoSoap 500 g',
    outputQuantity: '1',
    items: [
      { productCode: P.ACU_FIL, quantity: '500' },
      { productCode: P.NAOH, quantity: '70' },
      { productCode: P.WATER, quantity: '180' },
      { productCode: P.ESSENCE, quantity: '5' },
    ],
  },
  {
    // SUPUESTO ACADÉMICO DEL CASO ECOSOAP: formulación de demostración sustituible.
    // Reutiliza los insumos documentados del caso (no agrega químicos externos) con
    // proporciones propias del líquido; el empaque físico es parte del BOM.
    productCode: P.LIQUID,
    name: 'BOM Jabón líquido EcoSoap',
    outputQuantity: '1',
    items: [
      { productCode: P.ACU_FIL, quantity: '150' },
      { productCode: P.NAOH, quantity: '20' },
      { productCode: P.WATER, quantity: '300' },
      { productCode: P.ESSENCE, quantity: '3' },
      { productCode: P.BOTTLE, quantity: '1' },
      { productCode: P.CAP, quantity: '1' },
      { productCode: P.LABEL, quantity: '1' },
    ],
  },
];

export type DemoRoute = {
  productCode: string;
  code: string;
  name: string;
  /** true: minutos estimados para simulación académica, no medidos. */
  estimatedTimes: boolean;
  operations: readonly { sequence: number; name: string; standardMinutes: string }[];
};
const op = (sequence: number, name: string, standardMinutes: string) => ({
  sequence,
  name,
  standardMinutes,
});
export const DEMO_ROUTES: readonly DemoRoute[] = [
  {
    productCode: P.ACU_FIL,
    code: 'RT-ACU-FIL',
    name: 'Ruta de filtración de aceite usado',
    estimatedTimes: true,
    operations: [op(10, 'Recepción / preparación', '10'), op(20, 'Filtración', '20')],
  },
  {
    productCode: P.BAR,
    code: 'RT-JABON-500',
    name: 'Ruta Jabón EcoSoap 500 g',
    estimatedTimes: false,
    operations: [
      op(10, 'Mezclado', '15'),
      op(20, 'Moldeado', '10'),
      op(30, 'Curado / secado', '21600'),
      op(40, 'Inspección final', '5'),
      op(50, 'Empaque', '5'),
    ],
  },
  {
    productCode: P.LIQUID,
    code: 'RT-JABON-LIQ',
    name: 'Ruta Jabón Líquido EcoSoap',
    estimatedTimes: true,
    operations: [
      op(10, 'Preparación / dosificación', '15'),
      op(20, 'Mezclado', '30'),
      op(30, 'Homogeneización / reposo', '120'),
      op(40, 'Inspección del producto a granel', '10'),
      op(50, 'Llenado / embotellado', '20'),
      op(60, 'Tapado', '5'),
      op(70, 'Etiquetado', '5'),
      op(80, 'Inspección final', '5'),
      op(90, 'Empaque', '10'),
    ],
  },
];

/**
 * Stock inicial por ledger (ADJUSTMENT_IN / INITIAL_LOAD). Aceite usado, aceite filtrado
 * y terminados inician en cero: se obtienen con compra y órdenes reales.
 */
export const DEMO_INITIAL_STOCK: readonly { productCode: string; quantity: string }[] = [
  { productCode: P.NAOH, quantity: '20000' },
  { productCode: P.WATER, quantity: '50000' },
  { productCode: P.ESSENCE, quantity: '2000' },
  { productCode: P.BOTTLE, quantity: '50' },
  { productCode: P.CAP, quantity: '50' },
  { productCode: P.LABEL, quantity: '50' },
];
export const DEMO_ZERO_START = [P.ACU, P.ACU_FIL, P.BAR, P.LIQUID] as const;

/** Guion oficial de la defensa (cantidades de referencia, no se seedean). */
export const BAR_DEMO_FLOW = {
  purchaseUsedOil: '10000',
  filterOrder: '5000',
  barOrderUnits: '10',
} as const;
/** Lote de demostración del jabón líquido: 10 unidades (consumo derivado del BOM). */
export const LIQUID_DEMO_BATCH = { units: '10', filterOrder: '1500' } as const;

/** Proceso de simulación IIoT existente por producto terminado. */
export const DEMO_IIOT_PROCESS = { [P.BAR]: 'bar', [P.LIQUID]: 'liquid' } as const;

export type DemoFactor = {
  code: string;
  name: string;
  category: CarbonActivityCategory;
  activityUnit: CarbonActivityUnit;
  kgCo2ePerUnit: string;
  productCode: string | null;
};
export const DEMO_FACTOR_SOURCE = {
  sourceName: 'Supuesto académico EcoSoap',
  sourceReference:
    'docs/demo-dataset.md — valor ilustrativo de demostración, sin fuente externa; no representa un dato ambiental real',
} as const;
export const DEMO_FACTORS: readonly DemoFactor[] = [
  {
    code: 'DEMO-ACU',
    name: 'Aceite usado recibido (recolección)',
    category: 'RAW_MATERIAL',
    activityUnit: 'LITER',
    kgCo2ePerUnit: '0.05000000',
    productCode: P.ACU,
  },
  {
    code: 'DEMO-ACU-FIL',
    name: 'Aceite usado filtrado (manejo interno)',
    category: 'RAW_MATERIAL',
    activityUnit: 'LITER',
    kgCo2ePerUnit: '0.02000000',
    productCode: P.ACU_FIL,
  },
  {
    code: 'DEMO-NAOH',
    name: 'Soda cáustica',
    category: 'RAW_MATERIAL',
    activityUnit: 'KILOGRAM',
    kgCo2ePerUnit: '1.50000000',
    productCode: P.NAOH,
  },
  {
    code: 'DEMO-WATER',
    name: 'Agua de proceso',
    category: 'RAW_MATERIAL',
    activityUnit: 'LITER',
    kgCo2ePerUnit: '0.00100000',
    productCode: P.WATER,
  },
  {
    code: 'DEMO-ESSENCE',
    name: 'Esencia aromática',
    category: 'RAW_MATERIAL',
    activityUnit: 'LITER',
    kgCo2ePerUnit: '2.00000000',
    productCode: P.ESSENCE,
  },
  {
    code: 'DEMO-BOTTLE',
    name: 'Botella de jabón líquido',
    category: 'PACKAGING',
    activityUnit: 'UNIT',
    kgCo2ePerUnit: '0.08000000',
    productCode: P.BOTTLE,
  },
  {
    code: 'DEMO-CAP',
    name: 'Tapa de jabón líquido',
    category: 'PACKAGING',
    activityUnit: 'UNIT',
    kgCo2ePerUnit: '0.02000000',
    productCode: P.CAP,
  },
  {
    code: 'DEMO-LABEL',
    name: 'Etiqueta de jabón líquido',
    category: 'PACKAGING',
    activityUnit: 'UNIT',
    kgCo2ePerUnit: '0.00500000',
    productCode: P.LABEL,
  },
  {
    code: 'DEMO-ELECTRICITY',
    name: 'Electricidad de proceso (registro manual)',
    category: 'ENERGY',
    activityUnit: 'KWH',
    kgCo2ePerUnit: '0.50000000',
    productCode: null,
  },
];

export const DEMO_CIRCULAR_PROFILE = {
  productCode: P.ACU_FIL,
  metricCode: 'USED_COOKING_OIL_RECOVERED',
  displayName: 'Aceite de cocina usado valorizado',
  reportingUnit: 'LITER',
} as const satisfies { reportingUnit: CarbonActivityUnit } & Record<string, string>;
