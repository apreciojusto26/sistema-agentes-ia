import { useStore } from '@nanostores/react';
import { $cart } from '@/stores/cart';
import { $isCartOpen } from '@/stores/ui';

export function CartButton() {
  const cart = useStore($cart);
  const count = cart?.totalQuantity ?? 0;

  return (
    <button
      type="button"
      onClick={() => $isCartOpen.set(true)}
      aria-label={`Abrir carrito${count > 0 ? `, ${count} ${count === 1 ? 'artículo' : 'artículos'}` : ''}`}
      className="relative size-6 text-purple-800 motion-safe:transition hover:text-purple-700"
    >
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M7 4h-2a1 1 0 000 2h1.28l1.7 8.53A2 2 0 0010 16h7a2 2 0 001.95-1.56L20.7 8H6.16l-.4-2H7zm2 12a2 2 0 100 4 2 2 0 000-4zm8 0a2 2 0 100 4 2 2 0 000-4z"
        ></path>
      </svg>
      {count > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-pill bg-grape px-1 text-[0.625rem] font-black leading-none text-white tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
