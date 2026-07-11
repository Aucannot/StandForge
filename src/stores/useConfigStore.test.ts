import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type CycleConfig, useConfigStore } from './useConfigStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const baseConfig: CycleConfig = {
  user_id: 'default_user',
  sit_minutes: 45,
  stand_minutes: 15,
  notifications_enabled: true,
  sound_enabled: true,
  auto_end_enabled: false,
  auto_end_after_sec: 3_600,
  ui_skin: 'liquid_glass',
  last_updated_at: '2026-07-11T00:00:00Z',
};

describe('useConfigStore', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useConfigStore.setState({ config: baseConfig, isLoading: false, error: null });
  });

  it('reports a successful persisted update', async () => {
    invokeMock.mockResolvedValue(undefined);

    await expect(useConfigStore.getState().updateConfig({ sit_minutes: 50 })).resolves.toBe(true);
    expect(useConfigStore.getState().config?.sit_minutes).toBe(50);
  });

  it('reverts optimistic state when persistence fails', async () => {
    invokeMock.mockRejectedValue(new Error('database unavailable'));

    await expect(useConfigStore.getState().updateConfig({ sit_minutes: 50 })).resolves.toBe(false);
    expect(useConfigStore.getState().config?.sit_minutes).toBe(45);
    expect(useConfigStore.getState().error).toContain('database unavailable');
  });
});
