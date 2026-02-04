import { useEffect, useState } from 'react';
import { TimerDisplay } from './components/TimerDisplay';
import { setupTimerListeners } from './stores/useTimerStore';
import { Activity } from 'lucide-react';
import { useTimerStore } from './stores/useTimerStore';
import { DEFAULT_SIT_MINUTES, DEFAULT_STAND_MINUTES } from './lib/constants';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  useEffect(() => {
    setupTimerListeners();
  }, []);

  const {
    status,
    currentPhase,
    remainingSeconds,
    syncState,
    pauseTimer,
    resumeTimer,
    stopTimer,
    switchToStand,
    switchToSit,
  } = useTimerStore();
  const [sitMinutes, setSitMinutes] = useState(DEFAULT_SIT_MINUTES);
  const [standMinutes, setStandMinutes] = useState(DEFAULT_STAND_MINUTES);
  const [windowLabel] = useState(() => {
    try {
      return getCurrentWindow().label;
    } catch {
      return 'main';
    }
  });
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);

  const isIdle = status === 'idle';
  const headerSeconds = isIdle ? sitMinutes * 60 : Math.max(0, remainingSeconds);
  const headerLabel = isIdle
    ? '下一段坐姿'
    : status === 'paused'
      ? '已暂停'
      : status === 'stand_pending' || status === 'snoozed'
        ? '该站起了'
        : currentPhase === 'sit'
          ? '坐姿中'
        : '站姿中';
  const isPaused = status === 'paused';

  useEffect(() => {
    if (windowLabel === 'floating') {
      document.body.classList.add('is-floating');
      document.documentElement.classList.add('is-floating');
    } else {
      document.body.classList.remove('is-floating');
      document.documentElement.classList.remove('is-floating');
    }
  }, [windowLabel]);

  useEffect(() => {
    if (windowLabel === 'floating') {
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | undefined;
    listen<{ phase: string; next_phase: string }>('phase-complete', (event) => {
      const title = event.payload.phase === 'sit' ? '该站起来了' : '可以坐下了';
      const body =
        event.payload.phase === 'sit'
          ? '点击“我已站起”确认'
          : '点击“我已坐下”开始新循环';
      setNotice({ title, body });
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => setNotice(null), 5000);
      try {
        getCurrentWindow().requestUserAttention(UserAttentionType.Informational);
      } catch {
        // ignore if not supported
      }
    })
      .then((unlistenFn) => {
        unlisten = unlistenFn;
      })
      .catch(() => {
        // ignore if not supported
      });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (unlisten) {
        unlisten();
      }
    };
  }, [windowLabel]);

  useEffect(() => {
    if (windowLabel !== 'floating') {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await syncState();
    };
    poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [syncState, windowLabel]);

  if (windowLabel === 'floating') {
    return (
      <div className="floating-shell h-full w-full">
        <div className="floating-card">
          <div className="floating-content">
            <div className="floating-left" data-tauri-drag-region>
              <p className="floating-brand">StandForge</p>
              <div className="floating-time">{formatTime(headerSeconds)}</div>
            </div>
            <div className="floating-right">
              <p className="floating-status">{headerLabel}</p>
              <div className="floating-actions">
                <button
                  className="floating-btn"
                  onClick={isPaused ? resumeTimer : pauseTimer}
                  aria-label={isPaused ? '继续' : '暂停'}
                >
                  {isPaused ? '▶︎' : '⏸︎'}
                </button>
                <button
                  className="floating-btn"
                  onClick={stopTimer}
                  aria-label="结束"
                >
                  ⏹
                </button>
                <button
                  className="floating-btn"
                  onClick={currentPhase === 'sit' ? switchToStand : switchToSit}
                  aria-label="切换状态"
                >
                  ⇄
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      {notice && (
        <div className="pointer-events-none fixed right-6 top-6 z-50">
          <div className="app-panel pointer-events-auto w-64 rounded-2xl px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{notice.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{notice.body}</p>
          </div>
        </div>
      )}
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12 sm:py-16">
        {/* 品牌区 */}
        <header className="flex flex-col items-center text-center animate-fade-up">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-black/10 bg-white/70 text-foreground shadow-app-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <Activity className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <p className="whitespace-nowrap text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Standing Desk Timer
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            StandForge
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
            {headerLabel}
          </p>
          <div className="hero-time -mt-0.5 font-display font-black tabular-nums tracking-tight text-foreground">
            {formatTime(headerSeconds)}
          </div>
          <p className="mt-3 max-w-xl text-sm leading-snug text-muted-foreground sm:text-base">
            45-15-1 节奏，让坐站切换保持流畅专注。简洁的提醒，柔和地推动你站起活动。
          </p>
        </header>

        {/* 主内容 */}
        <main className="mt-8 flex-1 animate-fade-up anim-delay-1">
          <TimerDisplay
            sitMinutes={sitMinutes}
            standMinutes={standMinutes}
            onSitMinutesChange={setSitMinutes}
            onStandMinutesChange={setStandMinutes}
          />
        </main>

        {/* 底部说明 */}
        <footer className="mt-4" />
      </div>
    </div>
  );
}

export default App;
