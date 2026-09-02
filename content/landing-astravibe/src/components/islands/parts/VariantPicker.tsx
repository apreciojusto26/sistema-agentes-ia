import { useId } from 'react';
import type { VariantOption } from '@/lib/shopify/types';

interface VariantPickerProps {
  variants: VariantOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
}

/**
 * Compact pill group for the projection-count options. Reuses the
 * buy box's existing accessible radio pattern: role="radiogroup" + <label>
 * wrapping an sr-only native radio + has-[:checked]:/peer-checked: CSS, so
 * keyboard/arrow semantics come free.
 */
export function VariantPicker({ variants, selectedId, onSelect, label }: VariantPickerProps) {
  const groupName = useId();

  return (
    <div role="radiogroup" aria-label={label} className="space-y-2">
      <span className="block text-xs font-semibold text-graphite">{label}</span>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {variants.map((variant) => {
          const checked = variant.id === selectedId;
          const disabled = !variant.availableForSale;
          const isPopular = variant.projectionCount === 6;

          return (
            <label
              key={variant.id}
              className={`has-[:checked]:border-grape has-[:checked]:bg-grape-tint has-[:checked]:text-grape relative flex min-w-0 flex-col items-center justify-center rounded-pill border-2 border-graphite/10 px-1.5 py-2 text-center text-sm font-semibold text-graphite transition sm:px-3 ${
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
            >
              {isPopular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill bg-amber-600 px-2 py-0.5 text-[0.5625rem] font-black uppercase tracking-wider text-white shadow-card sm:text-[0.625rem]">
                  Más elegido
                </span>
              )}
              <input
                type="radio"
                name={groupName}
                value={variant.id}
                checked={checked}
                disabled={disabled}
                aria-disabled={disabled}
                onChange={() => !disabled && onSelect(variant.id)}
                className="peer sr-only"
              />
              <span className={`whitespace-nowrap ${disabled ? 'line-through' : ''}`}>{variant.title}</span>
              {disabled && <span className="text-xs font-normal text-steel">Agotado</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
