// THE CANONICAL GRAMMAR ARTIFACT — the thing that actually gets sealed.
//
// V1's hash is SHA256 of THIS, not of any product's HTML. A hash of a rendered
// page is a hash of one product; the question Fixed asks is what the TEMPLATE
// permits, and that is what this renders: every region, its wrapper, the item
// shapes it accepts, the optional slots and where they belong, and the rules
// that decide which values count as structure.
//
// Readable on purpose. A 64-character digest tells you something changed and
// nothing about what — this artifact diffs, so a future version can be
// reviewed rather than merely detected.
import { createHash } from 'node:crypto';

/** Stable one-line summary of a wrapper matcher. */
function wrapperOf(w) {
  const parts = [w.tag === '*' ? 'any' : w.tag];
  for (const c of w.classes ?? []) parts.push(`.${c}`);
  for (const [k, v] of Object.entries(w.attrs ?? {})) parts.push(v === true ? `[${k}]` : `[${k}=${v}]`);
  return parts.join('');
}

/** A shape's fingerprint — short, stable, and enough to notice a change. */
const shapeDigest = (skeleton) => createHash('sha256').update(skeleton).digest('hex').slice(0, 12);

/**
 * Renders the grammar. Deterministic: regions in declaration order, shapes
 * sorted by name, so a diff shows a real change and never a reordering.
 */
export function renderGrammar({ grammar, slots, contextualRules, buildIdentityAttrs, valueDroppedAttrs }) {
  const out = [];
  out.push('ASTRAVIBE FIXED — CANONICAL STRUCTURAL GRAMMAR');
  out.push('');
  out.push('## REGIONS');
  for (const r of grammar) {
    out.push('');
    out.push(`${r.id}  [${r.kind}${r.relationalIds ? ', relational-ids' : ''}]`);
    out.push(`  wrapper   ${wrapperOf(r.wrapper)}`);
    out.push(`  min       ${r.min}`);
    out.push(`  zero      ${r.zero}`);
    if (r.tuple) {
      out.push(`  tuple     prefix=${r.tuple.prefix} size=${r.tuple.size}`);
      for (const sh of [...r.tuple.shapes].sort((a, b) => a.name.localeCompare(b.name))) {
        out.push(`    TUPLE_REPEAT<${sh.name}>  ${shapeDigest(sh.skeleton)}`);
      }
      for (const sh of [...(r.tuple.lastShapes ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
        out.push(`    TUPLE_LAST<${sh.name}>    ${shapeDigest(sh.skeleton)}`);
      }
    }
    for (const sh of [...r.shapes].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(`    REPEAT<${sh.name}>  ${shapeDigest(sh.skeleton)}`);
    }
  }

  out.push('');
  out.push('## OPTIONAL SLOTS');
  out.push('');
  out.push('A slot the template declares and a product may leave unfilled. Its');
  out.push('position is fixed; its shape is checked when it is there.');
  for (const s of slots) {
    out.push('');
    out.push(`OPTIONAL<${s.id}>`);
    out.push(`  capability  ${s.capability}`);
    out.push(`  after       ${wrapperOf(s.after)}`);
    out.push(`  before      ${wrapperOf(s.before)}`);
    out.push(`  wrapper     ${wrapperOf(s.wrapper)}`);
    out.push(`  shape       ${shapeDigest(s.shape)}`);
  }

  out.push('');
  out.push('## VALUE RULES');
  out.push('');
  out.push('Which attribute VALUES are product data rather than design.');
  for (const r of contextualRules) {
    out.push(`  ${r.id.padEnd(28)} ${r.attr} on ${wrapperOf(r.element)}${r.ancestor ? ` within ${wrapperOf(r.ancestor)}` : ''}`);
  }
  out.push('');
  out.push(`  build-identity attrs   ${[...buildIdentityAttrs].sort().join(' ')}`);
  out.push(`  value-dropped attrs    ${[...valueDroppedAttrs].sort().join(' ')}`);
  out.push('  relational rules       radio-group names; ids/aria within a repeated item');

  return out.join('\n') + '\n';
}

export const grammarHash = (text) => createHash('sha256').update(text).digest('hex');
