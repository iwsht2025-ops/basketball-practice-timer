import { describe, expect, it } from "vitest";
import {
  createTimer,
  startTimer,
  advanceTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
} from "./timer";

const config = { workSeconds: 40, restSeconds: 5, sets: 3, endless: false };
const start = (overrides = {}) =>
  startTimer(createTimer({ ...config, ...overrides }), 0);
describe("interval timer", () => {
  it.each([
    [39999, "work", 0, 1],
    [40000, "rest", 1, 5000],
    [45000, "work", 1, 40000],
    [85000, "rest", 2, 5000],
    [90000, "work", 2, 40000],
  ])(
    "resolves boundary %i without drift",
    (now, phase, completed, remaining) => {
      expect(advanceTimer(start(), now as number).state).toMatchObject({
        status: "running",
        phase,
        completedSets: completed,
        remainingMs: remaining,
      });
    },
  );
  it("finishes 40/5/3 in 130 seconds without a final rest", () => {
    const result = advanceTimer(start(), 130000);
    expect(result.state).toMatchObject({
      status: "finished",
      completedSets: 3,
      reason: "completed",
      remainingMs: 0,
    });
    expect(result.cue).toBe("session-end");
  });
  it("finishes one set without adding any rest", () => {
    expect(advanceTimer(start({ sets: 1 }), 40000).state.status).toBe(
      "finished",
    );
  });
  it("skips zero rest and emits only the next-work cue", () => {
    const state = start({ restSeconds: 0 });
    expect(advanceTimer(state, 40000)).toMatchObject({
      state: { phase: "work", completedSets: 1 },
      cue: "work-start",
    });
    expect(advanceTimer(state, 120000).state.status).toBe("finished");
  });
  it("continues endless mode beyond its saved finite set count", () => {
    expect(advanceTimer(start({ endless: true }), 130000).state).toMatchObject({
      status: "running",
      phase: "rest",
      completedSets: 3,
    });
  });
  it("freezes remaining time across a long pause", () => {
    const paused = pauseTimer(start(), 12500);
    expect(paused).toMatchObject({ status: "paused", remainingMs: 27500 });
    expect(advanceTimer(paused, 100000).state).toEqual(paused);
    const resumed = resumeTimer(paused, 100000);
    expect(advanceTimer(resumed, 127499).state.phase).toBe("work");
    expect(advanceTimer(resumed, 127500).state).toMatchObject({
      phase: "rest",
      completedSets: 1,
    });
  });
  it("handles delayed updates and arbitrarily large jumps in bounded time", () => {
    expect(advanceTimer(start(), 90000)).toMatchObject({
      state: { phase: "work", completedSets: 2, remainingMs: 40000 },
      cue: "work-start",
    });
    const result = advanceTimer(start({ endless: true }), 45000000000000);
    expect(result.state).toMatchObject({
      phase: "work",
      completedSets: 1000000000,
      remainingMs: 40000,
    });
  });
  it("does not award unfinished work on manual stop", () => {
    expect(stopTimer(start(), 50000)).toMatchObject({
      status: "finished",
      reason: "stopped",
      completedSets: 1,
    });
    expect(stopTimer(start(), 140000).reason).toBe("completed");
  });
  it("does not repeat boundary sounds on successive ticks", () => {
    const result = advanceTimer(start(), 40000);
    expect(result.cue).toBe("work-end");
    expect(advanceTimer(result.state, 40100).cue).toBeNull();
  });
});
