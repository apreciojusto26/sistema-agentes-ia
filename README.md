# Fixed AstraVibe

Generador de landings de dropshipping donde **cada landing es la misma página**.

La composición visual de [AstraVibe](https://astravibe.bamzuk.com/) está
congelada como plantilla canónica. Entre un producto y el siguiente cambian los
datos —textos, imágenes, precios, colores, favicon, handle de Shopify— y **nada
más**. Ni el orden de las secciones, ni el layout, ni la tipografía, ni el
espaciado, ni la composición responsive.

Eso no es una intención escrita en un documento: es un **test**. Ver
[Fingerprint estructural](#fingerprint-estructural).

> **Estado: F0–F1 completas. La generación Fixed todavía NO funciona.**
> `scripts/generate-landing.mjs` sigue apuntando a `content/landing-base`.
> Ver [Estado actual](#estado-actual).

---

## Índice

- [Los dos repos](#los-dos-repos)
- [Modelo de tres capas](#modelo-de-tres-capas)
- [Estado actual](#estado-actual)
- [Estructura](#estructura)
- [La plantilla congelada](#la-plantilla-congelada)
- [Fingerprint estructural](#fingerprint-estructural)
- [Guard de alcance](#guard-de-alcance)
- [Pipeline](#pipeline)
- [Desarrollo](#desarrollo)
- [Fases pendientes](#fases-pendientes)
- [Rojos abiertos](#rojos-abiertos)

---

## Los dos repos

El proyecto vive en dos líneas deliberadamente separadas. **No se mezclan.**

| | Versión A — experimental | Versión B — Fixed AstraVibe |
| --- | --- | --- |
| Repo | `gbritez53/landing-generator` | **este** |
| Carpeta local | `dev/landing-agents-generator` | `dev/landing-generator` |
| Plantilla | `content/landing-base` + design system | `content/landing-astravibe` |
| Design Agent | sí — decide estructura | **no** — sin autoridad sobre estructura |
| Registry / variants | 21 capacidades, gobiernan el output | fuera del render path |
| Objetivo | variación creativa por producto | **cero variación estructural** |

Si buscás el Design Agent, el registry, las variantes o el layout vocabulary,
están en la Versión A. Acá no.

---

## Modelo de tres capas

Toda la arquitectura se lee con estas tres capas. Ninguna puede apropiarse de
la responsabilidad de otra.

### 1 · Frozen Visual Template

`content/landing-astravibe/`

Manda sobre: estructura, composición, orden de secciones, responsive, spacing,
tipografía, componentes, interacciones, layout.

Protegido por el fingerprint estructural y por `scope-boundaries`.

### 2 · Dynamic Product Data

Cambia por producto: marca, copy, precio, variantes, beneficios, FAQ,
comparativa, ratings canónicos cuando existan, media, handle de Shopify,
**colores**, favicon, facts de merchant y policy.

### 3 · Protected Infrastructure

No retrocede aunque el baseline visual sea AstraVibe: Shopify, carrito,
checkout, buy action, TikTok WebView, telemetría, consent, gating de analítica,
storage, policy comercial, legales, integridad de reseñas, provenance,
accesibilidad, validación.

**Paridad visual no significa paridad de bugs.** Se copia la apariencia de
AstraVibe, no sus errores conocidos.

---

## Estado actual

| Fase | Estado | Qué dejó |
| --- | --- | --- |
| **F0** — congelar el source | ✅ | `content/landing-astravibe/` |
| **F1** — fingerprint estructural | ✅ | `scripts/lib/fingerprint.mjs` + 23 mutation tests |
| **F2** — canonicalización de integridad | ⬜ | — |
| **F3** — contrato `FixedProductData` | ⬜ | — |
| **F4** — assets y vídeo | 🔒 bloqueada | — |
| **F5** — paleta por producto | ⬜ | — |
| **F6** — favicon con IA | 🔒 bloqueada | — |

Lo que **todavía no** es cierto, y conviene decirlo claro:

- `scripts/generate-landing.mjs` apunta a `content/landing-base`, no a la
  plantilla congelada.
- El pipeline del admin todavía tiene la etapa `design`.
- La plantilla congelada aún carga los datos de AstraVibe y sus claims
  hardcodeados. F2 los corrige.

---

## Estructura

```
.
├── content/
│   ├── landing-astravibe/   PLANTILLA CANÓNICA CONGELADA  ← protegida
│   └── landing-base/        plantilla de la Versión A · fuera del render path
│
├── scripts/
│   ├── lib/fingerprint.mjs      invariante estructural
│   ├── lib/content-contract.mjs contrato del copy
│   ├── lib/merchant.mjs         policy comercial y legal
│   ├── lib/asset-pipeline.mjs   9 slots de media (24 en F4)
│   ├── generate-content.mjs     Content Agent (Gemini)
│   ├── generate-landing.mjs     ensamblado mecánico, sin LLM
│   └── verify-shopify-live.mjs  9 chequeos contra Shopify real
│
├── admin/                   panel de control · Fastify + React 19
├── scraper/                 scraping de AliExpress · Playwright
└── outputs/{slug}/          landings generadas
```

---

## La plantilla congelada

`content/landing-astravibe/` es una copia **verbatim** de
`drop-one-product@4701922`, verificada byte a byte por checksum.

```
Visual oracle:        https://astravibe.bamzuk.com/
Deployment:           dpl_8H6J66pN2GNoUPPDJ3MsvzjJAMQq  (2026-08-27 20:20 +0200)
Proyecto Vercel:      prj_cKRbvr2F9SHOVAM20VtsAdIQaulm · team bamzuk
Implementation base:  drop-one-product@4701922
Deployment SHA:       UNCONFIRMED
```

**`UNCONFIRMED` es deliberado.** El CLI de Vercel no expone `gitSource`, así que
no hay prueba de que el build desplegado corresponda a ese commit. Lo que sí
está probado es la **paridad estructural**: el DOM en vivo coincide con el
`index.astro` del source, sección por sección. `4701922` es el source
reproducible más cercano, no una coincidencia demostrada. No inventamos el SHA.

### Orden real de las secciones

Éste es el orden congelado, tomado del desplegado. **No sigue la numeración de
los archivos** — leerlo por número da un resultado equivocado.

```
UtilityBar          01-utility-bar
SiteHeader          02-site-header
  ┌ Hero            03-hero          ┐ xl:grid-cols-
  └ BuyBox          05-buy-box       ┘ [minmax(0,1.1fr)_minmax(25rem,0.9fr)]
HowItWorks          06-how-it-works
FeaturedTestimonial 07-featured-testimonial
UgcStrip            09-ugc-strip
Comparison          11-comparison
RealResults         13-real-results
ReviewsReel         10-reviews-reel
Guarantee           12-guarantee
Faq                 08-faq            ← última
SiteFooter          14-site-footer
StickyBar           15-sticky-bar
CartDrawer          island · client:load
```

`Base.astro` monta además `CookieBanner`, `TikTokBioNotice` y
`DiagnosticBadge`.

**Excluida a propósito:** `13-results-gallery.astro` existe en el source pero no
se importa en ninguna parte y no está en la página desplegada. Un archivo
numerado no es una sección.

### Poda de assets

`public/` pasó de **106 MB a 96 KB**. Se eliminó material en crudo que nadie
sirve: `img/Galeria` (con un master `.mov` de 83 MB), `images/WhatsApp *` y
`videos/WhatsApp *`.

Sobrevive todo lo que el sitio lee de verdad: `favicon.svg`, `favicon.ico`,
`og-cover.png`, `sello-garantia.webp`, los cuatro `img/payment/*.svg` y el
`.well-known/apple-developer-merchantid-domain-association` de Apple Pay.

> **Un grep literal no alcanza para decidir si un asset está en uso.**
> `ui/PaymentLogos.astro` arma la ruta dinámicamente:
> `` `/img/payment/${slug}.svg` ``. Esos cuatro SVG nunca aparecen como string
> literal y por poco se van a la basura.

---

## Fingerprint estructural

`scripts/lib/fingerprint.mjs`

Reduce el HTML renderizado a la parte que **nunca debe variar** y la hashea.

```js
import { structuralFingerprint } from './scripts/lib/fingerprint.mjs';

structuralFingerprint(htmlA).hash === structuralFingerprint(htmlB).hash
```

Es más fuerte que "no corras el Design Agent", porque eso es una promesa sobre
un flag y un flag no es un invariante. Cualquiera puede agregar una sección,
reordenar dos o ensanchar un contenedor a mano. El fingerprint se entera.

### La decisión central: las clases NO se normalizan

Ninguna. Todas sobreviven.

La regla que parece obvia —"borrá toda clase que lleve un color, porque la
paleta cambia por producto"— **falla en la dirección peligrosa: produce un PASS
falso.** No distingue `bg-grape` de `bg-white`, y un regex lo bastante amplio
para cazar palabras de color también se come `bg-gradient-to-r`, que es layout.

Y además es innecesario. **La paleta no está en el HTML.** Vive en custom
properties dentro del bloque `@theme` de `global.css`. Recolorear reescribe
`--color-grape: #7C3AED`; nunca reescribe `class="bg-grape"`, que es
byte-idéntica en todos los productos.

El color llega al HTML por exactamente dos puertas, y son las dos únicas que
este módulo cierra: literales hex/rgb en `style` y en `fill`/`stroke` de SVG.

### Qué se normaliza

| Entrada | Regla |
| --- | --- |
| Texto, comentarios | se descartan |
| `href` `src` `srcset` `poster` `alt` `title` `content` `value` `aria-label`… | sobrevive el nombre, muere el valor |
| `uid` `props` `component-url` `renderer-url` `ssr` `opts` | se descartan (identidad de build) |
| `style` → `width` | → `<n>` (barras de rating de RealResults) |
| hex/rgb en `style`, `fill`, `stroke` | → `<colour>` |
| `id` con forma de hash | → `<uid>`; los anclas (`#buy`, `#faq`) sobreviven |
| `img`/`video` dentro de un media slot | tag → `MEDIA`, más sus atributos de tipo |

El media slot se reconoce por la firma exacta de `ui/Media.astro`:
`h-full w-full object-cover`. El `aspect-ratio` inline **se conserva** — ésa es
la geometría. Misma geometría de slot, media adaptable. Un `<img>` fuera de esa
firma se sigue comparando como `<img>`.

### Mutation tests

`admin/test/contract.fixed-fingerprint.test.ts` — 23 tests, en las dos
direcciones. Un fingerprint que sólo pasa es peor que ninguno: certifica deriva.

| Debe FALLAR | Debe PASAR |
| --- | --- |
| ritmo vertical (`py-12` → `py-16`) | copy |
| ancho de contenedor | marca y nombre de producto |
| definición del grid | filenames de assets y sus hashes |
| breakpoint (`md:` → `lg:`) | `alt` |
| sección reordenada | destino de links |
| sección removida | ancho de barra de rating |
| elemento agregado | `uid` y `props` de island |
| island cambiado | `<video>` por `<img>` en el slot |
| `aspect-ratio` cambiado | literales de color inline |
| `<img>` fuera de un media slot | orden y espacios de clases |

---

## Guard de alcance

`admin/test/scope-boundaries.test.ts` exige **cero archivos sucios** bajo la
plantilla canónica. Mide el working tree, no la historia: un cambio autorizado
queda rojo hasta commitearse y después el límite recupera toda su fuerza.

**Protegido**

```
content/landing-astravibe/src/components        composición visual
content/landing-astravibe/src/layouts           el shell de todas las páginas
content/landing-astravibe/src/pages/index.astro la secuencia de secciones
content/landing-astravibe/src/lib/kv.ts
content/landing-astravibe/src/lib/shopify
content/landing-astravibe/src/lib/sumup
content/landing-astravibe/src/pages/api         comercio protegido
```

**No protegido, y cada exclusión es load-bearing**

- `src/styles/global.css` — la paleta de su `@theme` es lo único que Fixed
  permite variar; protegerlo pelearía contra la feature. Los tokens
  estructurales de ese mismo archivo los sostiene el fingerprint.
- `src/data/**` y `src/assets/product/**` — son la carga útil, no la plantilla.

---

## Pipeline

**Objetivo** (aún no implementado):

```
producto aprobado → scrape → normalize → CanonicalProduct → content
  → assets → palette → favicon → FIXED ASTRAVIBE TEMPLATE
  → shopify config → build → validate → landing
```

Sin etapa `design`. El Design Agent no produce DesignSpec, no elige secciones,
variantes, orden, ancho, ritmo, tipografía ni layout.

**Hoy** el pipeline del admin todavía declara ocho etapas incluyendo `design`
(`admin/src/server/pipeline.ts`).

### Modelo de autoridad

```
CanonicalProduct          → verdad factual
Content Agent             → copy de marketing
Merchant config           → policy comercial y legal
Fixed AstraVibe template  → estructura
```

El Content Agent **no** controla identidad de producto, precio, ratings,
review count, policy de merchant, envíos, garantías ni identidad de Shopify.

---

## Desarrollo

```bash
# instalar
pnpm --dir admin install
pnpm --dir scraper install && pnpm --dir scraper prepare:browsers
pnpm --dir content/landing-astravibe install

# panel de control — API en :5174 + cliente Vite
pnpm --dir admin dev

# tests
pnpm --dir admin test
pnpm --dir admin vitest run test/contract.fixed-fingerprint.test.ts
pnpm --dir admin vitest run test/scope-boundaries.test.ts

# typecheck
pnpm --dir admin typecheck
```

Requisitos: Node ≥ 22.12, pnpm 11, Chromium de Playwright, una API key de
Gemini en `admin/.env`, y el backend de comercio existente (una tienda Shopify,
una cuenta SumUp, una instancia Upstash Redis).

---

## Fases pendientes

### F2 — AstraVibe Fixed Canonical v1

AstraVibe visualmente, con los fixes modernos de factualidad, privacidad,
policy, comercio, accesibilidad y TikTok/WebView.

Regla: **cada port se mide solo.**

```
fingerprint antes → cambio → tests → build → fingerprint después
```

Conflictos conocidos a resolver sin tocar la estructura:

| Claim | Dónde | Por qué choca |
| --- | --- | --- |
| `location` · `title` · `verified` | `testimonials.ts` | `projectReview()` proyecta 5 claves y rechaza `verified` |
| `+120 reseñas de 5 estrellas` | `trustTicker` | claim de reseñas sin provenance |
| `Garantía 30 días` ×3 | badges, ticker, guarantee | `commercialGuaranteeDays` es opcional |
| `Envío de 8 días hábiles` | `shipping.etaLabel` | debe venir de `merchant.shippingEtaLabel` |
| identidad legal de Bamzuk | `legal.ts` | debe venir de merchant config |
| `Lo que dicen de Astra Vibe` | `13-real-results.astro` | marca en el markup |

**RealResults** conserva sección y posición. `ratingBreakdown` inventado no
vuelve. Si hay reseñas individuales con estrellas reales se calcula la
distribución **de esa muestra**, sin proyectarla al `reviewCount` global; si no
las hay, se conserva el shell visual con rating y conteo canónicos; si no hay
social proof real, degrada sin claims. La factualidad gana.

**Contraste:** no se congela `--color-steel: #8A9096`, que mide 2,92:1 sobre
`bone` y falla AA como texto. Se portan los roles demostrados
(`action` / `on-action` / `action-strong`) mapeando por **rol**, no copiando
nombres.

### F3 — FixedProductData

Un contrato único que alimente la plantilla sin editar siete módulos a mano.
Sólo datos: nada de clases, CSS, componentes, variantes, orden ni layout.

Cierra con un test de dos productos deliberadamente distintos que demuestre:

```
fingerprint(A) == fingerprint(B) == ASTRAVIBE_FIXED_CANONICAL_V1
```

### F4 y F6 — bloqueadas hasta nueva aprobación

**Assets y vídeo.** El pipeline cubre 9 slots; AstraVibe referencia 24
(`gallery-01..12`, `ugc-01..03`, `step-01`, `video-01..05`, 3 pósters). **No
existe ninguna infraestructura de vídeo**: ni slot, ni conversión, ni póster,
ni fallback.

**Favicon con IA.** No hay capacidad de generación de imagen en el pipeline; el
único modelo cableado es `gemini-2.5-flash`, que es texto. La generación corre
una vez, se hashea a SHA256 y entra al manifiesto; `validate` no vuelve a
llamar al modelo.

---

## Rojos abiertos

Dos tests fallan en `HEAD`. **Ninguno lo introdujo el trabajo de Fixed**, y en
los dos casos está probado.

**`admin/test/contract.product-identity.test.ts`** — HEAD quedó commiteado
inconsistente. `generate-content.mjs` está commiteado leyendo la forma
`CanonicalProduct` anidada; el test está commiteado alimentando la forma plana.
El arreglo vivía sin commitear en el working tree de la Versión A. Quitar ese
trabajo no rompió el test: **destapó un rojo que ya estaba ahí.**

**`admin/src/server/jobs/runner.test.ts`** — dos tests de escalada
SIGTERM→SIGKILL con ventanas de 150 ms. Falla en aislamiento, repetido.
Descartados: el fixture existe, está trackeado y sí ignora SIGTERM; la lógica de
escalada está intacta; `node_modules` corresponde al lockfile. Sin resolver.

F2 no debería arrancar sobre un baseline rojo: su regla de medir el fingerprint
antes y después de cada port no puede distinguir "mi cambio rompió algo" de "ya
estaba roto".
