// SHOPIFY, AS A VISIBLE PART OF STARTING A GENERATION.
//
// ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
//
// A text box labelled "Handle de Shopify", hidden behind "Opciones avanzadas",
// with the placeholder "vacío = preview". Everything wrong with it in one line:
// a handle is a detail of Shopify's URL scheme, an operator had to know one
// from memory, a typo was indistinguishable from a product that does not
// exist, and the single most important commercial decision a landing carries —
// is this buyable — was a hidden optional field.
//
// ─── THE THREE LEVELS, KEPT APART ──────────────────────────────────────────
//
//   SHOP        the connection. Rendered as a status line, never editable here.
//   STOREFRONT  the token/channel. Never shown; the server never returns it.
//   PRODUCT     a ShopifyProductLink. Chosen from the shop, not typed.
//
// ─── AND WHAT IS NOT BUILT, ON PURPOSE ─────────────────────────────────────
//
// "Crear producto en Shopify" is disabled and says próximamente, because
// creating a product needs the Admin API and this system has no client for it,
// no credential for it and no route that would call it. A button that looked
// live would be a promise the backend cannot keep. The capability comes from
// the SERVER (`capabilities.createProduct`), so the day it becomes real this
// component needs no edit to tell the truth.
import { useEffect, useState } from 'react';
import type { ShopifyConnection, ShopifyProductSummary } from '../../server/shopify/storefront';

export type ShopifySectionProps = {
  /** The chosen product's handle, or null for Preview. Owned by the parent. */
  handle: string | null;
  /**
   * The chosen product's Shopify GID, when the picker resolved one. Owned by
   * the parent, mirroring `handle` — `null` for Preview, and also legitimately
   * null for a handle carried forward from before this field existed (a
   * regeneration prefill). ShopifyProductLink.productGid is nullable for the
   * same reason.
   */
  productGid: string | null;
  onChange: (selection: { handle: string; gid: string | null } | null) => void;
  /** The landing's public origin, for the readiness summary. Owned by the parent. */
  siteUrl: string;
  disabled: boolean;
};

/**
 * SEVEN CONDITIONS, NAMED SEPARATELY AND GROUPED BY CAPABILITY — because
 * "Shopify conectado" is not "Commerce listo", and a status pill that let
 * those read as the same thing would be the most expensive kind of lie this
 * UI could tell.
 *
 *   COMMERCE — everything catalog.ts and cart.ts actually read at runtime:
 *     Shop ID / Storefront ID    the operator's one-time identity config.
 *     Storefront API connected  credentials exist to QUERY the storefront.
 *     Product / Product GID     this landing sells a specific product.
 *     Merchant valid            there is a seller, so legal pages publish.
 *
 *   PUBLISH — a SEPARATE capability, never a Commerce blocker:
 *     Domain configured   SITE_URL, for the social card and payment
 *                          callbacks. astro.config.mjs treats its absence as
 *                          legitimate in Commerce exactly as in Preview —
 *                          catalog.ts and cart.ts never read it at all.
 *
 * None of the seven substitutes for another.
 */
function ReadinessRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li className="flex items-baseline gap-2 text-[11px]">
      {/* state-done / state-failed — the tokens this app's design system
          actually declares (styles.css). `state-pass` was never one of
          them, which is why every check here used to render pale grey
          regardless of ok. */}
      <span aria-hidden="true" className={ok ? 'text-state-done' : 'text-state-failed'}>
        {ok ? '✓' : '✗'}
      </span>
      <span className={ok ? 'text-ink-soft' : 'text-ink-faint'}>{label}</span>
      {detail && <span className="ml-auto truncate font-mono text-[10px] text-ink-faint">{detail}</span>}
    </li>
  );
}

type Picker =
  | { state: 'closed' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; products: ShopifyProductSummary[] };

export default function ShopifySection({ handle, productGid, onChange, siteUrl, disabled }: ShopifySectionProps) {
  const [connection, setConnection] = useState<ShopifyConnection | null>(null);
  const [merchantConfigured, setMerchantConfigured] = useState<boolean | null>(null);
  const [picker, setPicker] = useState<Picker>({ state: 'closed' });
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<ShopifyProductSummary | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch('/api/shopify/status')
      .then((r) => r.json() as Promise<ShopifyConnection>)
      .then((c) => alive && setConnection(c))
      // A status endpoint that cannot be reached is reported as "not
      // connected", which is what it means for the operator.
      .catch(
        () =>
          alive &&
          setConnection({
            configured: false,
            domain: null,
            apiVersion: null,
            commerceIdentity: { shopIdConfigured: false, storefrontIdConfigured: false },
            capabilities: { searchProducts: false, createProduct: false },
          }),
      );
    void fetch('/api/health')
      .then((r) => r.json() as Promise<{ checks?: { merchantConfig?: boolean } }>)
      .then((h) => alive && setMerchantConfigured(h.checks?.merchantConfig === true))
      .catch(() => alive && setMerchantConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  async function search(q: string) {
    setPicker({ state: 'loading' });
    try {
      const res = await fetch(`/api/shopify/products?q=${encodeURIComponent(q)}`);
      const body = (await res.json()) as
        | { ok: true; products: ShopifyProductSummary[] }
        | { ok: false; message: string };
      setPicker(body.ok ? { state: 'ready', products: body.products } : { state: 'error', message: body.message });
    } catch {
      setPicker({ state: 'error', message: 'No se pudo consultar la tienda.' });
    }
  }

  const connected = connection?.configured === true;
  const canSearch = connected && connection?.capabilities.searchProducts === true;

  return (
    <section className="mt-3 rounded-xl border border-hairline-soft bg-panel-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="cap text-ink-faint">Shopify</span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-state-done' : 'bg-ink-faint'}`}
          />
          {connection === null
            ? 'Comprobando conexión…'
            : connected
              ? `Shopify conectado · ${connection.domain}`
              : 'Shopify sin configurar'}
        </span>
      </div>

      {/* ── the product link, or its absence ─────────────────────────────── */}
      {handle ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-panel px-3 py-2">
          <span className="text-[13px] text-ink">
            ✓ Producto Shopify vinculado
            <span className="ml-1.5 text-ink-soft">{chosen?.title ?? handle}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setChosen(null);
            }}
            className="ml-auto text-[11px] text-ink-soft underline-offset-2 hover:underline disabled:opacity-40"
          >
            Quitar vínculo
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-ink-soft">
          {/* PREVIEW IS NOT A DEGRADED MODE and must not read like one. A
              landing without a product link is the normal way to see the work
              before deciding to sell it. */}
          Sin producto vinculado — se generará una <strong className="font-medium text-ink">preview</strong>, que no
          vende. Podés vincular un producto ahora o más adelante.
        </p>
      )}

      {/* ── the two actions ──────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !canSearch}
          onClick={() => {
            setPicker({ state: 'loading' });
            void search(query);
          }}
          title={canSearch ? undefined : 'Configurá la conexión con Shopify para buscar productos.'}
          className="rounded-lg border border-hairline bg-panel px-3 py-1.5 text-[12px] text-ink transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          Vincular producto existente
        </button>

        <button
          type="button"
          disabled
          title="Crear productos requiere la Admin API, que todavía no está conectada."
          className="cursor-not-allowed rounded-lg border border-[#95BF47] bg-panel px-3 py-1.5 text-[12px] text-[#95BF47] transition hover:bg-[#95BF47] hover:text-black"
        >
          Crear producto en Shopify
          <span className="ml-1.5 rounded-full bg-panel-muted px-1.5 py-0.5 text-[10px]">Próximamente</span>
        </button>
      </div>

      {/* ── what Commerce still needs ─────────────────────────────────────
          A shop connection means the Admin can ASK the storefront questions.
          It does not mean this landing can sell: that needs a product and a
          seller, and each is listed on its own so none of them hides behind
          the others.
          COMMERCE AND PUBLISH ARE TWO SEPARATE CAPABILITIES, split into two
          groups rather than one flat list. catalog.ts and cart.ts — the
          runtime that actually prices, sells and carts a product — read
          PUBLIC_SHOPIFY_PRODUCT_HANDLE and never SITE_URL; astro.config.mjs's
          own `site` resolution is explicitly "absent means absent", true in
          Commerce exactly as it is in Preview. A missing domain is real and
          worth surfacing, but it blocks PUBLISHING a public, shareable social
          card — never selling — so it never reads as a Commerce gap. */}
      <p className="mt-2 cap text-ink-faint">Commerce</p>
      <ul className="space-y-0.5 border-t border-hairline-soft pt-2">
        <ReadinessRow
          label="Shop ID configurado"
          ok={connection?.commerceIdentity?.shopIdConfigured === true}
        />
        <ReadinessRow
          label="Storefront ID configurado"
          ok={connection?.commerceIdentity?.storefrontIdConfigured === true}
        />
        <ReadinessRow label="Storefront API conectada" ok={connected} detail={connection?.domain ?? undefined} />
        <ReadinessRow label="Producto seleccionado" ok={handle !== null} detail={handle ?? 'preview'} />
        <ReadinessRow
          label="Product GID disponible"
          ok={productGid !== null}
          detail={handle === null ? 'preview' : productGid === null ? 'sólo handle' : undefined}
        />
        <ReadinessRow
          label="Vendedor configurado"
          ok={merchantConfigured === true}
          detail={merchantConfigured === false ? 'falta admin/merchant.json' : undefined}
        />
      </ul>
      <p className="mt-2 cap text-ink-faint">Publish</p>
      <ul className="space-y-0.5 border-t border-hairline-soft pt-2">
        <ReadinessRow
          label="Dominio configurado"
          ok={siteUrl.trim() !== ''}
          detail={siteUrl.trim() || 'necesario antes de publicar'}
        />
      </ul>

      {merchantConfigured === false && (
        <p className="mt-1.5 rounded-lg bg-state-failed-tint px-2.5 py-1.5 text-[11px] text-state-failed">
          Sin <code className="font-mono">admin/merchant.json</code> la landing se genera, pero sus páginas legales
          dicen que los datos del vendedor están pendientes y no es publicable. Es identidad legal real: no se
          inventa ni se rellena con datos de ejemplo.
        </p>
      )}

      {/* ── the picker ───────────────────────────────────────────────────── */}
      {picker.state !== 'closed' && (
        <div className="mt-2 rounded-lg border border-hairline bg-panel p-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search(query);
              }}
              placeholder="Buscar por nombre…"
              className="flex-1 rounded-lg border border-hairline bg-panel-soft px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint"
            />
            <button
              type="button"
              onClick={() => void search(query)}
              className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-ink"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => setPicker({ state: 'closed' })}
              className="rounded-lg px-2 text-[12px] text-ink-soft"
            >
              Cerrar
            </button>
          </div>

          {picker.state === 'loading' && <p className="mt-2 text-[12px] text-ink-soft">Buscando…</p>}
          {picker.state === 'error' && <p className="mt-2 text-[12px] text-state-failed">{picker.message}</p>}
          {picker.state === 'ready' && picker.products.length === 0 && (
            <p className="mt-2 text-[12px] text-ink-soft">La tienda no devolvió productos para esa búsqueda.</p>
          )}
          {picker.state === 'ready' && picker.products.length > 0 && (
            <ul className="mt-2 max-h-64 divide-y divide-hairline-soft overflow-y-auto">
              {picker.products.map((p) => (
                <li key={p.handle}>
                  <button
                    type="button"
                    onClick={() => {
                      // Handle AND gid — both real Shopify data, both used
                      // internally, never typed by the operator.
                      onChange({ handle: p.handle, gid: p.gid });
                      setChosen(p);
                      setPicker({ state: 'closed' });
                    }}
                    className="flex w-full items-center gap-2 px-1 py-2 text-left transition hover:bg-panel-soft"
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded bg-panel-muted" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{p.title}</span>
                      <span className="block truncate font-mono text-[10px] text-ink-faint">{p.handle}</span>
                    </span>
                    {p.price && <span className="shrink-0 text-[12px] text-ink-soft">{p.price}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
