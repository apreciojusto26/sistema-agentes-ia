// THE COMPARISON ROW STATE MODEL — what a cell can actually be.
//
// ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The first real landing failed its structural gate on a comparison table that
// was, by every rule the system states, correct. Gemini wrote four honest rows
// and the last one was `{ ours: true, rival: "A pilas o con enchufe" }` — a
// boolean and a string, exactly what the Fixed content contract permits and
// exactly what 11-comparison.astro renders. Structural Grammar V2 had never
// SEEN that combination in a final row, so the region failed to collapse, the
// page emitted eighteen extra elements, and the profile did not match.
//
// The tempting fix was to teach the model that a closing row should be text.
// That would turn an accidental gap in a grammar into an editorial rule, and
// the model would then be writing sentences to satisfy a hash. The defect is
// in the grammar: it was assembled from the shapes that HAPPENED to occur in
// the fixtures, not from the shapes the template can produce.
//
// ─── THE MODEL ─────────────────────────────────────────────────────────────
//
// A row is `{ feature, ours, rival }`. Both cells are validated by
// fixed-content-output.mjs as `boolean | non-empty string` — nothing else is
// accepted — and 11-comparison.astro branches on `typeof cell === 'boolean'`:
//
//     true    →  <svg> carrying ICONS.check   (a tick)
//     false   →  <svg> carrying ICONS.cross   (an X)
//     string  →  <span class="text-xs">       (the text)
//
// So each cell has EXACTLY three rendered states, and the two cells are
// independent branches over the same three. THEORETICAL = 3 × 3 = 9, and
// REACHABLE = 9 too: every combination is expressible in a valid content
// document, and the renderer has a branch for each.
//
// Position adds one more distinction and only one: the last row's `ours` cell
// carries `rounded-b-card`, because it closes the table. That is a property of
// the ROW's position, not of the cell's value, so it multiplies rather than
// interacts: 9 shapes in the body, 9 more as a closing row.
//
// ─── WHAT IS NOT MODELLED HERE, DELIBERATELY ───────────────────────────────
//
// The CONTENT contract stays exactly as it was: `boolean | non-empty string`,
// per cell, with no rule about position. Position is a LAYOUT fact — the table
// decides which row is last — and putting it in an editorial contract would be
// asking the Content Agent to know about `rounded-b-card`.

/** The three states a single cell can render. */
export const CELL_STATES = ['check', 'cross', 'text'];

/** A cell value that produces the named state. */
export function cellValue(state, text) {
  if (state === 'check') return true;
  if (state === 'cross') return false;
  if (state === 'text') return text;
  throw new Error(`unknown comparison cell state: ${state}`);
}

/**
 * Every reachable row state, as `{ id, ours, rival }`.
 *
 * The id is `<ours>-<rival>` so a failure names the combination rather than an
 * index — "cross-text failed as a closing row" is a bug report; "shape 7
 * failed" is a puzzle.
 */
export const ROW_STATES = CELL_STATES.flatMap((ours) =>
  CELL_STATES.map((rival) => ({ id: `${ours}-${rival}`, ours, rival })),
);

/** A content-contract-valid comparison row materializing one state. */
export function rowFor(state, i = 0) {
  return {
    feature: `Característica ${i + 1}`,
    ours: cellValue(state.ours, `Sí, ${i + 1}`),
    rival: cellValue(state.rival, `No, ${i + 1}`),
  };
}

/**
 * A table that materializes every state in the BODY and `last` at the END.
 *
 * The nine body rows come first so one build proves every non-final shape, and
 * the tenth repeats one of them in the closing position — the only place the
 * `rounded-b-card` variant can ever appear.
 */
export function tableEndingIn(last) {
  const body = ROW_STATES.map((s, i) => rowFor(s, i));
  return [...body, rowFor(last, ROW_STATES.length)];
}

/**
 * THE TABLE THE FIRST REAL LANDING PRODUCED, reproduced exactly.
 *
 * Four rows, every one of them a tick beside a value. Under V2 the three body
 * rows were legal (R02 declared check-text) and the CLOSING row was not, so
 * this is the smallest document that isolates the reported failure from the
 * wider body gap V3 also closes.
 */
export const REPORTED_FAILURE = [
  { feature: 'Portabilidad y versatilidad', ours: true, rival: 'Fijas y pesadas' },
  { feature: 'Múltiples modos de luz (RGB)', ours: true, rival: 'Un solo color/intensidad' },
  { feature: 'Fijación magnética y con gancho', ours: true, rival: 'Necesita instalación o soporte' },
  { feature: 'Recargable por USB', ours: true, rival: 'A pilas o con enchufe' },
];
