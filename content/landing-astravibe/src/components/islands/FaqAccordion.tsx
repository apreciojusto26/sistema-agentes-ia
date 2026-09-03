import { useStore } from '@nanostores/react';
import { $openFaqId } from '@/stores/ui';
import type { FaqItem } from '@/types/content';

interface FaqAccordionProps {
  items: FaqItem[];
}

/**
 * DOM IDENTITY COMES FROM POSITION, NOT FROM CONTENT.
 *
 * These ids used to be `faq-panel-${item.id}` / `faq-trigger-${item.id}`, with
 * `item.id` being a content slug — `que-es`, `alimentacion`. Two problems, and
 * only the second one is cosmetic:
 *
 *   1. IT WAS A REAL BUG. src/data/faq.ts ships `id: 'proyecciones'` on TWO
 *      entries, so the page rendered duplicate DOM ids, two React children
 *      with the same key, and `aria-controls` pointing at whichever panel the
 *      browser resolved first. Opening one entry opened the other.
 *   2. It leaked copy into structure: change a question's wording and its slug
 *      moves, so the same template produced a different DOM identity.
 *
 * Position is deterministic, unique by construction, and stable under a copy
 * rewrite. It is NOT a `useId()` — that would reintroduce the same class of
 * problem the island `prefix` normalization exists to absorb. There is exactly
 * one FaqAccordion per page (08-faq.astro mounts it once), so a bare index
 * cannot collide; if a second instance is ever added it needs an instance
 * prefix, and the id-uniqueness test will catch the day that happens.
 *
 * `item.id` KEEPS ITS OTHER JOB. It is still the open-state key, because that
 * is React state and never reaches the DOM. Whether it survives at all in the
 * content contract is an F3 question — the duplicate above says it deserves
 * one — and is deliberately not decided here.
 */
export function FaqAccordion({ items }: FaqAccordionProps) {
  const openId = useStore($openFaqId);

  return (
    <div className="overflow-hidden rounded-tile bg-surface shadow-card divide-y divide-graphite/10">
      {items.map((item, index) => {
        const isOpen = openId === item.id;
        const panelId = `faq-panel-${index}`;
        const triggerId = `faq-trigger-${index}`;

        return (
          <div
            key={`${index}-${item.id}`}
            className={`transition-colors ${isOpen ? 'bg-grape-tint/50' : 'bg-surface'}`}
          >
            <h3>
              <button
                id={triggerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => $openFaqId.set(isOpen ? null : item.id)}
                className="flex min-h-12 w-full items-start justify-between gap-4 px-4 py-3.5 text-left text-sm font-bold leading-snug text-graphite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-grape/40 md:px-5 md:py-4 md:text-base"
              >
                <span>{item.question}</span>
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className={`mt-0.5 size-5 shrink-0 text-steel transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                >
                  <path
                    fill="currentColor"
                    d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                  />
                </svg>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className={`grid overflow-hidden transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className={`min-h-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
                <p className="px-4 pb-4 pr-12 text-sm leading-relaxed text-graphite md:px-5 md:pb-5 md:pr-14">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
