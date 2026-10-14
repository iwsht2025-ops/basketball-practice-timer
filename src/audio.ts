import type { Cue } from "./timer";
export type AudioFeedback = {
  unlock(): Promise<boolean>;
  play(cue: Cue): void;
  stop(): void;
  setEnabled(enabled: boolean): void;
};
export function createAudioFeedback(
  factory = () => {
    const Constructor =
      globalThis.AudioContext ??
      (
        globalThis as typeof globalThis & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!Constructor) throw new Error("Audio unavailable");
    return new Constructor();
  },
): AudioFeedback {
  let context: AudioContext | undefined,
    enabled = true,
    ready = false;
  const nodes = new Set<OscillatorNode>();
  function stop() {
    for (const node of nodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    nodes.clear();
  }
  return {
    async unlock() {
      if (!enabled) return true;
      try {
        context ??= factory();
        await context.resume();
        ready = context.state === "running";
        return ready;
      } catch {
        ready = false;
        return false;
      }
    },
    play(cue) {
      if (!enabled || !ready || !context || context.state !== "running") return;
      stop();
      // Two simultaneous pitches and rich harmonics approximate a court buzzer.
      // A soft attack/release avoids clicks; completion has a longer sustain.
      const tones = [220, 330];
      const duration = cue === "work-start" ? 0.22 : cue === "work-end" ? 0.55 : 1.05;
      const start = context.currentTime,
        end = start + duration;
      tones.forEach((frequency) => {
        const node = context!.createOscillator(),
          gain = context!.createGain();
        node.type = "sawtooth";
        node.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.11, start + 0.012);
        gain.gain.setValueAtTime(0.11, end - 0.035);
        gain.gain.linearRampToValueAtTime(0, end);
        node.connect(gain);
        gain.connect(context!.destination);
        nodes.add(node);
        node.onended = () => {
          nodes.delete(node);
          node.disconnect();
          gain.disconnect();
        };
        node.start(start);
        node.stop(end);
      });
    },
    stop,
    setEnabled(value) {
      enabled = value;
      if (!value) stop();
    },
  };
}
