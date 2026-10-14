import { expect, it } from 'vitest';
import { purchaseOrigin, purchaseBusinessReference } from './purchase-origin.js';

it('keeps adjustment references null but refuses to hide a missing receipt relation', () => {
  expect(purchaseOrigin(null, null)).toBeNull();
  expect(purchaseBusinessReference(null, null)).toBeNull();
  expect(() => purchaseOrigin(null, 'receipt-item')).toThrow('origin relation is missing');
  expect(() => purchaseBusinessReference(null, 'receipt-item')).toThrow(
    'origin relation is missing',
  );
});
