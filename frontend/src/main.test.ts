import { describe, expect, it, vi } from 'vitest';

vi.mock('./App.svelte', () => ({ default: {} }));
vi.mock('./app.css', () => ({}));

const mount = vi.fn(() => ({}));
vi.mock('svelte', () => ({ mount }));

// Stands in for the `#app` element index.html serves; main.ts calls `mountApp()` at module scope on
// the import below.
const initialTarget = {} as unknown as HTMLElement;
const getElementById = vi.fn<(id: string) => HTMLElement | null>(() => initialTarget);
vi.stubGlobal('document', { getElementById });

const { mountApp } = await import('./main');

describe('mountApp', () => {
  it('mounts the app onto the element index.html names', () => {
    const target = {} as unknown as HTMLElement;
    getElementById.mockReturnValueOnce(target);

    mountApp();

    expect(mount).toHaveBeenLastCalledWith(expect.anything(), { target });
  });

  it('throws when the served page carries no #app element', () => {
    getElementById.mockReturnValueOnce(null);

    expect(() => mountApp()).toThrow('index.html carries no #app mount element');
  });
});
