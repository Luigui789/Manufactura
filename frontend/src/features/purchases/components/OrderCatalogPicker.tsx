import type { ComponentProps } from 'react';
import { CatalogPicker } from '@/components/CatalogPicker';

export function OrderCatalogPicker(props: ComponentProps<typeof CatalogPicker>) {
  if (props.kind === 'product' && !props.productType) {
    return (
      <CatalogPicker
        {...props}
        productType="RAW_MATERIAL"
        productTypeOptions={['RAW_MATERIAL', 'CONSUMABLE']}
      />
    );
  }

  return <CatalogPicker {...props} />;
}
