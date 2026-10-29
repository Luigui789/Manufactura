import { Link } from 'react-router';
import type { BusinessReference as Reference } from '../api/inventory-data';

export function BusinessReference({ reference }: { reference: Reference }) {
  if (!reference) return <span>—</span>;
  if (reference.type === 'PRODUCTION_ORDER')
    return (
      <Link className="underline" to={`/production/orders/${reference.id}`}>
        {reference.number}
      </Link>
    );
  if (reference.type === 'SALE_DISPATCH')
    return (
      <Link
        className="underline"
        title={reference.saleOrder.number}
        to={`/sales/orders/${reference.saleOrder.id}`}
      >
        {reference.number} · {reference.saleOrder.number} · {reference.saleOrder.customer.code}{' '}
        {reference.saleOrder.customer.name}
      </Link>
    );
  return (
    <Link
      className="underline"
      title={reference.purchaseOrder.number}
      to={`/purchases/orders/${reference.purchaseOrder.id}`}
    >
      {reference.number}
      <span className="sr-only"> · {reference.purchaseOrder.number}</span>
    </Link>
  );
}
