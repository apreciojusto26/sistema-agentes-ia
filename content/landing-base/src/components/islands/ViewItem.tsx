// The page-view event, behind consent.
//
// It used to be an `is:inline` script in index.astro calling window.gtag
// directly on load — which fired for every visitor the moment GA existed,
// because GA existed from first paint. Now it REGISTERS the payload and the
// loader decides when, or whether, it is sent.
//
// EXACTLY ONCE, on both paths that can reach it:
//   already accepted on arrival -> syncAnalytics() sends it during mount
//   accepted mid-session        -> syncAnalytics() sends it on the decision
// Both go through the same `viewItemSent` latch in analytics-loader.ts, so
// there is no path that produces two.
//
// Rejected or unknown: never sent, and never queued for later. Consent is not
// retroactive.
import { useEffect } from 'react';
import { registerViewItem } from '@/lib/analytics-loader';

interface ViewItemProps {
  itemId: string;
  itemName: string;
  price: number;
  currency: string;
}

export function ViewItem({ itemId, itemName, price, currency }: ViewItemProps) {
  useEffect(() => {
    registerViewItem({
      currency,
      value: price,
      items: [{ item_id: itemId, item_name: itemName, price, quantity: 1 }],
    });
  }, [itemId, itemName, price, currency]);

  return null;
}
