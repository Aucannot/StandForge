// Timer States
export type TimerState =
  | 'idle'
  | 'sitting'
  | 'stand_pending'
  | 'standing'
  | 'snoozed'
  | 'paused';

export type EndSource = 'user_confirm' | 'auto_end';

// Stand Session
export interface StandSession {
  id: string;
  user_id: string;
  device_id: string;
  scheduled_start_at: string;    // ISO datetime
  actual_stand_start_at: string | null; // ISO datetime (null until user confirms)
  start_source: 'user_confirm';
  end_at: string | null;
  end_source: EndSource | null;
  duration_sec: number | null;
  snooze_count: number;
  snooze_total_sec: number;
  created_at: string;
  updated_at: string;
}

// Cycle Configuration
export interface CycleConfig {
  user_id: string;
  sit_minutes: number;
  stand_minutes: number;
  notifications_enabled: boolean;
  sound_enabled: boolean;
  auto_end_enabled: boolean;
  auto_end_after_sec: number;
  last_updated_at: string;
}

// Timer Persistence
export interface TimerStatePersisted {
  status: TimerState;
  current_session_id: string | null;
  current_phase: 'sit' | 'stand';
  phase_remaining_sec: number;
  phase_start_sec: number;
  snooze_count: number;
  updated_at: string;
}

// Statistics
export interface DailyStats {
  date: string;  // YYYY-MM-DD
  totalDurationSec: number;
  sessionCount: number;
  completionRate: number;  // 0-100
  targetMinutes: number;
}

export interface TodayStats {
  total_duration_sec: number;
  session_count: number;
  snooze_count: number;
  snooze_total_sec: number;
  completion_rate: number;
  target_stand_sec: number;
}

export interface WeeklyStats {
  days: DailyStats[];
  totalDurationSec: number;
  totalSessions: number;
  averageCompletionRate: number;
  bestDay: string | null;
}
