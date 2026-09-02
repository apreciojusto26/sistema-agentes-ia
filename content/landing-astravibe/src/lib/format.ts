const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

const percentFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** cents (integer) -> localized "12,90 €" string. The ONLY place cents become strings. */
export function formatPrice(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/** 0.42 -> "42%" */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

/**
 * totalSeconds -> "MM:SS" (or "HH:MM:SS" once >= 1h).
 * Always zero-padded, tabular-nums friendly.
 */
export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  return `${mm}:${ss}`;
}

/** "MM:SS" or "HH:MM:SS" -> ISO 8601 duration for <time dateTime="PT14M32S"> */
export function formatCountdownIso(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  let iso = 'PT';
  if (hours > 0) iso += `${hours}H`;
  if (minutes > 0 || hours > 0) iso += `${minutes}M`;
  iso += `${seconds}S`;
  return iso;
}
