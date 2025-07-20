/**
 * Test setup file for vitest
 */

import { vi } from 'vitest';

// Mock fetch globally for tests
global.fetch = vi.fn();

// Mock browser extension APIs if needed
(global as any).chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn()
    }
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn()
    }
  }
};

// Also set up browser global for compatibility
(global as any).browser = (global as any).chrome;