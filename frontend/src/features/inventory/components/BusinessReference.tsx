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
  return <span title={reference.purchaseOrder.number}>{reference.number}</span>;
}
