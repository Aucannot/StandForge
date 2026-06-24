import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Armchair,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Square,
  TimerReset,
  UserCheck,
} from 'lucide-react';
import { DEFAULT_SIT_MINUTES, DEFAULT_STAND_MINUTES, DEFAULT_USER_ID, SNOOZE_OPTIONS } from '../lib/constants';
import type { StandSession, TodayStats } from '../lib/types';
import { useConfigStore } from '../stores/useConfigStore';
import { useTimerStore } from '../stores/useTimerStore';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const NON_DRAGGABLE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[data-no-window-drag]',
  '[role="button"]',
  '[role="slider"]',
  '[role="tab"]',
].join(',');

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours > 0 && restMinutes > 0) {
    return `${hours} 小时 ${restMinutes} 分`;
  }
  if (hours > 0) {
    return `${hours} 小时`;
  }
  if (minutes > 0) {
    return `${minutes} 分`;
  }
  return `${safeSeconds} 秒`;
}

function formatSessionTime(value: string | null) {
  if (!value) {
    return '未记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未记录';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function FloatingWindow() {
  const {
    status,
    currentPhase,
    remainingSeconds,
    totalPhaseSeconds,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    switchToStand,
    confirmStand,
    confirmSit,
    snooze,
  } = useTimerStore();
  const {
    config,
    isLoading: isConfigLoading,
    error: configError,
    loadConfig,
    updateConfig,
  } = useConfigStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [sitMinutes, setSitMinutes] = useState(DEFAULT_SIT_MINUTES);
  const [standMinutes, setStandMinutes] = useState(DEFAULT_STAND_MINUTES);
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [todaySessions, setTodaySessions] = useState<StandSession[]>([]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!config) {
      return;
    }
    setSitMinutes(config.sit_minutes);
    setStandMinutes(config.stand_minutes);
  }, [config]);

  useEffect(() => {
    invoke('set_floating_expanded', { expanded: isExpanded })
      .catch(() => {
        // Browser preview has no native window to resize.
      });
  }, [isExpanded]);

  const loadTodayStats = useCallback(async () => {
    try {
      const [stats, sessions] = await Promise.all([
        invoke<TodayStats>('get_today_stats', { userId: DEFAULT_USER_ID }),
        invoke<StandSession[]>('get_today_sessions', { userId: DEFAULT_USER_ID }),
      ]);
      setTodayStats(stats);
      setTodaySessions(sessions);
    } catch {
      setTodayStats(null);
      setTodaySessions([]);
    }
  }, []);

  useEffect(() => {
    if (isExpanded) {
      void loadTodayStats();
    }
  }, [isExpanded, loadTodayStats, status]);

  const safeRemaining = Math.max(0, remainingSeconds);
  const isIdle = status === 'idle';
  const isPaused = status === 'paused';
  const isStandPrompt = status === 'stand_pending' || status === 'snoozed';
  const isStanding = status === 'standing';
  const isStandComplete = isStanding && totalPhaseSeconds > 0 && safeRemaining <= 0;
  const switchToStandNow = isStandPrompt || currentPhase === 'sit';
  const latestSessions = useMemo(() => todaySessions.slice(0, 4), [todaySessions]);

  const label = isStandPrompt
    ? '该站一会儿'
    : isStandComplete
      ? '可以坐下'
      : isPaused
        ? '已暂停'
        : isStanding
          ? '站立中'
          : currentPhase === 'sit'
            ? '屏幕使用'
            : '后台提醒';

  const stats = todayStats ?? {
    total_duration_sec: 0,
    session_count: 0,
    snooze_count: 0,
    snooze_total_sec: 0,
    completion_rate: 0,
    target_stand_sec: standMinutes * 60,
  };

  const handleDurationsCommit = useCallback(
    async (nextSitMinutes: number, nextStandMinutes: number) => {
      setSitMinutes(nextSitMinutes);
      setStandMinutes(nextStandMinutes);
      await updateConfig({
        sit_minutes: nextSitMinutes,
        stand_minutes: nextStandMinutes,
      });
    },
    [updateConfig],
  );

  const handleWindowDragStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest(NON_DRAGGABLE_SELECTOR)) {
      return;
    }

    event.preventDefault();
    try {
      void getCurrentWindow().startDragging().catch(() => {
        // Browser preview cannot drag a native Tauri window.
      });
    } catch {
      // Browser preview has no Tauri window metadata.
    }
  }, []);

  const handlePrimaryAction = async () => {
    if (isIdle) {
      await handleDurationsCommit(sitMinutes, standMinutes);
      await startTimer();
      return;
    }
    if (isStandPrompt) {
      await confirmStand();
      return;
    }
    if (isStanding) {
      await confirmSit();
      return;
    }
    if (isPaused) {
      await resumeTimer();
      return;
    }
    await pauseTimer();
  };

  const primaryLabel = isIdle
    ? '启动'
    : isStandPrompt
      ? '我已站起'
      : isStanding
        ? '我已坐下'
        : isPaused
          ? '继续'
          : '暂停';

  return (
    <div className={`floating-shell ${isExpanded ? 'floating-shell-expanded' : ''}`}>
      <main
        className={`floating-card ${isExpanded ? 'floating-card-expanded' : ''}`}
        onPointerDown={handleWindowDragStart}
      >
        <header className="floating-header">
          <div className="floating-drag">
            <p className="floating-kicker">StandForge</p>
            <p className="floating-time">{formatTime(isIdle ? sitMinutes * 60 : safeRemaining)}</p>
          </div>

          <div className="floating-side">
            <p className="floating-status">{label}</p>
            <div className="floating-actions">
              <button
                type="button"
                className="floating-icon-btn"
                onClick={() => setIsExpanded((value) => !value)}
                aria-label={isExpanded ? '收起设置' : '展开设置'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                className="floating-icon-btn floating-primary-btn"
                onClick={handlePrimaryAction}
                aria-label={primaryLabel}
              >
                {isIdle ? (
                  <Play className="h-3.5 w-3.5" />
                ) : isStandPrompt ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isStanding ? (
                  <Armchair className="h-3.5 w-3.5" />
                ) : isPaused ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </header>

        {isExpanded && (
          <section className="floating-panel">
            <Tabs defaultValue="control" className="w-full">
              <TabsList className="floating-tabs-list">
                <TabsTrigger value="control" className="floating-tabs-trigger">
                  <TimerReset className="h-3.5 w-3.5" />
                  提醒
                </TabsTrigger>
                <TabsTrigger value="settings" className="floating-tabs-trigger">
                  <Settings2 className="h-3.5 w-3.5" />
                  设置
                </TabsTrigger>
                <TabsTrigger value="today" className="floating-tabs-trigger">
                  <BarChart3 className="h-3.5 w-3.5" />
                  今日
                </TabsTrigger>
              </TabsList>

              <TabsContent value="control" className="floating-tab-content">
                <div className="floating-section">
                  <div className="floating-section-header">
                    <span className="floating-dot" />
                    <div>
                      <p className="floating-section-title">{label}</p>
                      <p className="floating-section-copy">
                        {isIdle
                          ? `屏幕 ${sitMinutes} 分 / 站立 ${standMinutes} 分`
                          : totalPhaseSeconds > 0
                            ? `本轮 ${formatTime(totalPhaseSeconds)}`
                            : '后台提醒运行中'}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    disabled={isConfigLoading}
                    onClick={handlePrimaryAction}
                    className="floating-wide-button floating-solid-button"
                  >
                    {isIdle ? (
                      <Play className="h-4 w-4" />
                    ) : isStandPrompt ? (
                      <UserCheck className="h-4 w-4" />
                    ) : isStanding ? (
                      <Armchair className="h-4 w-4" />
                    ) : isPaused ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                    {primaryLabel}
                  </Button>

                  {isStandPrompt && (
                    <div className="floating-chip-row">
                      {SNOOZE_OPTIONS.map((minutes) => (
                        <Button
                          key={minutes}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="floating-chip-button"
                          onClick={() => snooze(minutes)}
                        >
                          +{minutes} 分钟
                        </Button>
                      ))}
                    </div>
                  )}

                  <div className="floating-chip-row">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="floating-chip-button"
                      onClick={stopTimer}
                    >
                      <Square className="h-3.5 w-3.5" />
                      结束
                    </Button>
                    {switchToStandNow && !isIdle && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="floating-chip-button"
                        onClick={switchToStand}
                      >
                        现在站立
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="floating-tab-content">
                <div className="floating-section">
                  <div className="floating-setting-row">
                    <div className="floating-setting-label">
                      <span>屏幕使用</span>
                      <strong>{sitMinutes} 分钟</strong>
                    </div>
                    <Slider
                      data-no-window-drag
                      aria-label="屏幕使用时长"
                      value={[sitMinutes]}
                      min={5}
                      max={90}
                      step={5}
                      onValueChange={([value]) => setSitMinutes(value)}
                      onValueCommit={([value]) => void handleDurationsCommit(value, standMinutes)}
                    />
                  </div>

                  <div className="floating-setting-row">
                    <div className="floating-setting-label">
                      <span>站立</span>
                      <strong>{standMinutes} 分钟</strong>
                    </div>
                    <Slider
                      data-no-window-drag
                      aria-label="站立时长"
                      value={[standMinutes]}
                      min={3}
                      max={30}
                      step={1}
                      onValueChange={([value]) => setStandMinutes(value)}
                      onValueCommit={([value]) => void handleDurationsCommit(sitMinutes, value)}
                    />
                  </div>

                  <div className="floating-note">
                    <Clock3 className="h-4 w-4 text-primary" />
                    <p>
                      屏幕使用 {sitMinutes} 分钟，站立 {standMinutes} 分钟。
                      {isIdle ? ' 新设置会自动保存。' : ' 当前阶段结束后生效。'}
                    </p>
                  </div>

                  {configError && (
                    <p className="floating-error">设置未保存：{configError}</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="today" className="floating-tab-content">
                <div className="floating-stats-grid">
                  <div className="floating-stat">
                    <span>站立总时长</span>
                    <strong>{formatDuration(stats.total_duration_sec)}</strong>
                  </div>
                  <div className="floating-stat">
                    <span>完成次数</span>
                    <strong>{stats.session_count}</strong>
                  </div>
                  <div className="floating-stat">
                    <span>完成率</span>
                    <strong>{stats.completion_rate}%</strong>
                  </div>
                </div>

                <div className="floating-record-header">
                  <p>今日记录</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="floating-refresh-button"
                    onClick={() => void loadTodayStats()}
                    aria-label="刷新今日记录"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {latestSessions.length > 0 ? (
                  <div className="floating-record-list">
                    {latestSessions.map((session) => (
                      <div key={session.id} className="floating-record">
                        <div>
                          <p>
                            {formatSessionTime(session.actual_stand_start_at)} - {formatSessionTime(session.end_at)}
                          </p>
                          <span>延后 {session.snooze_count} 次</span>
                        </div>
                        <strong>{formatDuration(session.duration_sec ?? 0)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="floating-empty">
                    <p>今天还没有完成记录</p>
                    <span>完成一次站立后会出现在这里。</span>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>
        )}
      </main>
    </div>
  );
}
