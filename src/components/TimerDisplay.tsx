import { useMemo } from 'react';
import { useTimerStore } from '../stores/useTimerStore';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { SNOOZE_OPTIONS } from '../lib/constants';
import type { StandSession, TodayStats } from '../lib/types';
import {
  Armchair,
  BarChart3,
  Clock3,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Square,
  TimerReset,
  UserCheck,
} from 'lucide-react';

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
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

interface TimerDisplayProps {
  sitMinutes: number;
  standMinutes: number;
  todayStats: TodayStats | null;
  todaySessions: StandSession[];
  isConfigLoading: boolean;
  configError: string | null;
  onSitMinutesChange: (value: number) => void;
  onStandMinutesChange: (value: number) => void;
  onDurationsCommit: (sitMinutes: number, standMinutes: number) => Promise<void> | void;
  onRefreshStats: () => Promise<void> | void;
}

export function TimerDisplay({
  sitMinutes,
  standMinutes,
  todayStats,
  todaySessions,
  isConfigLoading,
  configError,
  onSitMinutesChange,
  onStandMinutesChange,
  onDurationsCommit,
  onRefreshStats,
}: TimerDisplayProps) {
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

  const safeRemaining = Math.max(0, remainingSeconds);
  const progress =
    totalPhaseSeconds > 0 ? (totalPhaseSeconds - safeRemaining) / totalPhaseSeconds : 0;
  const progressDeg = Math.min(1, Math.max(0, progress)) * 360;

  const isIdle = status === 'idle';
  const isStandPending = status === 'stand_pending' || status === 'snoozed';
  const isStanding = status === 'standing';
  const isStandComplete = isStanding && totalPhaseSeconds > 0 && safeRemaining === 0;
  const isPaused = status === 'paused';

  const phaseLabel =
    status === 'stand_pending' || status === 'snoozed'
      ? '等待站起'
      : currentPhase === 'sit'
        ? '屏幕使用'
        : '站立';
  const switchToStandNow =
    status === 'stand_pending' || status === 'snoozed' || currentPhase === 'sit';
  const phaseTotalLabel =
    totalPhaseSeconds > 0
      ? `本轮 ${formatTime(totalPhaseSeconds)}`
      : '';
  const statusLabel = isIdle
    ? '准备开始'
    : isPaused
      ? '已暂停'
      : status === 'snoozed'
        ? '已延后'
        : isStandPending
          ? '等待站起'
          : isStandComplete
            ? '站立完成'
            : `${phaseLabel}中`;
  const metaLabel = isIdle
    ? `屏幕 ${sitMinutes} 分 / 站立 ${standMinutes} 分`
    : phaseTotalLabel || '后台提醒运行中';
  const latestSessions = useMemo(() => todaySessions.slice(0, 5), [todaySessions]);

  const stats = todayStats ?? {
    total_duration_sec: 0,
    session_count: 0,
    snooze_count: 0,
    snooze_total_sec: 0,
    completion_rate: 0,
    target_stand_sec: standMinutes * 60,
  };

  const handleStart = async () => {
    await onDurationsCommit(sitMinutes, standMinutes);
    await startTimer();
  };

  const handleSitCommit = ([value]: number[]) => {
    void onDurationsCommit(value, standMinutes);
  };

  const handleStandCommit = ([value]: number[]) => {
    void onDurationsCommit(sitMinutes, value);
  };

  return (
    <section className="app-panel w-full rounded-3xl p-5 sm:p-6">
      <Tabs defaultValue="control" className="w-full">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {statusLabel}
            </div>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">{metaLabel}</p>
          </div>
          <TabsList className="h-10 rounded-full bg-black/[0.04] p-1 dark:bg-white/10">
            <TabsTrigger value="control" className="gap-1.5 rounded-full px-3 text-xs">
              <TimerReset className="h-3.5 w-3.5" />
              提醒
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 rounded-full px-3 text-xs">
              <Settings2 className="h-3.5 w-3.5" />
              设置
            </TabsTrigger>
            <TabsTrigger value="today" className="gap-1.5 rounded-full px-3 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              今日
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="control" className="mt-6 focus-visible:ring-0 focus-visible:ring-offset-0">
          {isIdle ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-black/10 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-medium text-foreground">后台提醒节奏</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">屏幕使用</p>
                    <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
                      {sitMinutes}
                      <span className="ml-1 font-sans text-sm font-medium text-muted-foreground">分</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">站立</p>
                    <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
                      {standMinutes}
                      <span className="ml-1 font-sans text-sm font-medium text-muted-foreground">分</span>
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleStart}
                size="lg"
                disabled={isConfigLoading}
                className="h-12 w-full rounded-full bg-foreground text-background shadow-app-md hover:bg-foreground/90 focus-visible:ring-foreground"
              >
                <Play className="h-4 w-4" />
                启动后台提醒
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                启动后会在后台记录屏幕使用时间，到点弹窗提醒。
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
                <div
                  className="absolute inset-0 rounded-full p-[3px]"
                  style={{
                    background: `conic-gradient(hsl(var(--primary)) ${progressDeg}deg, hsl(var(--muted)) 0deg)`,
                  }}
                >
                  <div className="h-full w-full rounded-full bg-white/80 dark:bg-white/5" />
                </div>
                <div className="relative flex flex-col items-center">
                  <span className="font-display text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
                    {formatTime(safeRemaining)}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {isStandComplete ? '待确认' : '剩余'}
                  </span>
                </div>
              </div>

              {isStandPending && (
                <div className="mt-8 w-full space-y-3">
                  <p className="text-center text-sm text-muted-foreground">该站起活动了</p>
                  <Button
                    onClick={confirmStand}
                    size="lg"
                    className="h-11 w-full rounded-full bg-foreground text-background shadow-app-md hover:bg-foreground/90"
                  >
                    <UserCheck className="h-4 w-4" />
                    我已站起
                  </Button>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SNOOZE_OPTIONS.map((minutes) => (
                      <Button
                        key={minutes}
                        variant="outline"
                        size="sm"
                        className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                        onClick={() => snooze(minutes)}
                      >
                        +{minutes} 分钟
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {isStanding && (
                <div className="mt-8 w-full space-y-3">
                  <p className="text-center text-sm text-muted-foreground">
                    {isStandComplete ? '站立完成，可以坐下' : '保持自然呼吸，重心放稳'}
                  </p>
                  <Button
                    onClick={confirmSit}
                    size="lg"
                    className="h-11 w-full rounded-full bg-white/80 text-foreground shadow-app-sm hover:bg-white dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                  >
                    <Armchair className="h-4 w-4" />
                    我已坐下
                  </Button>
                </div>
              )}

              <div className="mt-8 w-full space-y-3">
                {isPaused ? (
                  <Button
                    onClick={resumeTimer}
                    size="lg"
                    className="h-11 w-full rounded-full bg-foreground text-background shadow-app-md hover:bg-foreground/90"
                  >
                    <Play className="h-4 w-4" />
                    继续
                  </Button>
                ) : (
                  <Button
                    onClick={pauseTimer}
                    size="lg"
                    variant="outline"
                    className="h-11 w-full rounded-full border-black/10 bg-white/70 text-foreground hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                  >
                    <Pause className="h-4 w-4" />
                    暂停
                  </Button>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                    onClick={stopTimer}
                  >
                    <Square className="h-3.5 w-3.5" />
                    结束
                  </Button>
                  {switchToStandNow && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                      onClick={switchToStand}
                    >
                      现在开始站立
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-6 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground/80">屏幕使用时长</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{sitMinutes} 分钟</span>
                </div>
                <Slider
                  aria-label="屏幕使用时长"
                  value={[sitMinutes]}
                  onValueChange={([value]) => onSitMinutesChange(value)}
                  onValueCommit={handleSitCommit}
                  min={5}
                  max={90}
                  step={5}
                />
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground/80">站立时长</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{standMinutes} 分钟</span>
                </div>
                <Slider
                  aria-label="站立时长"
                  value={[standMinutes]}
                  onValueChange={([value]) => onStandMinutesChange(value)}
                  onValueCommit={handleStandCommit}
                  min={3}
                  max={30}
                  step={1}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">当前循环</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    屏幕使用 {sitMinutes} 分钟，站立 {standMinutes} 分钟。{isIdle ? '新设置会自动保存。' : '正在进行的阶段结束后生效。'}
                  </p>
                </div>
              </div>
              {configError && (
                <p className="mt-3 text-xs text-destructive">
                  设置未保存：{configError}
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="today" className="mt-6 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/10 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-muted-foreground">站立总时长</p>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-primary">
                {formatDuration(stats.total_duration_sec)}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-muted-foreground">完成次数</p>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-foreground">
                {stats.session_count}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-muted-foreground">完成率</p>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-foreground">
                {stats.completion_rate}%
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">今日记录</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-2 text-xs text-muted-foreground"
                onClick={() => onRefreshStats()}
                aria-label="刷新今日记录"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {latestSessions.length > 0 ? (
              <div className="divide-y divide-black/10 rounded-2xl border border-black/10 bg-white/45 dark:divide-white/10 dark:border-white/10 dark:bg-white/5">
                {latestSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <p className="truncate text-sm font-medium text-foreground">
                          {formatSessionTime(session.actual_stand_start_at)} - {formatSessionTime(session.end_at)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        延后 {session.snooze_count} 次，共 {formatDuration(session.snooze_total_sec)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatDuration(session.duration_sec ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-black/15 bg-white/35 px-4 py-8 text-center dark:border-white/15 dark:bg-white/5">
                <p className="text-sm font-medium text-foreground">今天还没有完成记录</p>
                <p className="mt-1 text-xs text-muted-foreground">完成一次站立后会出现在这里。</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
