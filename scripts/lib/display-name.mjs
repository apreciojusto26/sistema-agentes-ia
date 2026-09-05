// THE PRODUCT'S DISPLAY NAME — a TRUNCATION of the source title, never a rewrite.
//
// ─── THE PROBLEM ───────────────────────────────────────────────────────────
//
// A marketplace listing title is a keyword field, not a name. The first real
// landing's was 156 characters:
//
//   "Tubo de luz de tubo colorido, luz RGB de 17cm/32cm, luz nocturna USB,
//    palo de luz azul púrpura, lámpara de habitación, luz de relleno colgante
//    de mano, foto"
//
// It is FACTUAL and it must be preserved — it is what the source actually says
// the product is. It is also unusable in a cart line, an order summary, or the
// sticky purchase bar, which renders "{n}x {name}" on a single `whitespace-
// nowrap` line.
//
// ─── WHY NOT ASK THE MODEL ─────────────────────────────────────────────────
//
// Because it answers. Asked for a product name for this exact listing, Gemini
// produced "LuminArt — Tubo de Luz LED RGB Portátil": a company that does not
// exist, welded to the front of a description. The same defect as the invented
// "LumiFlex" brand, arriving through a different field. Identity is not a
// writing task.
//
// ─── THE RULE, AND THE INVARIANT THAT MAKES IT SAFE ────────────────────────
//
// Every word of the display name appears in the source title, in order. That is
// asserted, not hoped: `isDerivedFrom` is the test the contract runs, and it
// makes invention structurally impossible — no transformation here can produce
// a word the source did not contain.
//
// So this NARROWS, it never authors:
//
//   1. whitespace collapsed
//   2. leading marketplace noise removed (a closed, listed set)
//   3. cut at the first strong separator — a comma-separated listing title is
//      a list of keyword phrases, and the first is the product's noun phrase
//   4. trailing connectives and punctuation trimmed
//   5. capped at a budget the sticky bar can actually render, on a word boundary
//
// ─── WHAT IT DOES NOT PROMISE ──────────────────────────────────────────────
//
// A marketer's name. "Tubo de luz de tubo colorido" is clumsy, and it is what
// the source says. Making it elegant means writing, and writing identity is the
// thing this exists to prevent.

/**
 * Marketplace noise that can only ever appear as a PREFIX of a listing title.
 *
 * A closed, listed set — deliberately not a general "remove marketing words"
 * heuristic, which would eventually eat a real product noun. Each entry is a
 * pattern that carries no information about what the product IS.
 */
const LEADING_NOISE = [
  /^\d{4}\s+(nuevo|new|nueva)\b/i,          // "2024 New …"
  /^(nuevo|new|nueva|hot|top|best)\b[\s,-]*/i,
  /^(envío|envio|free)\s+(gratis|shipping)\b[\s,-]*/i,
  /^(oferta|sale|promo|descuento)\b[\s,-]*/i,
  /^\d+\s*(uds?|pcs?|unidades|piezas)\b[\s,-]*/i, // "2pcs …"
  /^\p{Extended_Pictographic}+\s*/u,              // a leading emoji
];

/** Where a keyword-stuffed title stops describing the product and starts listing. */
const SEPARATORS = /[,;|/·•]|\s[–—-]\s/;

/** Words a phrase must not end on once it has been cut. */
const TRAILING_CONNECTIVES = /\s+(de|del|la|el|los|las|con|para|y|o|en|a|por|un|una)$/i;

/**
 * The display budget, in characters.
 *
 * DERIVED FROM A CONSUMER, not chosen. 08-sticky-bar renders
 * `{units}x {displayName}` inside a `shrink-0` block with `whitespace-nowrap`
 * at `text-sm` (14px), beside the CTA, on a mobile bar. Past roughly forty
 * characters that line stops fitting and pushes the button off the bar — the
 * cart line and the order summary wrap instead, so this is the binding
 * surface. It is a ceiling, not a target: most titles cut far shorter at the
 * first separator and never reach it.
 */
export const DISPLAY_NAME_MAX_CHARS = 40;

/** Collapses whitespace and strips the punctuation a cut can leave behind. */
const tidy = (s) =>
  s
    .replace(/\s+/g, ' ')
    // `!` and `¡` are in the set because promo prefixes end in them — stripping
    // "Free Shipping" out of "Free Shipping! Hot Sale …" otherwise leaves the
    // name starting with an exclamation mark.
    .replace(/^[\s\-–—,;:.|/!¡]+|[\s\-–—,;:.|/!¡]+$/g, '')
    .trim();

/**
 * Narrows a source title to something a cart line can render.
 *
 * @param {unknown} sourceTitle the factual listing title. Never modified.
 * @returns {string} a non-empty display name, or '' when there is no title.
 */
export function deriveDisplayName(sourceTitle) {
  if (typeof sourceTitle !== 'string') return '';
  let text = tidy(sourceTitle);
  if (!text) return '';

  // 2. Leading noise, repeatedly — "2024 New 2pcs …" is one title, not three.
  for (let i = 0; i < LEADING_NOISE.length * 2; i += 1) {
    const before = text;
    for (const pattern of LEADING_NOISE) text = tidy(text.replace(pattern, ''));
    if (text === before) break;
  }
  if (!text) text = tidy(sourceTitle); // noise-only titles keep the original

  // 3. The first keyword phrase.
  const cut = text.split(SEPARATORS)[0];
  let name = tidy(cut ?? text);

  // A separator in the first two words means the split found a fragment, not a
  // phrase ("USB, luz nocturna…"). Keep the whole title and let the cap decide.
  if (name.split(' ').filter(Boolean).length < 2) name = tidy(text);

  // 5. The budget, on a word boundary, so a name is never cut mid-word.
  if (name.length > DISPLAY_NAME_MAX_CHARS) {
    const words = name.slice(0, DISPLAY_NAME_MAX_CHARS + 1).split(' ');
    words.pop();
    const trimmed = tidy(words.join(' '));
    if (trimmed) name = trimmed;
    else name = tidy(name.slice(0, DISPLAY_NAME_MAX_CHARS)); // one very long word
  }

  // 4. Never end on a connective — "Tubo de luz de" reads as a truncation bug.
  let previous;
  do {
    previous = name;
    name = tidy(name.replace(TRAILING_CONNECTIVES, ''));
  } while (name !== previous && name);

  return name || tidy(sourceTitle);
}

/**
 * THE INVARIANT: every word of `name` appears in `sourceTitle`, in order.
 *
 * This is what makes the display name safe to show as the product's identity.
 * A derivation that added a word — a brand, an adjective, a category the source
 * never claimed — fails here, and no rule above can produce one.
 *
 * Case- and accent-insensitive, because tidying may normalize neither and the
 * question is whether the WORD came from the source.
 */
export function isDerivedFrom(name, sourceTitle) {
  if (typeof name !== 'string' || typeof sourceTitle !== 'string') return false;
  const words = (s) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);

  const wanted = words(name);
  const source = words(sourceTitle);
  if (wanted.length === 0) return false;

  let at = 0;
  for (const word of wanted) {
    at = source.indexOf(word, at);
    if (at === -1) return false;
    at += 1;
  }
  return true;
}
