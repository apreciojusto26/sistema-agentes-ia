// @vitest-environment happy-dom
//
// THE ONE DESTRUCTIVE ACTION IN THE LIBRARY TABLE.
//
// A trash-icon button per row, a confirmation before anything is sent, and a
// re-read of outputs/ afterwards — never a local filter that could drift from
// what the server actually has left.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LandingsLibrary from './LandingsLibrary';
import type { LandingSummary } from '../http/landings';

const summary = (over: Partial<LandingSummary> = {}): LandingSummary => ({
  slug: 'zz-lib-one',
  displayName: 'Tubo de luz RGB',
  sourceTitle: 'Tubo de luz de tubo colorido',
  built: true,
  assetCount: 8,
  mode: 'preview',
  generatedAt: '2026-09-05T18:42:00.000Z',
  source: { provider: 'aliexpress', externalProductId: '1005007345199501', canonicalUrl: 'https://es.aliexpress.com/item/1005007345199501.html' },
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(landings: LandingSummary[]) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' });
      if (init?.method === 'DELETE') return { ok: true } as Response;
      return { ok: true, json: async () => ({ landings }) } as Response;
    }),
  );
  return calls;
}

async function render(landings: LandingSummary[]) {
  const calls = stubFetch(landings);
  root = createRoot(container);
  await act(async () => {
    root.render(<LandingsLibrary onOpen={() => {}} onCreateFirst={() => {}} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return calls;
}

describe('a trash-icon button deletes a generated landing', () => {
  it('one row has a delete button, labelled by the product it would remove', async () => {
    await render([summary()]);
    const trash = container.querySelector('button[aria-label*="Tubo de luz RGB"]');
    expect(trash).toBeTruthy();
    expect(trash?.getAttribute('title')).toBe('Eliminar landing');
  });

  it('clicking it asks first — the DELETE request is not sent yet', async () => {
    const calls = await render([summary()]);
    const trash = container.querySelector('button[aria-label*="Tubo de luz RGB"]') as HTMLButtonElement;
    act(() => trash.click());

    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('¿Eliminar “Tubo de luz RGB”?');
    // THE SAME WARNING LandingDetail gives, not a shorter second version that
    // could drift from it: Shopify is explicitly untouched.
    expect(dialog?.textContent).toContain('NO');
    expect(dialog?.textContent).toContain('Shopify');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('cancelling leaves the landing exactly as it was — no request at all', async () => {
    const calls = await render([summary()]);
    const trash = container.querySelector('button[aria-label*="Tubo de luz RGB"]') as HTMLButtonElement;
    act(() => trash.click());

    const cancel = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar')!;
    act(() => cancel.click());

    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    // The row is back to normal — "Ver" and the trash button are there again.
    expect(container.querySelector('button[aria-label*="Tubo de luz RGB"]')).toBeTruthy();
  });

  it('confirming sends exactly one DELETE, for this slug, then re-reads the library', async () => {
    const calls = await render([summary()]);
    const trash = container.querySelector('button[aria-label*="Tubo de luz RGB"]') as HTMLButtonElement;
    act(() => trash.click());

    const confirm = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Eliminar landing')!;
    await act(async () => {
      confirm.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.url).toContain('/api/landings/zz-lib-one');
    // A GET follows the DELETE — the list is RE-READ, not filtered locally,
    // so it can never drift from what the server actually still has.
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });

  it('a failed delete keeps the confirmation open and shows the server\'s message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: false, json: async () => ({ error: 'no se pudo eliminar: en uso' }) } as Response;
        }
        return { ok: true, json: async () => ({ landings: [summary()] }) } as Response;
      }),
    );
    root = createRoot(container);
    await act(async () => {
      root.render(<LandingsLibrary onOpen={() => {}} onCreateFirst={() => {}} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const trash = container.querySelector('button[aria-label*="Tubo de luz RGB"]') as HTMLButtonElement;
    act(() => trash.click());
    const confirm = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Eliminar landing')!;
    await act(async () => {
      confirm.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog, 'a failed delete must not silently close the confirmation').toBeTruthy();
    expect(dialog?.textContent).toContain('no se pudo eliminar: en uso');
  });

  it('only one row confirms at a time', async () => {
    await render([summary(), summary({ slug: 'zz-lib-two', displayName: 'Otra landing' })]);
    const [firstTrash, secondTrash] = [...container.querySelectorAll('button[title="Eliminar landing"]')] as HTMLButtonElement[];
    act(() => firstTrash!.click());
    expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);

    act(() => secondTrash!.click());
    // The second click's confirmation replaces the first's, never both at once.
    expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('Otra landing');
  });
});
