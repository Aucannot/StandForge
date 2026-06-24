import { useMemo } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Activity, Armchair, Clock3, Monitor, Settings2, UserCheck } from 'lucide-react';
import { Button } from './ui/button';
import { SNOOZE_OPTIONS } from '../lib/constants';
import { useTimerStore } from '../stores/useTimerStore';
import { invoke } from '@tauri-apps/api/core';

function formatTime(seconds: number) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function hideReminder() {
  try {
    await getCurrentWindow().hide();
  } catch {
    // The browser preview cannot hide a Tauri window.
  }
}

export function ReminderWindow() {
  const {
    status,
    remainingSeconds,
    totalPhaseSeconds,
    confirmStand,
    confirmSit,
    snooze,
  } = useTimerStore();

  const isStandComplete = status === 'standing' && totalPhaseSeconds > 0 && remainingSeconds <= 0;
  const isStandReminder = status === 'stand_pending' || status === 'snoozed';

  const copy = useMemo(() => {
    if (isStandComplete) {
      return {
        icon: Armchair,
        title: '可以坐下了',
        body: '这段站立已经完成。确认坐下后，StandForge 会继续在后台记录下一轮屏幕使用时间。',
        timeLabel: '本轮站立完成',
      };
    }

    return {
      icon: Monitor,
      title: '屏幕用久了，站一会儿',
      body: '先离开椅子，伸展肩颈和背部。点“我已站起”后开始记录站立时间。',
      timeLabel: status === 'snoozed' ? '延后已结束' : '屏幕使用时间已到',
    };
  }, [isStandComplete, status]);

  const Icon = copy.icon;

  const handleConfirmStand = async () => {
    await confirmStand();
    await hideReminder();
  };

  const handleConfirmSit = async () => {
    await confirmSit();
    await hideReminder();
  };

  const handleSnooze = async (minutes: number) => {
    await snooze(minutes);
    await hideReminder();
  };

  const handleOpenSettings = async () => {
    try {
      await invoke('show_window');
    } catch {
      // Browser preview has no Tauri command bridge.
    }
  };

  return (
    <div className="reminder-shell min-h-screen">
      <main className="reminder-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-app-sm">
              <Icon className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">StandForge reminder</p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">{copy.title}</h1>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground transition-colors duration-150 hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
            onClick={handleOpenSettings}
            aria-label="打开设置"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-black/10 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <Clock3 className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">{copy.timeLabel}</p>
          </div>
          {!isStandReminder && !isStandComplete && (
            <p className="mt-3 font-display text-4xl font-semibold tabular-nums text-foreground">
              {formatTime(remainingSeconds)}
            </p>
          )}
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.body}</p>
        </div>

        <div className="mt-6 space-y-3">
          {isStandComplete ? (
            <Button
              className="h-12 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={handleConfirmSit}
            >
              <Armchair className="h-4 w-4" />
              我已坐下
            </Button>
          ) : (
            <>
              <Button
                className="h-12 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={handleConfirmStand}
              >
                <UserCheck className="h-4 w-4" />
                我已站起
              </Button>
              <div className="grid grid-cols-3 gap-2">
                {SNOOZE_OPTIONS.map((minutes) => (
                  <Button
                    key={minutes}
                    variant="outline"
                    className="h-10 rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                    onClick={() => handleSnooze(minutes)}
                  >
                    {minutes} 分后
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
          onClick={hideReminder}
        >
          <Activity className="h-3.5 w-3.5" />
          暂时隐藏
        </button>
      </main>
    </div>
  );
}
