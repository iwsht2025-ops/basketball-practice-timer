import { test, expect, type Page } from "@playwright/test";
async function configure(page: Page, work = "1", rest = "1", sets = "3") {
  await page.goto("/");
  await page.getByLabel("練習時間（秒）", { exact: true }).fill(work);
  await page.getByLabel("休憩時間（秒）", { exact: true }).fill(rest);
  await page.getByLabel("セット数", { exact: true }).fill(sets);
}
const start = (page: Page) =>
  page.getByRole("button", { name: "練習を開始", exact: true }).click();
test("shows the default settings and 130-second total", async ({ page }) => {
  await page.goto("/");
  expect(await page.title()).toContain("COURT CLOCK");
  await expect(page.getByLabel("練習時間（秒）", { exact: true })).toHaveValue(
    "40",
  );
  await expect(page.getByText("2分10秒", { exact: true })).toBeVisible();
});
test("blocks invalid input and keeps keyboard focus", async ({ page }) => {
  await page.goto("/");
  const field = page.getByLabel("練習時間（秒）", { exact: true });
  for (const value of ["", "1.5", "1e2", "3601"]) {
    await field.fill(value);
    await field.press("Enter");
    await expect(
      page.getByRole("button", { name: "練習を開始", exact: true }),
    ).toBeDisabled();
    await expect(field).toBeFocused();
  }
  await field.fill("120");
  await expect(field).toHaveValue("120");
  await expect(field).toBeFocused();
  await expect(
    page.getByRole("button", { name: "練習を開始", exact: true }),
  ).toBeEnabled();
});
test("completes three sets with rest only between work periods", async ({
  page,
}) => {
  await configure(page);
  await start(page);
  await expect(page.getByText("練習中", { exact: true })).toBeVisible();
  await expect(page.getByText("切り替え・休憩", { exact: true })).toBeVisible();
  await expect(page.getByText("次は 2セット目", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ナイスワーク。" }),
  ).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("completed-count")).toHaveText("3");
  await page
    .getByRole("button", { name: "同じ設定でもう一度", exact: true })
    .click();
  await expect(page.getByText("練習中", { exact: true })).toBeVisible();
});
test("supports one set and zero rest", async ({ page }) => {
  await configure(page, "1", "0", "1");
  await start(page);
  await expect(
    page.getByRole("heading", { name: "ナイスワーク。" }),
  ).toBeVisible();
  await expect(page.getByTestId("completed-count")).toHaveText("1");
});
test("endless mode goes beyond saved finite sets and restores them", async ({
  page,
}) => {
  await configure(page, "1", "0", "1");
  await page.getByRole("button", { name: "エンドレス", exact: true }).click();
  await expect(page.getByLabel("セット数", { exact: true })).toBeDisabled();
  await start(page);
  await expect(page.getByTestId("set-count")).toHaveText("3セット目");
  await page.getByRole("button", { name: "練習を終了", exact: true }).click();
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "おつかれさま。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "設定に戻る", exact: true }).click();
  await page.getByRole("button", { name: "回数を指定", exact: true }).click();
  await expect(page.getByLabel("セット数", { exact: true })).toHaveValue("1");
});
test("pauses, resumes and cancels ending without automatic restart", async ({
  page,
}) => {
  await configure(page, "20", "5", "3");
  await start(page);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const remaining = await page.getByTestId("remaining-time").textContent();
  await page.waitForTimeout(1100);
  await expect(page.getByTestId("remaining-time")).toHaveText(remaining!);
  await page.getByRole("button", { name: "再開", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "一時停止", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "練習を終了", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "続ける", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "再開", exact: true }),
  ).toBeVisible();
});
test("pauses when hidden and returns with an explicit resume action", async ({
  page,
}) => {
  await configure(page, "20", "5", "3");
  await start(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "再開", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "再開", exact: true }),
  ).toBeVisible();
});
test("persists settings but never resumes a session after reload", async ({
  page,
}) => {
  await configure(page, "30", "10", "5");
  await start(page);
  await page.reload();
  await expect(page.getByLabel("練習時間（秒）", { exact: true })).toHaveValue(
    "30",
  );
  await expect(page.getByLabel("休憩時間（秒）", { exact: true })).toHaveValue(
    "10",
  );
  await expect(page.getByLabel("セット数", { exact: true })).toHaveValue("5");
});
test("pagehide pauses and endless selection repairs only the hidden sets draft", async ({
  page,
}) => {
  await configure(page, "20", "5", "7");
  await page.getByLabel("セット数", { exact: true }).fill("");
  await page.getByRole("button", { name: "エンドレス", exact: true }).click();
  await expect(page.getByLabel("セット数", { exact: true })).toHaveValue("7");
  await start(page);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  await expect(
    page.getByRole("button", { name: "再開", exact: true }),
  ).toBeVisible();
});
test("works when storage and wake lock are unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new Error("blocked");
      },
    });
    Object.defineProperty(navigator, "wakeLock", { value: undefined });
  });
  await configure(page, "1", "0", "1");
  await start(page);
  await expect(
    page.getByRole("heading", { name: "ナイスワーク。" }),
  ).toBeVisible();
});
test("creates audible nodes only when sound is enabled", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { toneCount: number }).toneCount = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      (window as unknown as { toneCount: number }).toneCount++;
      return original.call(this);
    };
  });
  await configure(page, "1", "0", "1");
  await page.getByRole("switch", { name: "合図の音", exact: true }).click();
  await start(page);
  await expect(
    page.getByRole("heading", { name: "ナイスワーク。" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { toneCount: number }).toneCount,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "設定に戻る", exact: true }).click();
  await page.getByRole("switch", { name: "合図の音", exact: true }).click();
  await start(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { toneCount: number }).toneCount,
      ),
    )
    .toBeGreaterThan(0);
});
for (const width of [320, 375, 900]) {
  test(`fits ${width}px with large accessible controls`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 900 ? 850 : 667 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const box of await page.locator("button:visible").all()) {
      const rect = await box.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: testInfo.outputPath("setup.png"),
      fullPage: true,
    });
    await start(page);
    await page.screenshot({
      path: testInfo.outputPath("work.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "一時停止", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("paused.png"),
      fullPage: true,
    });
  });
  test(`shows rest and completion cleanly at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 900 ? 850 : 667 });
    await configure(page, "1", "2", "2");
    await start(page);
    await expect(
      page.getByText("切り替え・休憩", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("rest.png"),
      fullPage: true,
    });
    await expect(
      page.getByRole("heading", { name: "ナイスワーク。" }),
    ).toBeVisible({ timeout: 8000 });
    await page.screenshot({
      path: testInfo.outputPath("result.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
