// @vitest-environment happy-dom
//
// PipelinePanel is MOUNTED and reachable.
//
// The panel and its transport were already covered; what was missing is the
// one thing that makes them usable — that App actually renders it. A committed
// component nobody imports is dead code, and this file is what stops it
// silently becoming that again.
//
// Follows the existing harness convention (createRoot + act, no
// @testing-library) established by useJobStream.test.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PipelinePanel from './PipelinePanel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_SRC = path.join(__dirname, '../App.tsx');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // App and the panel both open an SSE stream; happy-dom has no EventSource.
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
      set onerror(_v: unknown) {}
    },
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(node: React.ReactNode) {
  root = createRoot(container);
  act(() => root.render(node));
}

describe('PipelinePanel renders', () => {
  it('shows its form: url, scrape job, slug and the optional handle', () => {
    render(<PipelinePanel />);
    const text = container.textContent ?? '';

    expect(text).toContain('Generar una landing');
    expect(text).toContain('URL del producto');
    expect(text).toContain('Slug de la landing');
    expect(text).toContain('Handle de Shopify');
    expect(container.querySelectorAll('input')).toHaveLength(4);
  });

  it('announces PREVIEW mode until a handle is typed', () => {
    render(<PipelinePanel />);
    expect(container.textContent).toContain('Preview only');
  });

  it('switches the announced mode to commerce when a handle is entered', () => {
    render(<PipelinePanel />);
    const inputs = [...container.querySelectorAll('input')];
    const handleInput = inputs[3]!;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(handleInput, 'mi-producto');
      handleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('Commerce configured');
    // The third state is never claimed by the UI — only a real
    // verify-shopify-live.mjs run can justify it.
    expect(container.textContent).not.toContain('Shopify live verified');
  });

  it('keeps the submit button disabled until a slug exists', () => {
    render(<PipelinePanel />);
    const submit = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Generar landing'));
    expect(submit).toBeTruthy();
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it('POSTs to /api/pipeline with the form values', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pipeline: { pipelineId: 'pl_test', stages: [] } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(<PipelinePanel />);
    const inputs = [...container.querySelectorAll('input')];
    const setValue = (el: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    act(() => {
      setValue(inputs[0]!, 'https://example.com/item/1');
      setValue(inputs[2]!, 'mi-landing');
    });

    const submit = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Generar landing'),
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    await act(async () => {
      submit.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/pipeline');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.slug).toBe('mi-landing');
    expect(body.url).toBe('https://example.com/item/1');
    // Empty handle is sent as null — preview mode, not an invalid handle.
    expect(body.shopifyHandle).toBeNull();
  });

  it('surfaces a rejected start as a form error rather than failing silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'slug must be kebab-case' }) }),
    );

    render(<PipelinePanel />);
    const inputs = [...container.querySelectorAll('input')];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(inputs[2]!, 'x');
      inputs[2]!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const submit = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Generar landing'),
    ) as HTMLButtonElement;
    await act(async () => {
      submit.click();
    });

    expect(container.textContent).toContain('slug must be kebab-case');
  });
});

describe('App mounts it', () => {
  const src = () => readFileSync(APP_SRC, 'utf-8');

  it('imports and renders PipelinePanel', () => {
    expect(src()).toMatch(/import PipelinePanel from '\.\/components\/PipelinePanel'/);
    expect(src()).toMatch(/<PipelinePanel \/>/);
  });

  it('mounts it exactly once — no duplicated pipeline controls', () => {
    expect([...src().matchAll(/<PipelinePanel\b/g)]).toHaveLength(1);
  });

  it('leaves the existing per-agent flow in place', () => {
    // The mount is additive: the step-by-step surface this dashboard already
    // had must still be there, or "minimal change" would not be true.
    const s = src();
    expect(s).toContain('<GeneratorHero');
    expect(s).toContain('<AgentTimeline');
  });
});
