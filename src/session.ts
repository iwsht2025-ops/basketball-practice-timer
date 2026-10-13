import {
  createTimer,
  startTimer,
  advanceTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  type TimerConfig,
  type TimerState,
} from "./timer";
import type { AudioFeedback } from "./audio";
import type { createWakeLock } from "./wake-lock";
export type SessionDeps = {
  now(): number;
  audio: AudioFeedback;
  wake: ReturnType<typeof createWakeLock>;
  onChange(state: TimerState): void;
  onAudioAvailability(available: boolean): void;
};
export function createSession(config: TimerConfig, deps: SessionDeps) {
  let state = createTimer(config),
    generation = 0,
    disposed = false;
  function publish() {
    if (!disposed) deps.onChange(state);
  }
  function begin(playStart: boolean) {
    const token = ++generation;
    void deps.audio.unlock().then((available) => {
      if (token !== generation || disposed) return;
      deps.onAudioAvailability(available);
      if (available && playStart && state.status === "running")
        deps.audio.play("work-start");
    });
    void deps.wake.setActive(true);
    publish();
  }
  function pause() {
    if (disposed) return;
    generation++;
    state = pauseTimer(state, deps.now());
    deps.audio.stop();
    void deps.wake.setActive(false);
    publish();
  }
  return {
    getState: () => state,
    start() {
      if (disposed || state.status !== "idle") return;
      state = startTimer(state, deps.now());
      begin(true);
    },
    tick() {
      if (disposed || state.status !== "running") return;
      const result = advanceTimer(state, deps.now());
      state = result.state;
      if (state.status === "finished") {
        generation++;
        deps.audio.stop();
        void deps.wake.setActive(false);
      }
      if (result.cue) deps.audio.play(result.cue);
      publish();
    },
    pause,
    resume() {
      if (disposed || state.status !== "paused") return;
      state = resumeTimer(state, deps.now());
      begin(false);
    },
    stop() {
      if (disposed) return;
      generation++;
      state = stopTimer(state, deps.now());
      deps.audio.stop();
      void deps.wake.setActive(false);
      publish();
    },
    hide: pause,
    dispose() {
      disposed = true;
      generation++;
      deps.audio.stop();
      deps.wake.dispose();
    },
  };
}
