import { useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $cart, $cartStatus, checkout, syncCartLine } from '@/stores/cart';
import { $isCartOpen } from '@/stores/ui';
import { PlaceholderShot } from '@/components/islands/parts/PlaceholderShot';
import { formatPrice } from '@/lib/format';
import { product } from '@/data/product';
import type { ProductCommerce } from '@/lib/shopify/types';

interface CartDrawerProps {
  commerce: ProductCommerce;
}

export function CartDrawer({ commerce }: CartDrawerProps) {
  const isOpen = useStore($isCartOpen);
  const cart = useStore($cart);
  const cartStatus = useStore($cartStatus);

  const close = useCallback(() => $isCartOpen.set(false), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  const count = cart?.totalQuantity ?? 0;
  const isPending = cartStatus === 'creating' || cartStatus === 'updating' || cartStatus === 'restoring';

  const line = cart?.line ?? null;
  const variant = line
    ? commerce.variants.find((v) => v.id === line.variantId) ?? commerce.variants[0]
    : null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm cursor-pointer"
        onClick={close}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carrito"
        className="fixed inset-y-0 right-0 flex w-full max-w-sm flex-col bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-graphite/10 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-graphite">
            Carrito{' '}
            {count > 0 && (
              <span className="text-sm font-normal text-steel tabular-nums">({count})</span>
            )}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar carrito"
            className="rounded-tile p-1.5 text-steel transition hover:bg-bone-dim hover:text-graphite"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!line || !variant ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
                className="mb-3 size-12 text-steel/30"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                />
              </svg>
              <p className="text-sm text-steel">Tu carrito está vacío</p>
              <a
                href="/#buy"
                onClick={close}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-pill bg-rust px-5 font-display text-sm font-bold tracking-wide text-white shadow-lift transition hover:bg-rust-dark"
              >
                Ver el producto
              </a>
            </div>
          ) : (
            <div>
              <div className="flex gap-4 rounded-tile border border-graphite/10 bg-surface p-3 shadow-card">
                <div className="size-20 shrink-0 overflow-hidden rounded-tile bg-bone-dim">
                  {variant.imageIndex !== null && commerce.images[variant.imageIndex] ? (
                    <img
                      src={commerce.images[variant.imageIndex]!.url}
                      alt={commerce.images[variant.imageIndex]!.altText ?? commerce.title}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <PlaceholderShot ratio="1/1" alt={commerce.title} rounded="rounded-tile" className="size-full" />
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1.5">
                  <p className="text-sm font-semibold text-graphite">{variant.title}</p>
                  <p className="text-sm font-bold text-rust tabular-nums">{formatPrice(variant.unitPriceCents)}</p>

                  <div className="mt-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void syncCartLine(line.variantId, line.quantity - 1)}
                      disabled={isPending}
                      aria-label="Disminuir cantidad"
                      className="flex size-7 items-center justify-center rounded-lg border border-graphite/10 text-sm text-steel transition hover:bg-bone-dim hover:text-graphite disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      −
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-medium text-graphite tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => void syncCartLine(line.variantId, line.quantity + 1)}
                      disabled={isPending}
                      aria-label="Aumentar cantidad"
                      className="flex size-7 items-center justify-center rounded-lg border border-graphite/10 text-sm text-steel transition hover:bg-bone-dim hover:text-graphite disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => void syncCartLine(line.variantId, 0)}
                      disabled={isPending}
                      aria-label="Eliminar del carrito"
                      className="ml-auto text-xs font-medium text-rust transition hover:text-rust-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {cart && line && variant && (
          <div className="border-t border-graphite/10 bg-bone p-5">
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-steel">Subtotal</dt>
                <dd className="font-medium text-graphite tabular-nums">{formatPrice(cart.subtotalCents)}</dd>
              </div>
              {cart.discountCents > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-steel">Descuento</dt>
                  <dd className="font-medium text-gold tabular-nums">−{formatPrice(cart.discountCents)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-graphite/10 pt-2">
                <dt className="font-display font-bold text-graphite">Total</dt>
                <dd className="font-display text-lg font-extrabold text-graphite tabular-nums">
                  {formatPrice(cart.totalCents)}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={checkout}
              disabled={isPending}
              aria-busy={isPending}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-rust px-6 font-display text-base font-bold tracking-wide text-white shadow-lift transition active:scale-[.99] hover:bg-rust-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? product.cta.pending : product.cta.checkout}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
