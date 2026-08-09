import { useEffect, useRef, useState } from 'react';
import { clearCart } from '@/stores/cart';

interface OrderConfirmationProps {
  // NOT named "ref" — React's createElement strips a prop literally named
  // `ref` before the component ever sees it (true for plain string props
  // too, not just actual DOM refs), so the SumUp payment reference is
  // passed as `paymentRef` throughout this island.
  paymentRef: string;
}

type SettleStatusResponse =
  | { status: 'pending' }
  | { status: 'paid'; orderName: string }
  | { status: 'retrying'; attempt: number }
  | { status: 'failed'; ref: string };

type ViewState =
  | { kind: 'missing-ref' }
  | { kind: 'polling' }
  | { kind: 'paid'; orderName: string }
  | { kind: 'unresolved' };

// Mirrors settleCheckout's own MAX_ATTEMPTS_BEFORE_FAILED bound (design A2:
// "poll is the retry engine, not SumUp") — the client stops polling and
// shows support copy at the same point the server would, whichever side
// gets there first.
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 5;

export function OrderConfirmation({ paymentRef }: OrderConfirmationProps) {
  const [state, setState] = useState<ViewState>(paymentRef ? { kind: 'polling' } : { kind: 'missing-ref' });
  const clearedCart = useRef(false);

  useEffect(() => {
    if (!paymentRef) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      attempt += 1;
      try {
        const response = await fetch(`/api/checkout/status?ref=${encodeURIComponent(paymentRef)}`);
        const result = (await response.json()) as SettleStatusResponse;
        if (cancelled) return;

        if (result.status === 'paid') {
          if (!clearedCart.current) {
            clearedCart.current = true;
            clearCart();
          }
          setState({ kind: 'paid', orderName: result.orderName });
          return;
        }

        if (result.status === 'failed' || attempt >= MAX_ATTEMPTS) {
          setState({ kind: 'unresolved' });
          return;
        }

        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        if (attempt >= MAX_ATTEMPTS) {
          setState({ kind: 'unresolved' });
          return;
        }
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentRef]);

  if (state.kind === 'missing-ref') {
    return (
      <div className="space-y-3">
        <p className="text-graphite">No pudimos identificar tu pago.</p>
        <a href="/" className="font-semibold text-rust underline">
          Volver a la tienda
        </a>
      </div>
    );
  }

  if (state.kind === 'polling') {
    return (
      <div className="space-y-3" aria-live="polite" aria-busy="true">
        <p className="text-graphite">Confirmando tu pago…</p>
      </div>
    );
  }

  if (state.kind === 'paid') {
    return (
      <div className="space-y-3">
        <p className="font-display text-lg font-bold text-graphite">¡Gracias por tu compra!</p>
        <p className="text-graphite">Tu pedido {state.orderName} ha sido confirmado.</p>
        <a href="/" className="font-semibold text-rust underline">
          Volver a la tienda
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-display text-lg font-bold text-graphite">Pago confirmado, pedido en proceso</p>
      <p className="text-graphite">
        Estamos generando tu pedido. Si no recibes la confirmación por email en unos minutos, contacta con soporte y
        facilita esta referencia:
      </p>
      <p className="rounded-tile bg-bone p-3 text-center font-mono text-sm text-graphite">{paymentRef}</p>
    </div>
  );
}
