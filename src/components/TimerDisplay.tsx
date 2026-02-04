import { useTimerStore } from '../stores/useTimerStore';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Play, Armchair, UserCheck } from 'lucide-react';

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface TimerDisplayProps {
  sitMinutes: number;
  standMinutes: number;
  onSitMinutesChange: (value: number) => void;
  onStandMinutesChange: (value: number) => void;
}

export function TimerDisplay({
  sitMinutes,
  standMinutes,
  onSitMinutesChange,
  onStandMinutesChange,
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
    switchToSit,
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
  const isPaused = status === 'paused';

  const phaseLabel =
    status === 'stand_pending' || status === 'snoozed'
      ? '站姿'
      : currentPhase === 'sit'
        ? '坐姿'
        : '站姿';
  const switchToStandNow =
    status === 'stand_pending' || status === 'snoozed' || currentPhase === 'sit';
  const phaseTotalLabel =
    totalPhaseSeconds > 0
      ? `本阶段 ${formatTime(totalPhaseSeconds)}`
      : '';
  const statusLabel = isIdle ? '准备开始' : isPaused ? '已暂停' : `${phaseLabel}中`;
  const metaLabel = isIdle
    ? `坐 ${sitMinutes} 分 / 站 ${standMinutes} 分`
    : phaseTotalLabel || '计时进行中';

  return (
    <section className="app-panel w-full rounded-3xl p-6 sm:p-8">
      {/* 状态 */}
      <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">{statusLabel}</span>
        <span className="tabular-nums">{metaLabel}</span>
      </div>

      {/* 核心：计时器 或 设置区 */}
      <div className="flex flex-col items-center">
        {isIdle ? (
          <div className="w-full">
            <div className="mt-2 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground/80">坐姿时长</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{sitMinutes} 分钟</span>
                </div>
                <Slider
                  value={[sitMinutes]}
                  onValueChange={([v]) => onSitMinutesChange(v)}
                  min={5}
                  max={90}
                  step={5}
                />
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground/80">站姿时长</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{standMinutes} 分钟</span>
                </div>
                <Slider
                  value={[standMinutes]}
                  onValueChange={([v]) => onStandMinutesChange(v)}
                  min={3}
                  max={30}
                  step={1}
                />
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <Button
                onClick={startTimer}
                size="lg"
                className="h-12 w-full rounded-full bg-foreground text-background shadow-app-md hover:bg-foreground/90 focus-visible:ring-foreground"
              >
                <Play className="h-4 w-4" />
                开始计时
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                进入坐姿阶段，保持专注，站起时会及时提醒。
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 运行中：圆形进度 + 剩余时间 */}
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
                <span className="font-display text-4xl font-semibold tabular-nums tracking-tight text-foreground sm:text-5xl">
                  {formatTime(safeRemaining)}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">剩余</span>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white"
                    onClick={() => snooze(5)}
                  >
                    +5 分钟
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white"
                    onClick={() => snooze(10)}
                  >
                    +10 分钟
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white"
                    onClick={() => snooze(15)}
                  >
                    +15 分钟
                  </Button>
                </div>
              </div>
            )}

            {isStanding && (
              <div className="mt-8 w-full space-y-3">
                <p className="text-center text-sm text-muted-foreground">站姿完成，可以坐下</p>
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
                  继续
                </Button>
              ) : (
                <Button
                  onClick={pauseTimer}
                  size="lg"
                  variant="outline"
                  className="h-11 w-full rounded-full border-black/10 bg-white/70 text-foreground hover:bg-white"
                >
                  暂停
                </Button>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white"
                  onClick={stopTimer}
                >
                  结束
                </Button>
                {switchToStandNow ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white"
                    onClick={switchToStand}
                  >
                    切换到站姿
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-black/10 bg-white/70 text-xs text-foreground/80 hover:bg-white"
                    onClick={switchToSit}
                  >
                    切换到坐姿
                  </Button>
                )}
              </div>
            </div>

            {(status === 'sitting' || isStanding) && (
              <p className="mt-4 text-sm text-muted-foreground">
                {status === 'sitting' ? '放松肩膀，保持自然呼吸' : '膝盖微曲，脊背舒展'}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
