import { describe, expect, it } from 'vitest';

import { normalizeStatus } from './useTimerStore';

describe('normalizeStatus', () => {
  it('normalizes the legacy standpending value', () => {
    expect(normalizeStatus('standpending')).toBe('stand_pending');
  });

  it('keeps supported timer states unchanged', () => {
    expect(normalizeStatus('sitting')).toBe('sitting');
    expect(normalizeStatus('standing')).toBe('standing');
    expect(normalizeStatus('paused')).toBe('paused');
  });

  it('falls back to idle for unknown backend values', () => {
    expect(normalizeStatus('corrupt-state')).toBe('idle');
  });
});
