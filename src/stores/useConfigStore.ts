import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_USER_ID } from '../lib/constants';

export type UiSkin = 'classic' | 'liquid_glass';

export interface CycleConfig {
  user_id: string;
  sit_minutes: number;
  stand_minutes: number;
  notifications_enabled: boolean;
  sound_enabled: boolean;
  auto_end_enabled: boolean;
  auto_end_after_sec: number;
  ui_skin: UiSkin;
  last_updated_at: string;
}

interface ConfigStore {
  config: CycleConfig | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadConfig: () => Promise<void>;
  updateConfig: (updates: Partial<CycleConfig>) => Promise<void>;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,

  loadConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const config = await invoke<CycleConfig>('get_config', { userId: DEFAULT_USER_ID });
      set({ config, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateConfig: async (updates) => {
    const current = get().config;
    if (!current) return;

    const updated = { ...current, ...updates };
    set({ config: updated, error: null });

    try {
      await invoke('update_config_command', { config: updated });
    } catch (e) {
      // Revert on error
      set({ config: current, error: String(e) });
    }
  },
}));
