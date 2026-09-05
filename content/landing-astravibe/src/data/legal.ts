/**
 * THE LEGAL PAGES' VIEW OF THE MERCHANT. An adapter, not a source.
 *
 * ─── WHAT THIS MODULE USED TO BE ───────────────────────────────────────────
 *
 * A hand-written object holding `holder: 'Daniel Longone'`, `tradeName:
 * 'Bamzuk'`, a real NIF, a real address, a real email and a real phone — copied
 * verbatim into every landing this system produces, while `src/data/merchant
 * .ts`, generated from the operator's own config, held the same facts.
 *
 * TWO AUTHORITIES FOR ONE FACT, and the legal pages read the wrong one. Under
 * LSSI-CE art. 10 those pages are a legally binding identification of who is
 * selling: a landing generated for any other operator published Bamzuk's NIF
 * and address as its own, and nothing in the system could notice, because the
 * page was reading exactly what it was told to read.
 *
 * ─── WHAT IT IS NOW ────────────────────────────────────────────────────────
 *
 * The same SHAPE — the pages are unchanged in how they read it — DERIVED from
 * merchant config. There is one authority and this is a projection of it, the
 * way lib/policy.ts is the projection for commercial-policy facts.
 *
 *     merchant config → src/data/merchant.ts → here → the legal pages
 *
 * NULL IS A REAL STATE AND IT IS THE HONEST ONE. Without `--merchant` there is
 * no seller, so every identifying field is `null` and each page says the
 * information is pending. That is not a degraded render: publishing an
 * incomplete legal notice is bad, and publishing a *confident and wrong* one is
 * worse. The old module did the second.
 *
 * ─── THE TWO FACTS THAT ARE NOT THE MERCHANT'S ─────────────────────────────
 *
 * `withdrawalDays` and `lastUpdated` stay declared here on purpose, and neither
 * is a second copy of anything:
 *
 *   withdrawalDays  A STATUTORY right (RDL 1/2007 art. 71), not a merchant
 *                   policy. It is deliberately NOT `merchant.returnsWindowDays`
 *                   — lib/policy.ts keeps the same three-way distinction, and
 *                   collapsing a legal right into a configurable window is how
 *                   a shop ends up publishing that it grants 7 days when the
 *                   law gives 14. It is EU/Spain-specific; see the caveat on
 *                   the constant.
 *   lastUpdated     when these TEXTS were revised. A property of the document,
 *                   not of whoever is selling.
 */
import { merchant } from '@/data/merchant';

/** Identifying facts, exactly as the pages render them. `null` = pending. */
export interface LegalIdentity {
  /** The legal person selling. `merchant.legalName`. */
  holder: string | null;
  /** The name they trade under. */
  tradeName: string | null;
  taxId: string | null;
  address: string | null;
  /** General contact. Data-protection requests use `dataControllerEmail`. */
  email: string | null;
  /** Optional by law — `null` when the merchant publishes none. */
  phone: string | null;
  /** Jurisdiction. Was carried to every landing and rendered by nobody. */
  country: string | null;
  /**
   * GDPR contact. Also carried to every landing and rendered by nobody: the
   * privacy page asked for `email` instead, so a merchant with a separate DPO
   * published the wrong address on the one page where it matters.
   * merchant.mjs falls it back to contactEmail, so it is never emptier.
   */
  dataControllerEmail: string | null;
}

const PENDING: LegalIdentity = {
  holder: null,
  tradeName: null,
  taxId: null,
  address: null,
  email: null,
  phone: null,
  country: null,
  dataControllerEmail: null,
};

export const legal = {
  identity: merchant
    ? ({
        holder: merchant.legalName,
        tradeName: merchant.tradeName,
        taxId: merchant.taxId,
        address: merchant.address,
        email: merchant.contactEmail,
        phone: merchant.phone,
        country: merchant.country,
        dataControllerEmail: merchant.dataControllerEmail,
      } satisfies LegalIdentity)
    : PENDING,

  /** Fecha de última revisión mostrada al pie de cada página legal. */
  lastUpdated: '22 de agosto de 2026',

  /**
   * Plazo legal de desistimiento en la UE (RDL 1/2007, art. 71).
   *
   * A STATUTORY RIGHT, not `merchant.returnsWindowDays`. The two happen to both
   * be 14 for this operator and they are different claims: one is what the law
   * grants a consumer, the other is the window this shop chose to offer.
   *
   * CAVEAT, STATED RATHER THAN HIDDEN: 14 days is EU law. A merchant whose
   * `country` is outside it would publish a number that does not apply, and
   * nothing here checks that — see the readiness note. Modelling statutory
   * rights per jurisdiction is a layer this system does not have.
   */
  withdrawalDays: 14,
} as const;

/** True when the seller has been configured — the legal pages are publishable. */
export const legalIdentityConfigured = merchant !== null;

/**
 * The name the shop shows as itself — header logo, page titles, payment sheet.
 *
 * NOT a legal statement and NOT the product's brand: it is the trade name, and
 * before this it was the hardcoded 'Bamzuk' on every landing regardless of who
 * was selling.
 *
 * The fallback is a STATE, not a name. A landing with no merchant has no shop
 * name, and 'Sin configurar' cannot be mistaken for one — an empty logo would
 * look like a rendering bug and any invented word would be a claim. Such a
 * landing is not publishable anyway; readiness says so.
 */
export const storeName: string = merchant?.tradeName ?? 'Sin configurar';

/**
 * What a page shows in place of a fact nobody has configured.
 *
 * ONE STRING, so "pending" is greppable and cannot be mistaken for a value: a
 * page that quietly rendered an empty cell would look complete and be illegal.
 */
export const PENDING_LABEL = 'Pendiente de configuración';

/** A field for display: the fact, or the pending label. Never an empty string. */
export const orPending = (value: string | null): string => value ?? PENDING_LABEL;

export interface LegalPageMeta {
  slug: string;
  title: string;
  description: string;
}
