import { useEffect, useRef, useState } from 'react';
import { $cart, clearCart } from '@/stores/cart';
import { centsToUnits, trackEvent } from '@/lib/analytics';
import { product } from '@/data/product';
import { ICONS } from '@/lib/icons';
import { trackCheckoutEvent } from '@/lib/telemetry/client';

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

  // Closes the trail: reaching this page proves the buyer came back from the
  // widget on the same origin.
  useEffect(() => {
    trackCheckoutEvent('checkout_thankyou_loaded', {
      phase: 'gracias',
      ...(paymentRef ? { ref: paymentRef } : { detail: 'missing-ref' }),
    });
  }, [paymentRef]);

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
            // Cart snapshot read BEFORE clearCart() — value/items are gone once it clears.
            const cart = $cart.get();
            if (cart?.line) {
              trackEvent('purchase', {
                transaction_id: result.orderName,
                currency: 'EUR',
                value: centsToUnits(cart.totalCents),
                items: [{ item_id: cart.line.variantId, item_name: product.name, quantity: cart.line.quantity }],
              });
            }
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
      <div className="rounded-card bg-white p-6 text-center shadow-lift sm:p-8">
        <h1 className="font-display text-xl font-extrabold text-graphite">No pudimos identificar tu pago</h1>
        <p className="mt-2 text-sm text-steel">
          Esta página necesita la referencia del pago. Si acabas de comprar y llegaste aquí sin ella, revisa tu email:
          la confirmación del pedido va camino a tu bandeja.
        </p>
        <a
          href="/"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-pill border-2 border-graphite/15 px-6 font-display text-sm font-bold text-graphite transition hover:bg-graphite/5"
        >
          Volver a la tienda
        </a>
      </div>
    );
  }

  if (state.kind === 'polling') {
    return (
      <div className="rounded-card bg-white p-6 text-center shadow-lift sm:p-8" aria-live="polite" aria-busy="true">
        <div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-grape-tint border-t-grape" />
        <p className="mt-4 font-display text-lg font-bold text-graphite">Confirmando tu pago…</p>
        <p className="mt-1 text-sm text-steel">Un segundo, no cierres esta página.</p>
      </div>
    );
  }

  if (state.kind === 'paid') {
    return (
      <div className="rounded-card bg-white p-6 text-center shadow-lift sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-tint">
          <svg viewBox={ICONS.check.viewBox} className="size-7 text-success" aria-hidden="true">
            <path fill="currentColor" d={ICONS.check.path} />
          </svg>
        </div>

        <h1 className="mt-4 font-display text-2xl font-extrabold leading-tight text-graphite">
          ¡Gracias por tu compra!
        </h1>
        <p className="mt-2 text-sm text-steel">
          Tu pago se confirmó correctamente y ya estamos preparando tu pedido.
        </p>

        <div className="mt-5 rounded-tile bg-bone px-4 py-3">
          <p className="text-eyebrow font-bold uppercase text-steel">Número de pedido</p>
          <p className="mt-0.5 font-display text-xl font-extrabold tabular-nums text-graphite">{state.orderName}</p>
        </div>

        {/* The three questions every buyer has the second after paying —
            answered here so nobody has to email support to ask them. */}
        <ol className="mt-6 space-y-4 text-left">
          {[
            {
              title: 'Confirmación por email',
              text: 'Te acabamos de enviar el resumen de tu pedido. Revisa también la carpeta de spam.',
            },
            {
              title: 'Preparamos tu envío',
              text: `Empaquetamos tu ${product.brand} y te avisamos en cuanto salga.`,
            },
            { title: 'Llega a tu casa', text: product.shipping.etaLabel + ', con envío gratis a España.' },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-grape-tint font-display text-xs font-bold text-grape">
                {index + 1}
              </span>
              <div>
                <p className="font-display text-sm font-bold text-graphite">{step.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-steel">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <a
          href="/"
          className="mt-7 flex h-12 w-full items-center justify-center rounded-pill bg-grape px-6 font-display text-sm font-bold tracking-wide text-white shadow-lift transition active:scale-[.99] hover:bg-grape-dark"
        >
          Volver a la tienda
        </a>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[0.6875rem] font-medium text-steel">
          <ConfirmationTrustItem icon="lock">Pago seguro</ConfirmationTrustItem>
          <ConfirmationTrustItem icon="truck">Envío gratis a España</ConfirmationTrustItem>
          <ConfirmationTrustItem icon="shield">{product.guarantee.title}</ConfirmationTrustItem>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-white p-6 text-center shadow-lift sm:p-8">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gold-tint">
        <svg viewBox={ICONS.clock.viewBox} className="size-7 text-gold" aria-hidden="true">
          <path fill="currentColor" d={ICONS.clock.path} />
        </svg>
      </div>
      <h1 className="mt-4 font-display text-2xl font-extrabold leading-tight text-graphite">
        Pago confirmado, pedido en proceso
      </h1>
      {/* Money HAS left the buyer's account here — lead with that reassurance
          before asking them to do anything. */}
      <p className="mt-2 text-sm text-steel">
        Tu pago se registró correctamente. Estamos generando el pedido y recibirás la confirmación por email en unos
        minutos.
      </p>
      <div className="mt-5 rounded-tile bg-bone px-4 py-3">
        <p className="text-eyebrow font-bold uppercase text-steel">Referencia para soporte</p>
        <p className="mt-0.5 break-all font-mono text-sm text-graphite">{paymentRef}</p>
      </div>
      <p className="mt-3 text-sm text-steel">
        Si no recibes el email, escríbenos con esta referencia y lo resolvemos.
      </p>
      <a
        href="/"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-pill border-2 border-graphite/15 px-6 font-display text-sm font-bold text-graphite transition hover:bg-graphite/5"
      >
        Volver a la tienda
      </a>
    </div>
  );
}

function ConfirmationTrustItem({
  icon,
  children,
}: {
  icon: 'lock' | 'truck' | 'shield';
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg viewBox={ICONS[icon].viewBox} className="size-3.5 text-grape" aria-hidden="true">
        <path fill="currentColor" d={ICONS[icon].path} />
      </svg>
      {children}
    </span>
  );
}
