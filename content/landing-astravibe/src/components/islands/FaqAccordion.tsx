import { useStore } from '@nanostores/react';
import { $openFaqId } from '@/stores/ui';
import type { FaqItem } from '@/types/content';

interface FaqAccordionProps {
  items: FaqItem[];
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const openId = useStore($openFaqId);

  return (
    <div className="overflow-hidden rounded-tile bg-surface shadow-card divide-y divide-graphite/10">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const panelId = `faq-panel-${item.id}`;
        const triggerId = `faq-trigger-${item.id}`;

        return (
          <div
            key={item.id}
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
