import { storefront } from '@/lib/shopify/client';
import { moneyToCents } from '@/lib/shopify/money';
import { CART_CREATE, CART_LINES_ADD, CART_LINES_UPDATE, CART_QUERY } from '@/lib/shopify/queries';
import type { CartSnapshot } from '@/lib/shopify/types';

interface RawCart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { subtotalAmount: { amount: string }; totalAmount: { amount: string } };
  lines: {
    nodes: {
      id: string;
      quantity: number;
      merchandise: { id: string };
      discountAllocations: { discountedAmount: { amount: string } }[];
    }[];
  };
}

interface UserError {
  field: string[] | null;
  message: string;
}

function toSnapshot(cart: RawCart): CartSnapshot {
  const line = cart.lines.nodes[0] ?? null;
  const discountCents = line
    ? line.discountAllocations.reduce((sum, d) => sum + moneyToCents(d.discountedAmount.amount), 0)
    : 0;

  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity,
    subtotalCents: moneyToCents(cart.cost.subtotalAmount.amount),
    totalCents: moneyToCents(cart.cost.totalAmount.amount),
    discountCents,
    line: line ? { id: line.id, variantId: line.merchandise.id, quantity: line.quantity } : null,
  };
}

function assertNoUserErrors(userErrors: UserError[]): void {
  if (userErrors.length > 0) {
    throw new Error(`Cart mutation userErrors: ${userErrors.map((e) => e.message).join('; ')}`);
  }
}

export async function cartCreate(merchandiseId: string, quantity: number): Promise<CartSnapshot> {
  const data = await storefront<{
    cartCreate: { cart: RawCart | null; userErrors: UserError[] };
  }>(CART_CREATE, { lines: [{ merchandiseId, quantity }] });

  assertNoUserErrors(data.cartCreate.userErrors);
  if (!data.cartCreate.cart) throw new Error('cartCreate returned no cart');
  return toSnapshot(data.cartCreate.cart);
}

export async function cartLinesAdd(cartId: string, merchandiseId: string, quantity: number): Promise<CartSnapshot> {
  const data = await storefront<{
    cartLinesAdd: { cart: RawCart | null; userErrors: UserError[] };
  }>(CART_LINES_ADD, { cartId, lines: [{ merchandiseId, quantity }] });

  assertNoUserErrors(data.cartLinesAdd.userErrors);
  if (!data.cartLinesAdd.cart) throw new Error('cartLinesAdd returned no cart');
  return toSnapshot(data.cartLinesAdd.cart);
}

export async function cartLinesUpdate(
  cartId: string,
  lineId: string,
  merchandiseId: string,
  quantity: number,
): Promise<CartSnapshot> {
  const data = await storefront<{
    cartLinesUpdate: { cart: RawCart | null; userErrors: UserError[] };
  }>(CART_LINES_UPDATE, { cartId, lines: [{ id: lineId, merchandiseId, quantity }] });

  assertNoUserErrors(data.cartLinesUpdate.userErrors);
  if (!data.cartLinesUpdate.cart) throw new Error('cartLinesUpdate returned no cart');
  return toSnapshot(data.cartLinesUpdate.cart);
}

/** Returns null when the cart id is expired/completed (Shopify returns `cart: null`). */
export async function cartGet(id: string): Promise<CartSnapshot | null> {
  const data = await storefront<{ cart: RawCart | null }>(CART_QUERY, { id });
  return data.cart ? toSnapshot(data.cart) : null;
}
