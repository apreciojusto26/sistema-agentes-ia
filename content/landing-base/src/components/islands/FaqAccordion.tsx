import { useStore } from '@nanostores/react';
import { $openFaqId } from '@/stores/ui';
import type { FaqItem } from '@/types/content';

interface FaqAccordionProps {
  items: FaqItem[];
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const openId = useStore($openFaqId);

  return (
    <div className="divide-y divide-graphite/10">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const panelId = `faq-panel-${item.id}`;
        const triggerId = `faq-trigger-${item.id}`;

        return (
          <div key={item.id}>
            <h3>
              <button
                id={triggerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => $openFaqId.set(isOpen ? null : item.id)}
                className="flex w-full items-start justify-between gap-4 py-4 text-left font-semibold text-graphite"
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
              <div className="min-h-0 overflow-hidden">
                <p className="pb-4 text-sm text-steel">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
