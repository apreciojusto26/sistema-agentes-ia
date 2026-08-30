import { useEffect, useState } from 'react';
import { STORAGE_KEYS, LEGACY_STORAGE_KEYS, readMigrating, writeMigrating } from '@/lib/storage-keys';
import { formatCountdown, formatCountdownIso } from '@/lib/format';

interface CountdownTimerProps {
  durationMinutes: number;
  label: string;
  expiredLabel: string;
  tone?: 'bar' | 'box';
}

// Neutral key, same reasoning as commerce:cartId. sessionStorage, so the
// blast radius of a rename is one tab — migrated anyway, because a countdown
// that restarts mid-visit looks like a bug to the person watching it.
const STORAGE_KEY = STORAGE_KEYS.offerEndsAt;
const LEGACY_STORAGE_KEY = LEGACY_STORAGE_KEYS.offerEndsAt;

function readOrSeedEndsAt(durationMinutes: number): number {
  try {
    const stored = readMigrating(window.sessionStorage, STORAGE_KEY, LEGACY_STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        return parsed;
      }
    }
  } catch {
    // sessionStorage unavailable (privacy mode) — fall through to a fresh countdown
  }

  const endsAt = Date.now() + durationMinutes * 60_000;
  try {
    writeMigrating(window.sessionStorage, STORAGE_KEY, LEGACY_STORAGE_KEY, String(endsAt));
  } catch {
    // ignore write failures
  }
  return endsAt;
}

export function CountdownTimer({ durationMinutes, label, expiredLabel, tone = 'bar' }: CountdownTimerProps) {
  // SSR-safe initial render: no storage read during render, just the full duration.
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const endsAt = readOrSeedEndsAt(durationMinutes);
    setHydrated(true);

    const tick = () => {
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [durationMinutes]);

  // R2 (spec wins over design): at zero, hide the entire urgency block instead of freezing.
  if (hydrated && secondsLeft <= 0) {
    return null;
  }

  const containerClass =
    tone === 'box'
      ? 'inline-flex items-center gap-2 rounded-tile bg-graphite/5 px-3 py-1.5'
      : 'inline-flex items-center gap-2';

  return (
    <div className={containerClass}>
      <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-bone/80">{label}</span>
      <time dateTime={formatCountdownIso(secondsLeft)} className="font-display text-sm font-bold tabular-nums text-rust">
        <span aria-hidden="true">{formatCountdown(secondsLeft)}</span>
        <span className="sr-only">{`${formatCountdown(secondsLeft)} restantes. ${expiredLabel}`}</span>
      </time>
    </div>
  );
}
