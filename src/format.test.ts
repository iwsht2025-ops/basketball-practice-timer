import { expect, it } from "vitest";
import { formatRemaining, formatDuration } from "./format";
it.each([
  [40000, "0:40"],
  [1, "0:01"],
  [0, "0:00"],
  [60001, "1:01"],
])("formats remaining %i as %s", (ms, result) => {
  expect(formatRemaining(ms as number)).toBe(result);
});
it("formats total duration in Japanese", () => {
  expect(formatDuration(130)).toBe("2分10秒");
  expect(formatDuration(40)).toBe("40秒");
});
