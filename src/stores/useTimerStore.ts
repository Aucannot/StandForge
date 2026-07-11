import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_USER_ID } from '../lib/constants';
import { getDeviceId } from '../lib/utils';

export type TimerState = 'idle' | 'sitting' | 'stand_pending' | 'standing' | 'snoozed' | 'paused';

export interface TimerStore {
  // Current timer state
  status: TimerState;
  currentPhase: 'sit' | 'stand';
  remainingSeconds: number;
  totalPhaseSeconds: number;
  currentSessionId: string | null;

  // Actions
  startTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  stopTimer: () => Promise<void>;
  switchToStand: () => Promise<void>;
  switchToSit: () => Promise<void>;
  confirmStand: () => Promise<void>;
  confirmSit: () => Promise<void>;
  snooze: (minutes: number) => Promise<void>;
  syncState: () => Promise<void>;
  hydrateState: (state: any) => void;
}

interface TimerStatePayload {
  status: TimerState;
  current_phase: 'sit' | 'stand';
  remaining_seconds: number;
  total_phase_seconds: number;
  current_session_id?: string | null;
}

export function normalizeStatus(status: string): TimerState {
  switch (status) {
    case 'standpending':
      return 'stand_pending';
    case 'stand_pending':
    case 'idle':
    case 'sitting':
    case 'standing':
    case 'snoozed':
    case 'paused':
      return status;
    default:
      return 'idle';
  }
}

function applyState(setter: (partial: Partial<TimerStore>) => void, state: TimerStatePayload) {
  const nextState: Partial<TimerStore> = {
    status: normalizeStatus(state.status),
    currentPhase: state.current_phase,
    remainingSeconds: state.remaining_seconds,
    totalPhaseSeconds: state.total_phase_seconds,
  };

  if ('current_session_id' in state) {
    nextState.currentSessionId = state.current_session_id ?? null;
  }

  setter(nextState);
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  // Initial state
  status: 'idle',
  currentPhase: 'sit',
  remainingSeconds: 0,
  totalPhaseSeconds: 0,
  currentSessionId: null,

  // Actions
  startTimer: async () => {
    const sessionId = await invoke<string>('start_timer', {
      userId: DEFAULT_USER_ID,
      deviceId: getDeviceId(),
    });
    try {
      const state = await invoke<TimerStatePayload>('get_timer_state');
      applyState(set, {
        ...state,
        current_session_id: state.current_session_id ?? sessionId,
      });
    } catch {
      set({
        status: 'sitting',
        currentPhase: 'sit',
        currentSessionId: sessionId,
      });
    }
  },

  pauseTimer: async () => {
    await invoke('pause_timer');
    await get().syncState();
  },

  resumeTimer: async () => {
    await invoke('resume_timer');
    await get().syncState();
  },

  stopTimer: async () => {
    await invoke('stop_timer');
    await get().syncState();
  },

  switchToStand: async () => {
    await invoke('switch_to_stand');
    await get().syncState();
  },

  switchToSit: async () => {
    await invoke('switch_to_sit');
    await get().syncState();
  },

  confirmStand: async () => {
    await invoke('confirm_stand');
    await get().syncState();
  },

  confirmSit: async () => {
    await invoke('confirm_sit');
    await get().syncState();
  },

  snooze: async (minutes: number) => {
    await invoke('snooze_stand', { snoozeMinutes: minutes });
    await get().syncState();
  },

  syncState: async () => {
    try {
      const state = await invoke<TimerStatePayload>('get_timer_state');
      applyState(set, state);
    } catch {
      // ignore if backend not available
    }
  },

  hydrateState: (state) => {
    applyState(set, state);
  },
}));

let listenersStarted = false;

// Set up listener for timer events
export function setupTimerListeners() {
  if (listenersStarted) {
    return;
  }
  listenersStarted = true;

  // Listen for timer tick events from Rust backend
  listen<TimerStatePayload>(
    'timer-tick',
    (event) => {
      const store = useTimerStore.getState();
      store.hydrateState(event.payload);
    }
  ).catch(() => {
    listenersStarted = false;
  });

  // Listen for phase complete events
  listen<{ phase: string; next_phase: string; auto_ended?: boolean }>('phase-complete', () => {
    const store = useTimerStore.getState();
    void store.syncState();
  }).catch(() => {
    listenersStarted = false;
  });
}
