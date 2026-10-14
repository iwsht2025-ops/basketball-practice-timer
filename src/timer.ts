export type TimerConfig = {
  workSeconds: number;
  restSeconds: number;
  sets: number;
  endless: boolean;
};
export type Phase = "work" | "rest";
export type Cue = "work-end" | "work-start" | "session-end";
export type TimerState = {
  config: TimerConfig;
  status: "idle" | "running" | "paused" | "finished";
  phase: Phase;
  completedSets: number;
  deadlineMs: number | null;
  remainingMs: number;
  reason: "completed" | "stopped" | null;
};
export function createTimer(config: TimerConfig): TimerState {
  return {
    config: { ...config },
    status: "idle",
    phase: "work",
    completedSets: 0,
    deadlineMs: null,
    remainingMs: config.workSeconds * 1000,
    reason: null,
  };
}
export function startTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== "idle") return state;
  return { ...state, status: "running", deadlineMs: nowMs + state.remainingMs };
}
export function advanceTimer(
  state: TimerState,
  nowMs: number,
): { state: TimerState; cue: Cue | null } {
  if (state.status !== "running" || state.deadlineMs === null)
    return { state, cue: null };
  const work = state.config.workSeconds * 1000;
  const rest = state.config.restSeconds * 1000;
  const cycle = work + rest;
  const cycleStart = state.deadlineMs - (state.phase === "work" ? work : cycle);
  const baseCompleted = state.completedSets - (state.phase === "rest" ? 1 : 0);
  const finalDeadline =
    cycleStart + (state.config.sets - baseCompleted - 1) * cycle + work;
  if (!state.config.endless && nowMs >= finalDeadline) {
    return {
      state: {
        ...state,
        status: "finished",
        completedSets: state.config.sets,
        remainingMs: 0,
        deadlineMs: null,
        reason: "completed",
      },
      cue: "session-end",
    };
  }
  const elapsed = Math.max(0, nowMs - cycleStart);
  const cycles = Math.floor(elapsed / cycle);
  const offset = elapsed - cycles * cycle;
  const phase: Phase = offset < work ? "work" : "rest";
  const deadlineMs =
    cycleStart + cycles * cycle + (phase === "work" ? work : cycle);
  return {
    state: {
      ...state,
      phase,
      completedSets: baseCompleted + cycles + (phase === "rest" ? 1 : 0),
      deadlineMs,
      remainingMs: Math.max(0, deadlineMs - nowMs),
    },
    cue:
      nowMs >= state.deadlineMs
        ? phase === "work" && rest > 0
          ? "work-start"
          : "work-end"
        : null,
  };
}
export function pauseTimer(state: TimerState, nowMs: number): TimerState {
  const current = advanceTimer(state, nowMs).state;
  return current.status === "running"
    ? { ...current, status: "paused", deadlineMs: null }
    : current;
}
export function resumeTimer(state: TimerState, nowMs: number): TimerState {
  return state.status === "paused"
    ? { ...state, status: "running", deadlineMs: nowMs + state.remainingMs }
    : state;
}
export function stopTimer(state: TimerState, nowMs: number): TimerState {
  const current = advanceTimer(state, nowMs).state;
  return current.status === "finished"
    ? current
    : { ...current, status: "finished", deadlineMs: null, reason: "stopped" };
}
