import { useId } from 'react';
import type { VariantOption } from '@/lib/shopify/types';

interface VariantPickerProps {
  variants: VariantOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
}

/**
 * Pill group over the 9 "Emitting Color" values — NOT a dropdown, so all
 * named slide configurations stay visible/comparable at a glance. Reuses the
 * buy box's existing accessible radio pattern: role="radiogroup" + <label>
 * wrapping an sr-only native radio + has-[:checked]:/peer-checked: CSS, so
 * keyboard/arrow semantics come free.
 */
export function VariantPicker({ variants, selectedId, onSelect, label }: VariantPickerProps) {
  const groupName = useId();

  return (
    <div role="radiogroup" aria-label={label} className="space-y-1.5">
      <span className="block text-xs font-semibold text-graphite">{label}</span>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const checked = variant.id === selectedId;
          const disabled = !variant.availableForSale;

          return (
            <label
              key={variant.id}
              className={`has-[:checked]:border-rust has-[:checked]:bg-rust-tint has-[:checked]:text-rust relative flex items-center rounded-pill border-2 border-graphite/10 px-3 py-2 text-sm font-semibold text-graphite transition ${
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
            >
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
              <span className={disabled ? 'line-through' : undefined}>{variant.title}</span>
              {disabled && <span className="ml-1.5 text-xs font-normal text-steel">Agotado</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
