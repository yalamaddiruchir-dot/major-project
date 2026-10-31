import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

expect.extend(toHaveNoViolations);

// Expose jest-compatible mock alias for tests
if (typeof globalThis.jest === 'undefined') {
  globalThis.jest = vi;
}

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  }

  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/offline-media-mock');
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = vi.fn();
  }

  window.scrollTo = vi.fn();

  // Stub HTMLMediaElement playback methods in JSDOM
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
}
