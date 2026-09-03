// Light/dark preference.
//
// Writes `data-theme` on <html>, which is the ONLY thing the palette in
// styles.css keys off. No component reads this hook except the toggle itself:
// every colour already comes from a token, so flipping the attribute re-skins
// the whole surface without any component knowing a theme exists.
//
// NOT PERSISTED, on purpose. `no-fake-spinner.test.ts` forbids any client file
// from using browser storage APIs, and that guardrail is not mine to widen for
// a convenience. The session starts on the operator's OS preference — the
// right default anyway — and an explicit choice lasts for the session. Making
// it survive a reload means authorising an exception to that rule first.
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(systemTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
