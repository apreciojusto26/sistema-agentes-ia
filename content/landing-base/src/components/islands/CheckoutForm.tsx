import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $cart } from '@/stores/cart';
import { formatPrice } from '@/lib/format';
import { validateCheckoutForm, type CheckoutFormData, type CheckoutFormField } from '@/lib/checkout/validation';
import type { ProductCommerce } from '@/lib/shopify/types';

interface CheckoutFormProps {
  commerce: ProductCommerce;
}

const SUMUP_SDK_URL = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';
const WIDGET_CONTAINER_ID = 'sumup-card';

const EMPTY_FORM: CheckoutFormData = {
  email: '',
  phone: '',
  address: {
    firstName: '',
    lastName: '',
    address1: '',
    address2: '',
    city: '',
    provinceCode: '',
    countryCode: 'ES',
    zip: '',
  },
};

// SumUp's SDK types onResponse `success` as ok — but SumUp's own docs warn
// this does NOT guarantee the transaction succeeded. The real source of
// truth is the status poll on /checkout/gracias, not this callback (batch-1
// verified fact, see tasks #337 5.2). This is purely "did the widget itself
// think it succeeded enough to navigate the buyer onward".
type SumUpResponseType = 'sent' | 'invalid' | 'auth-screen' | 'error' | 'success' | 'fail';

interface SumUpCardInstance {
  unmount?: () => void;
}

declare global {
  interface Window {
    SumUpCard?: {
      mount: (options: {
        checkoutId: string;
        id: string;
        onResponse: (type: SumUpResponseType, body: unknown) => void;
      }) => SumUpCardInstance;
    };
  }
}

let sumUpScriptPromise: Promise<void> | null = null;

function loadSumUpScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.SumUpCard) return Promise.resolve();
  if (sumUpScriptPromise) return sumUpScriptPromise;

  sumUpScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SUMUP_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar el widget de pago de SumUp.'));
    document.head.appendChild(script);
  });

  return sumUpScriptPromise;
}

type Phase = 'form' | 'creating-session' | 'widget' | 'processing';

export function CheckoutForm({ commerce }: CheckoutFormProps) {
  const cart = useStore($cart);
  const [form, setForm] = useState<CheckoutFormData>(EMPTY_FORM);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const widgetInstance = useRef<SumUpCardInstance | undefined>(undefined);

  const validation = useMemo(() => validateCheckoutForm(form), [form]);
  const fieldErrors = attemptedSubmit && !validation.valid ? validation.errors : {};

  const line = cart?.line ?? null;
  const variant = line ? commerce.variants.find((v) => v.id === line.variantId) : undefined;
  // catalog.ts asserts currencyCode === 'EUR' at build (throws otherwise), so
  // this branch is a belt-and-suspenders guard, not the common path (spec
  // sumup-payment: "Non-EUR cart rejected pre-widget").
  const unsupportedCurrency = commerce.currencyCode !== 'EUR';

  function updateField(field: 'email' | 'phone', value: string): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateAddressField(field: keyof CheckoutFormData['address'], value: string): void {
    setForm((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));
  }

  function fieldError(field: CheckoutFormField): string | undefined {
    return fieldErrors[field];
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAttemptedSubmit(true);
    setErrorMessage(null);

    if (!validation.valid || !cart || !line) return;

    setPhase('creating-session');
    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId: cart.id, email: form.email, phone: form.phone, address: form.address }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; errors?: Partial<Record<CheckoutFormField, string>> } | null;
        if (body?.error === 'validation') {
          // Client and server share validateCheckoutForm, so reaching here
          // means a stale client bundle or a malformed body — surface the
          // server's field errors so the buyer isn't told to "review data"
          // that the server already rejected with different rules.
          const serverField = body.errors && Object.keys(body.errors)[0];
          setErrorMessage(
            serverField
              ? 'No pudimos validar uno de los campos. Revisa el formulario e intenta de nuevo.'
              : 'No pudimos validar los datos enviados. Revisa el formulario e intenta de nuevo.',
          );
        } else if (body?.error === 'empty_cart') {
          setErrorMessage('Tu carrito está vacío. Vuelve a la tienda para añadir productos.');
        } else if (body?.error === 'bad_request') {
          setErrorMessage('El pedido enviado no es válido. Recarga la página e intenta de nuevo.');
        } else {
          // server_error (500) — infrastructure (SumUp/Upstash env, network),
          // NOT the buyer's data. Don't blame the form.
          setErrorMessage('No pudimos iniciar el pago por un problema del servidor. Intenta de nuevo en unos minutos.');
        }
        setPhase('form');
        return;
      }

      const data = (await response.json()) as { ref: string; checkoutId: string };
      setRef(data.ref);
      setCheckoutId(data.checkoutId);
      setPhase('widget');
    } catch {
      setErrorMessage('No pudimos conectar con el servidor. Comprueba tu conexión e intenta de nuevo.');
      setPhase('form');
    }
  }

  function handleWidgetResponse(type: SumUpResponseType): void {
    switch (type) {
      case 'sent':
      case 'auth-screen':
        setPhase('processing');
        setErrorMessage(null);
        return;
      case 'success':
        if (ref) {
          window.location.assign(`/checkout/gracias?ref=${encodeURIComponent(ref)}`);
        } else {
          // Unreachable in the current flow (ref is always set before the
          // widget mounts) but the alternative to guarding it is a paying
          // buyer stuck on a blank widget with no way forward.
          setPhase('widget');
          setErrorMessage('Tu pago se procesó pero no pudimos confirmarlo automáticamente. Contacta con soporte.');
        }
        return;
      case 'invalid':
        setPhase('widget');
        setErrorMessage('Revisa los datos de tu tarjeta e intenta de nuevo.');
        return;
      case 'fail':
        setPhase('widget');
        setErrorMessage('Tu pago fue rechazado. Puedes intentar con otra tarjeta.');
        return;
      case 'error':
      default:
        setPhase('widget');
        setErrorMessage('Ocurrió un error al procesar el pago. Intenta de nuevo.');
    }
  }

  useEffect(() => {
    if ((phase !== 'widget' && phase !== 'processing') || !checkoutId) return;
    let cancelled = false;

    void loadSumUpScript()
      .then(() => {
        if (cancelled || !window.SumUpCard) return;
        widgetInstance.current = window.SumUpCard.mount({
          checkoutId,
          id: WIDGET_CONTAINER_ID,
          onResponse: (type) => handleWidgetResponse(type),
        });
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('No pudimos cargar el widget de pago. Recarga la página e intenta de nuevo.');
      });

    return () => {
      cancelled = true;
      widgetInstance.current?.unmount?.();
      widgetInstance.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retryToken deliberately forces a remount
  }, [checkoutId, retryToken]);

  if (!cart || !line) {
    return (
      <div className="rounded-card bg-surface p-5 text-center shadow-lift">
        <p className="text-graphite">Tu carrito está vacío.</p>
        <a href="/" className="mt-3 inline-block font-semibold text-rust underline">
          Volver a la tienda
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-card bg-surface p-4 shadow-lift">
        <h2 className="font-display text-sm font-bold text-graphite">Resumen del pedido</h2>
        <div className="mt-2 flex items-center justify-between text-sm text-graphite">
          <span>
            {variant?.title ?? commerce.title} × {line.quantity}
          </span>
          <span className="tabular-nums font-semibold">{formatPrice(cart.totalCents)}</span>
        </div>
      </div>

      {unsupportedCurrency ? (
        <p className="rounded-tile bg-rust-tint p-3 text-sm text-rust" role="alert">
          El pago con tarjeta no está disponible para esta moneda en este momento.
        </p>
      ) : phase === 'form' || phase === 'creating-session' ? (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <fieldset className="space-y-3">
            <legend className="font-display text-sm font-bold text-graphite">Contacto</legend>
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => updateField('email', v)}
              error={fieldError('email')}
            />
            <Field
              label="Teléfono"
              type="tel"
              value={form.phone}
              onChange={(v) => updateField('phone', v)}
              error={fieldError('phone')}
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-display text-sm font-bold text-graphite">Dirección de envío</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Nombre"
                value={form.address.firstName}
                onChange={(v) => updateAddressField('firstName', v)}
                error={fieldError('address.firstName')}
              />
              <Field
                label="Apellidos"
                value={form.address.lastName}
                onChange={(v) => updateAddressField('lastName', v)}
                error={fieldError('address.lastName')}
              />
            </div>
            <Field
              label="Dirección"
              value={form.address.address1}
              onChange={(v) => updateAddressField('address1', v)}
              error={fieldError('address.address1')}
            />
            <Field
              label="Piso, puerta (opcional)"
              value={form.address.address2}
              onChange={(v) => updateAddressField('address2', v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Ciudad"
                value={form.address.city}
                onChange={(v) => updateAddressField('city', v)}
                error={fieldError('address.city')}
              />
              <Field
                label="Código postal"
                value={form.address.zip}
                onChange={(v) => updateAddressField('zip', v)}
                error={fieldError('address.zip')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Provincia (opcional)"
                value={form.address.provinceCode}
                onChange={(v) => updateAddressField('provinceCode', v)}
              />
              <Field
                label="País (código, ej. ES)"
                value={form.address.countryCode}
                onChange={(v) => updateAddressField('countryCode', v.toUpperCase())}
                error={fieldError('address.countryCode')}
              />
            </div>
          </fieldset>

          {errorMessage && (
            <p className="rounded-tile bg-rust-tint p-3 text-sm text-rust" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={phase === 'creating-session'}
            className="flex h-14 w-full items-center justify-center rounded-pill bg-rust px-6 font-display text-base font-bold tracking-wide text-white shadow-lift transition active:scale-[.99] hover:bg-rust-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === 'creating-session' ? 'Preparando el pago…' : 'Continuar al pago'}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          {errorMessage && (
            <p className="rounded-tile bg-rust-tint p-3 text-sm text-rust" role="alert">
              {errorMessage}
            </p>
          )}
          {phase === 'processing' && (
            <p className="text-center text-sm text-steel" aria-live="polite">
              Procesando tu pago…
            </p>
          )}
          <div id={WIDGET_CONTAINER_ID} />
          {errorMessage && (
            <button
              type="button"
              onClick={() => setRetryToken((t) => t + 1)}
              className="w-full rounded-pill border-2 border-graphite/20 px-6 py-3 font-display text-sm font-bold text-graphite transition hover:bg-graphite/5"
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string | undefined;
}

function Field({ label, value, onChange, type = 'text', error }: FieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-graphite">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className="h-11 w-full rounded-tile border-2 border-graphite/10 bg-white px-3 text-graphite outline-none focus:border-rust"
      />
      {error && <span className="mt-1 block text-xs text-rust">{error}</span>}
    </label>
  );
}
