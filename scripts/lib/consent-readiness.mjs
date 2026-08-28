// READINESS: a landing that ships analytics must also ship the gate.
//
// The rule is narrow and only fires where it matters:
//
//   an analytics provider is CONFIGURED
//     AND the output cannot demonstrate a consent gate
//     -> Commerce/Ready fails
//
// NOT "does consent.ts exist". A file can exist and be imported by nobody. Each
// check below is an INVARIANT about what the landing actually does, and each
// one names the specific failure it prevents.
//
// Preview is never blocked: a preview landing is for looking at, and the whole
// point of the gate is that nothing loads until someone accepts.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Strips comments — these files document the patterns they must not contain. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

const read = (root, rel) => {
  const p = path.join(root, rel);
  return existsSync(p) ? code(readFileSync(p, 'utf-8')) : null;
};

/** True when either provider id is set — the condition that makes the gate load-bearing. */
export function analyticsConfigured(env = process.env) {
  const ga = (env.PUBLIC_GA_MEASUREMENT_ID ?? '').trim();
  const clarity = (env.PUBLIC_CLARITY_PROJECT_ID ?? '').trim();
  return ga !== '' || clarity !== '';
}

/**
 * Inspects a generated landing (or the template) and returns the invariants it
 * fails. Empty array = the gate is really there.
 *
 * @param {string} root  directory containing `src/`
 */
export function collectConsentIssues(root) {
  const issues = [];
  const add = (code_, message) => issues.push({ code: code_, message });

  const base = read(root, 'src/layouts/Base.astro');
  const loader = read(root, 'src/lib/analytics-loader.ts');
  const consent = read(root, 'src/lib/consent.ts');
  const gate = read(root, 'src/components/islands/ConsentGate.tsx');
  const index = read(root, 'src/pages/index.astro');
  const nav = read(root, 'src/lib/navigation.ts');
  const cookies = read(root, 'src/pages/legal/cookies.astro');

  // 1. THE ONE THAT MATTERS: the layout must not inject a tracker itself.
  if (base === null) {
    add('consent-base-missing', 'src/layouts/Base.astro not found — cannot verify the analytics gate.');
  } else {
    for (const [needle, what] of [
      ['googletagmanager.com', 'the GA4 tag'],
      ['clarity.ms', 'the Microsoft Clarity tag'],
      ["gtag('config'", 'a GA4 config call'],
    ]) {
      if (base.includes(needle)) {
        add(
          'consent-base-loads-analytics',
          `Base.astro still emits ${what} directly, so it loads on first paint before any consent. ` +
            'Analytics must be injected by src/lib/analytics-loader.ts after acceptance.',
        );
      }
    }
  }

  // 2. The loader exists AND is actually gated on consent.
  if (loader === null) {
    add('consent-loader-missing', 'src/lib/analytics-loader.ts not found — nothing would ever load analytics.');
  } else if (!/analyticsAllowed\s*\(/.test(loader)) {
    add(
      'consent-loader-ungated',
      'analytics-loader.ts does not consult analyticsAllowed() — it would inject trackers unconditionally.',
    );
  }

  // 3. Consent state is real and persisted.
  if (consent === null) {
    add('consent-state-missing', 'src/lib/consent.ts not found — there is no consent state to gate on.');
  } else if (!/localStorage/.test(consent)) {
    add('consent-not-persisted', 'consent.ts does not persist a decision — visitors would be re-prompted forever.');
  }

  // 4. Something must MOUNT the gate, or the visitor is never asked.
  if (gate === null) {
    add('consent-ui-missing', 'src/components/islands/ConsentGate.tsx not found — no way to accept or reject.');
  } else if (base !== null && !/ConsentGate/.test(base)) {
    add('consent-ui-unmounted', 'ConsentGate exists but Base.astro never mounts it — the banner would never appear.');
  }

  // 5. view_item must not be an ungated inline call any more.
  if (index !== null && /gtag\(\s*['"]event['"]\s*,\s*['"]view_item['"]/.test(index)) {
    add(
      'consent-view-item-ungated',
      "index.astro still calls gtag('event','view_item') inline, which fires on load regardless of consent.",
    );
  }

  // 6. The decision must be changeable, or it is not a choice.
  if (nav === null || !/MANAGE_COOKIES_HREF/.test(nav)) {
    add('consent-no-manage-entry', 'The footer offers no way to reopen preferences and change the decision.');
  }

  // 7. The policy page must describe the gate it now has.
  if (cookies === null) {
    add('consent-cookies-page-missing', '/legal/cookies not found.');
  } else if (!/analítica|analitica/i.test(cookies) || !/acept/i.test(cookies)) {
    add(
      'consent-cookies-page-stale',
      '/legal/cookies does not describe that analytics loads only after acceptance.',
    );
  }

  return issues;
}

/** Ready only when either no provider is configured, or the gate is fully present. */
export function isConsentReady(root, env = process.env) {
  if (!analyticsConfigured(env)) return true;
  return collectConsentIssues(root).length === 0;
}
