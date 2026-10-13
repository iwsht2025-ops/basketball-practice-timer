# Basketball Practice Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhone SE のホーム画面から使える、音付き・オフライン対応のバスケットボール練習タイマーを作る。

**Architecture:** TypeScript と Vite の単一ページアプリ。時刻計算と状態遷移を純粋関数として分離し、画面、音、画面維持、保存、PWA を小さなモジュールでつなぐ。バックエンドは使わない。

**Tech Stack:** TypeScript、Vite、Vitest、Web Audio、Screen Wake Lock、Service Worker、Playwright。Node.js 24/npm 11 とシステム Chromium がクラウドにある。依存関係は package-lock.json に固定する。

**Spec:** [2026-10-13-basketball-practice-timer-design.md](../specs/2026-10-13-basketball-practice-timer-design.md)

## Global Constraints

- 既存のチェックアウトを使う。ユーザーから依頼がない限り Git worktree は作らない。
- 初期値は練習40秒、休憩5秒、3セット。
- 1セットは練習1回。最後のセットの後に休憩は入れない。
- 入力範囲は練習1〜3,600秒、休憩0〜600秒、セット数1〜999回。
- 黒に近い背景と明るい文字を使い、練習中はオレンジ、休憩中は落ち着いたグリーンをアクセントにする。
- 320px の狭い画面から動作するレスポンシブ設計とする。iPhone SE を想定する375px幅を重点的に確認する。
- 主要な操作のタップ領域は44px以上にする。
- 外部フォント、画像配信、音声ファイル、バックエンド、ログイン、秘密情報に依存しない。
- 通知権限は要求しない。ロック中・別アプリ使用中は一時停止し、復帰後は手動で再開する。
- 初回のオンライン利用で必要なファイルが保存された後は、オフラインで使えるようにする。
- 実行中の Service Worker 更新で強制再読み込みしない。
- ページの再読み込みでは実行中の練習は再開せず、保存した設定を使った設定画面から始める。
- クラウドのブラウザ検証と、未実施の iPhone SE 実機確認を分けて報告する。本番公開は別工程。

## Review Focus

1. 画面維持の非同期取得中に一時停止した場合、後から取得したロックを解放し、画面維持を再開しない（Task 3）。
2. 保存データが壊れている、過去形式、localStorage が例外を出す場合も、初期値または現在の設定で使える（Task 2）。
3. 空欄・小数・指数表記・範囲外を入力して Enter を押しても開始できず、入力のフォーカスを失わない（Task 4）。
4. 音の有効化が拒否される、または保留中に非表示になっても、画面のタイマーは使え、非表示後に音が鳴らない（Task 3/4）。
5. 新しい Service Worker が待機しても、実行中の画面と設定は維持される。旧キャッシュ削除は次のバージョンの正常な有効化後に行う（Task 5）。

## File Structure

- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`: 開発・検証の設定。
- `index.html`: 日本語、viewport、安全領域、テーマ色、アイコン、アプリの起点。
- `src/timer.ts`, `src/timer.test.ts`: 状態遷移と時計。
- `src/settings.ts`, `src/settings.test.ts`: 設定の検証、総時間、保存。
- `src/audio.ts`, `src/audio.test.ts`: 音の有効化と合図。
- `src/wake-lock.ts`, `src/wake-lock.test.ts`: 画面維持と取得・解放の競合。
- `src/session.ts`, `src/session.test.ts`: 時計、非表示、自動更新、音、画面維持を接続する制御。
- `src/view.ts`, `src/styles.css`, `src/main.ts`: 画面、操作、アプリの起動。
- `src/format.ts`, `src/format.test.ts`: 残り時間と総時間の表示。
- `src/pwa.ts`, `scripts/build-pwa.mjs`: 登録とビルド後のキャッシュ生成。
- `public/manifest.webmanifest`, `public/icons/`: ホーム画面用メタデータと自作アイコン。
- `scripts/generate-icons.py`: 外部サービス不要のPNGアイコン再生成用。生成済みPNGはコミットし、通常ビルドでPythonを要求しない。
- `playwright.config.ts`, `tests/app.spec.ts`, `tests/offline.spec.ts`: 本番ビルドを使うブラウザ検証。
- `README.md`: 開発、検証、HTTPSでの利用、ホーム画面追加、実機確認。

## Task 1: Tested timer engine

**Files:** Create project configuration, `src/timer.ts`, `src/timer.test.ts`.

**Interfaces:**
- `TimerConfig = { workSeconds: number; restSeconds: number; sets: number; endless: boolean }`.
- `Phase = 'work' | 'rest'`; `Cue = 'work-end' | 'work-start' | 'session-end'`.
- `TimerState = { config: TimerConfig; status: 'idle' | 'running' | 'paused' | 'finished'; phase: Phase; completedSets: number; deadlineMs: number | null; remainingMs: number; reason: 'completed' | 'stopped' | null }`.
- `createTimer(config: TimerConfig): TimerState`; `startTimer(state: TimerState, nowMs: number): TimerState`.
- `advanceTimer(state: TimerState, nowMs: number): { state: TimerState; cue: Cue | null }`.
- `pauseTimer(state: TimerState, nowMs: number): TimerState`; `resumeTimer(state: TimerState, nowMs: number): TimerState`; `stopTimer(state: TimerState, nowMs: number): TimerState`.

- [ ] **Step 1: Create the minimal TypeScript/Vitest environment.** Add TypeScript, Vite, Vitest and @types/node as development dependencies. Add scripts `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `build` (typecheck then Vite), `dev`, and `preview`; ignore node_modules, dist, browser results. Install dependencies normally, preserve TLS verification, and commit the generated lockfile. Do not scaffold over the existing README or docs.
- [ ] **Step 2: Write failing timer tests.** With `{workSeconds:40, restSeconds:5, sets:3, endless:false}` and start at `0`, assert work at `39999`, rest/completedSets=1 at `40000`, work at `45000`, rest/completedSets=2 at `85000`, work at `90000`, finished/completedSets=3/reason=completed at `130000`. At `130000` cue is session-end, with no final rest.

```ts
it('finishes three 40-second sets in 130 seconds without final rest', () => {
  const initial = createTimer({workSeconds: 40, restSeconds: 5, sets: 3, endless: false});
  const result = advanceTimer(startTimer(initial, 0), 130000);
  expect(result.state).toMatchObject({status: 'finished', completedSets: 3, reason: 'completed'});
  expect(result.cue).toBe('session-end');
});
```
- [ ] **Step 3: Run `npm test -- src/timer.test.ts`.** Confirm failure because timer exports are missing, rather than a runner configuration error.
- [ ] **Step 4: Implement the interfaces.** Use absolute deadlines based on injected monotonic time. Collapse whole elapsed work/rest cycles arithmetically when updates are late, then resolve the remaining boundary; never iterate without a bound over a very large elapsed interval. Emit only the latest applicable cue. Work-to-work with rest=0 emits work-start only; final completion emits session-end only. Pause/stop advance state silently to the supplied time before freezing it.
- [ ] **Step 5: Add and run boundary tests.** One 40-second set finishes at 40000 regardless of rest setting; three sets with rest=0 finish at 120000; endless at 130000 continues in rest with three completed sets. Pause at 12500 retains 27500ms, resume at 100000 finishes the first work at 127500. A delayed first update at 90000 reaches work set3 with 40000ms remaining and one cue. A very long endless jump terminates promptly with the mathematically correct completed count. Stop before completion uses reason=stopped and never awards an incomplete set; stop after natural completion preserves reason=completed.
- [ ] **Step 6: Run timer tests and typecheck, then commit.** `git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts .gitignore src/timer.ts src/timer.test.ts`; commit `feat: add tested interval timer engine`.

## Task 2: Validated settings and persistence

**Files:** Create `src/settings.ts`, `src/settings.test.ts`.

**Interfaces:**
- Consumes `TimerConfig`.
- `Settings = TimerConfig & { soundEnabled: boolean }`; `NumericField = 'workSeconds' | 'restSeconds' | 'sets'`.
- `DraftSettings = Record<NumericField, string> & { endless: boolean; soundEnabled: boolean }`.
- `DEFAULT_SETTINGS: Settings` uses 40/5/3/false and soundEnabled=true.
- `toDraft(settings: Settings): DraftSettings`; `validateDraft(draft: DraftSettings): { value: Settings | null; errors: Partial<Record<NumericField, string>> }`.
- `loadSettings(storage: Pick<Storage, 'getItem'>): Settings`; `saveSettings(storage: Pick<Storage, 'setItem'>, settings: Settings): boolean`.
- `totalDurationSeconds(config: TimerConfig): number | null`, returning null for endless.

- [ ] **Step 1: Write failing settings tests.** Assert default total=130, one set total=40, rest0/3sets total=120, endless total=null. Pin all range endpoints, empty strings, negative values, decimals, exponent strings, NaN-like input, and malformed booleans in saved JSON. validateDraft validates sets in both modes; Task 4 supplies the retained valid sets value when selecting endless.

```ts
it('rejects blank work time without substituting a default', () => {
  const draft = {...toDraft(DEFAULT_SETTINGS), workSeconds: ''};
  const result = validateDraft(draft);
  expect(result.value).toBeNull();
  expect(result.errors.workSeconds).toBeTruthy();
});
```
- [ ] **Step 2: Run `npm test -- src/settings.test.ts` and confirm missing-export failures.**
- [ ] **Step 3: Implement validation and storage.** Require integer decimal input for numeric fields; do not silently clamp or replace invalid user input. Use localStorage key `basketball-practice-timer.settings.v1` with payload `{ version: 1, settings: Settings }`. Validate parsed values and types before reuse; invalid/unknown records return defaults. When endless is selected, the UI preserves the last valid finite sets value rather than passing an invalid hidden field. Catch storage access errors at the application boundary as well as getItem/setItem errors.
- [ ] **Step 4: Run settings tests including corrupt JSON, wrong-version payload, getItem/setItem exceptions, and a complete round trip.** `npm test -- src/settings.test.ts` and `npm run typecheck` must pass; a failed write returns false without losing the current settings.
- [ ] **Step 5: Commit.** Add the two settings files; commit `feat: validate and persist practice settings`.

## Task 3: Audio, screen wake lock, and session control

**Files:** Create `src/audio.ts`, `src/audio.test.ts`, `src/wake-lock.ts`, `src/wake-lock.test.ts`, `src/session.ts`, `src/session.test.ts`.

**Interfaces:**
- Consumes timer exports and `Settings`.
- `AudioFeedback = { unlock(): Promise<boolean>; play(cue: Cue): void; stop(): void; setEnabled(enabled: boolean): void }`; `createAudioFeedback(factory?: () => AudioContext): AudioFeedback`.
- `WakeStatus = 'unsupported' | 'requesting' | 'held' | 'released' | 'denied'`.
- `WakeHandle = { released: boolean; release(): Promise<void>; addEventListener(type: 'release', listener: () => void): void; removeEventListener(type: 'release', listener: () => void): void }`.
- `WakeSource = { request(type: 'screen'): Promise<WakeHandle> }`.
- `createWakeLock(source: WakeSource | undefined, onStatus: (status: WakeStatus) => void): { setActive(active: boolean): Promise<void>; dispose(): void }`.
- `SessionDeps = { now(): number; audio: AudioFeedback; wake: ReturnType<typeof createWakeLock>; onChange(state: TimerState): void; onAudioAvailability(available: boolean): void }`.
- `createSession(config: TimerConfig, deps: SessionDeps): { getState(): TimerState; start(): void; tick(): void; pause(): void; resume(): void; stop(): void; hide(): void; dispose(): void }`.

- [ ] **Step 1: Write failing adapter/control tests.** Assert each Cue schedules a bounded audible oscillator sequence; disabled audio schedules none; denied unlock resolves false; stop cancels scheduled sound. Assert missing WakeSource gives unsupported; denied request gives denied; pausing while request is pending releases the eventual handle. With fake monotonic time, hide during work and during rest must retain remaining time, stop sound, release wake lock, and remain paused after further ticks.

```ts
it('reports unsupported wake lock without rejecting session startup', async () => {
  const statuses: WakeStatus[] = [];
  const wake = createWakeLock(undefined, status => statuses.push(status));
  await expect(wake.setActive(true)).resolves.toBeUndefined();
  expect(statuses.at(-1)).toBe('unsupported');
});
```
- [ ] **Step 2: Run the three targeted test files and confirm missing exports.** `npm test -- src/audio.test.ts src/wake-lock.test.ts src/session.test.ts`.
- [ ] **Step 3: Implement audio and wake adapters.** Unlock only from a direct start/resume/test-sound action; generate short, distinct tones with an envelope rather than abrupt full-volume waveforms. Bound gain, track active nodes, and cancel them on stop/hide. Wake acquisition uses a generation token so stale promises release their handles. Treat OS release as released without endlessly retrying; explicit resume can retry. Prevent an earlier rejected/slow unlock from playing after a later hide or pause.
- [ ] **Step 4: Implement session control.** Use timer pure functions, ignore cues on pause/hide/stop, and notify the view after transitions. start()/resume() invoke audio.unlock() immediately within the user action and report the result through onAudioAvailability; stale completion cannot play a cue. Start timing immediately without awaiting permission-like browser promises. Pause and stop remain synchronous. Main will schedule ticks only while displayed/running and route visibilitychange and pagehide to hide(). Returning visible does not call resume().
- [ ] **Step 5: Run tests for races and failures, then typecheck.** Include pending unlock followed by hide, wake rejection, unexpected release, resume after a long interruption, and dispose while acquisition is pending. Show adapter statuses to the future UI through callbacks; do not claim actual speaker output from mocked tests.
- [ ] **Step 6: Commit.** Add the six files; commit `feat: add sound and safe foreground session control`.

## Task 4: Polished responsive interface and usable workflow

**Files:** Create `index.html`, `src/main.ts`, `src/view.ts`, `src/styles.css`, `src/format.ts`, `src/format.test.ts`, `playwright.config.ts`, `tests/app.spec.ts`; modify package scripts to add `test:e2e`.

**Interfaces:**
- Consumes Tasks 1–3. `formatRemaining(ms: number): string` rounds positive fractional seconds up and returns m:ss; `formatDuration(seconds: number): string` formats total time in Japanese.
- `AppModel = { screen: 'setup' | 'timer' | 'result'; draft: DraftSettings; errors: Partial<Record<NumericField, string>>; session: TimerState | null; wakeStatus: WakeStatus; audioAvailable: boolean; storageAvailable: boolean; confirmEnd: boolean }`.
- `AppAction` is a discriminated union: numeric config change with field/value; endless and sound changes with boolean values; preset with field/number; step with field/delta; and start, pause, resume, request-end, cancel-end, confirm-end, restart, settings, test-sound.
- `mountApp(root: HTMLElement, onAction: (action: AppAction) => void): { render(model: AppModel): void; dispose(): void }`. Render patches controls within the same screen and preserves focus and typed invalid strings; screen transitions may rebuild screen contents.

- [ ] **Step 1: Add formatting tests and failing browser workflow tests.** Add @playwright/test as a development dependency. Pin `formatRemaining(40000)='0:40'`, `formatRemaining(1)='0:01'`, and `formatRemaining(0)='0:00'`. Browser tests expect labelled work/rest/sets controls, initial 2分10秒 total, invalid input blocking click and Enter, and focus retained while entering multi-digit values. Configure Playwright to build and run Vite preview on 127.0.0.1:4173. Use `/usr/bin/chromium` when it exists, otherwise the Playwright-installed Chromium. Do not download another browser in the cloud unnecessarily.

```ts
test('blocks starting with a blank work-time field', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('練習時間（秒）', {exact: true}).fill('');
  await expect(page.getByRole('button', {name: '練習を開始', exact: true})).toBeDisabled();
  await page.getByLabel('練習時間（秒）', {exact: true}).press('Enter');
  await expect(page.getByLabel('練習時間（秒）', {exact: true})).toBeFocused();
});
```
- [ ] **Step 2: Run the selected tests and confirm the application workflow fails before implementation.** For the initial browser probe, use a minimal index entry so the failure is an absent control rather than an absent server; do not treat this scaffold as the UI deliverable.
- [ ] **Step 3: Implement the three screens.** Setup has work-time hero, presets (work20/40/60; rest0/5/10; sets3/5/10), step buttons, numeric entry, finite/endless switch, sound toggle/test, total, and prominent start. Timer has phase label, fixed-position large numerals, progress ring, current/total or endless count, next-set hint during rest, and pause/end controls. End first pauses, then opens an accessible confirmation; cancel remains paused. Result differentiates completed from stopped and provides same-settings restart/settings return.
- [ ] **Step 4: Integrate in main.** Safely load/save settings; keep raw invalid edits only in the draft; bind session ticks to performance.now(); hide/pagehide stops ticking and pauses; visible does not resume. Route direct user actions to session.start()/resume(), which synchronously initiate audio unlock; use the audio adapter directly for test-sound. Use a sound warning and a brief screen-maintenance warning when relevant, without disabling the timer. Reload returns to setup. Track lastFiniteSets, updating it only for valid integer edits; selecting endless restores that value if the current sets draft is invalid, and switching back retains it.
- [ ] **Step 5: Implement CSS and accessibility.** Use system fonts, tabular numerals, graphite background, orange work and muted green rest. Account for safe-area insets and dynamic viewport height, 44px targets, keyboard focus, contrast, reduced-motion preference, and scrollable setup on short screens. State announcements are polite live-region changes; do not announce each second. No network font/image dependency.
- [ ] **Step 6: Run browser workflows.** Use work1/rest1/sets3: assert work→rest→work→rest→work→completed, three completed sets, and no final rest. Cover rest0, one set, endless continuing beyond saved finite sets, pause/resume, manual-stop confirmation/cancel, repeated restart, sound-off, invalid input including exponent strings and Enter, settings after reload, and wake-unavailable fallback. Verify hidden-page pause with a test-only visibilityState override plus visibilitychange, and exercise pagehide handling; actual OS lifecycle detection remains on the iPhone checklist. Observe Web Audio node creation through test-only browser instrumentation, while documenting that actual iPhone speaker output is unverified.
- [ ] **Step 7: Capture and inspect screenshots.** Inspect setup/work/rest/paused/result at 320px and 375px, plus a wide layout. Use browser measurements to catch horizontal overflow and undersized major controls. Capture screenshots under ignored browser result directories. Run unit tests, typecheck, and targeted e2e, then commit `feat: build mobile practice timer interface`.

## Task 5: Home-screen installation and offline use

**Files:** Create `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`, `public/icons/icon.svg`, `scripts/generate-icons.py`, `scripts/build-pwa.mjs`, `src/pwa.ts`, `tests/offline.spec.ts`; modify index/main/build scripts.

**Interfaces:**
- `registerPwa(): Promise<boolean>` in src/pwa.ts registers only when supported in a secure context; false never prevents the timer from working.
- Postbuild `node scripts/build-pwa.mjs` reads dist and writes a generated `dist/sw.js`. Normal build is `tsc --noEmit && vite build && node scripts/build-pwa.mjs`.
- Manifest uses name `バスケ練習タイマー`, short_name `練習タイマー`, lang `ja`, start_url/scope `./`, display `standalone`, graphite theme/background, 192/512 PNG icons. Index includes the 180px Apple touch icon.

- [ ] **Step 1: Write failing production offline tests.** After a normal online load, wait for Service Worker readiness/control and cache completion, set browser offline, reload, and assert settings screen plus a complete short practice. Assert installed metadata and icon responses have expected types/dimensions. Do not call a zero-test or first-offline load successful.

```ts
test('reloads the installed app shell without a network connection', async ({page, context}) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', {name: '練習を開始', exact: true})).toBeVisible();
});
```
- [ ] **Step 2: Run `npm run test:e2e -- tests/offline.spec.ts` and confirm offline loading fails before caching is implemented.**
- [ ] **Step 3: Add self-contained identity/assets.** Make a restrained basketball/court mark in SVG, export clean 192/512/180 PNGs with a reproducible local script, and commit generated assets. No external font or asset request. Use `base: './'` for Vite and relative manifest/registration paths so a subdirectory HTTPS deployment works.
- [ ] **Step 4: Implement generated caching.** Hash production file contents to version the cache, include index/manifest/icons/bundles, and resolve URLs within registration scope. Install fails atomically if a required file cannot be fetched. Use cache-first for versioned app assets, navigation network-first with cached index fallback. Do not call skipWaiting or force page reload; a waiting update must not disturb an open session. Activate only after complete installation, and delete only this app/scope's obsolete caches. Initial activation may claim clients without reloading them.
- [ ] **Step 5: Verify offline and update behavior.** Run offline tests against the build. For update, use an isolated temporary copy of build output outside tracked files, serve v1, start practice, replace with v2, call registration.update(), and assert v2 waits while timer continues with its settings. Close clients and open again to confirm v2 activation and safe old-cache cleanup. Also serve beneath a subdirectory and verify scoped offline navigation without reaching outside that scope.
- [ ] **Step 6: Commit.** Add PWA files and changed entry/config/scripts; commit `feat: add installable offline practice timer`.

## Task 6: Final verification and reusable development environment

**Files:** Modify `README.md` and completed plan checkboxes; draft environment fields if supported.

**Interfaces:** Consumes the finished app and all npm scripts. Saves complete tested installation/start instructions, not runtime processes.

- [ ] **Step 1: Write practical README.** Cover `npm ci`, `npm run dev`, unit/e2e/build commands, initial cache requirement, HTTPS requirement, Safari share→home screen, settings limits, foreground-only behavior, and sound/screen-maintenance differences on actual iPhone. Explain that external publication is not yet performed and give a short real-device checklist.
- [ ] **Step 2: Verify reproducible installation and readiness.** Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e` once against the final changes. Confirm nonzero test counts, no skipped required cases, the preview HTTP response, actual browser interactions, and current-run screenshots. Repeat only affected checks if changes follow a failure.
- [ ] **Step 3: Run whole-change review.** Use superpowers:requesting-code-review after functional checks. Focus on timing boundaries, asynchronous audio/wake races, PWA updates and offline behavior, actual versus claimed iPhone evidence, and 320/375px readability. Fix substantiated issues with regression checks before completion.
- [ ] **Step 4: Save and exercise environment instructions.** Use cloud-environment-onboarding configuration tools after inspecting the current draft. Save install_script with `set -eu`, `cd /workspace/basketball-practice-timer`, `npm ci`, and `npm run build`; save start_skill with that checkout, no worktree instruction, foreground dev-server command, local readiness request, npm checks, and service restart guidance. Preserve unrelated network/secret/repository settings. Test commands in the real working directory and report saved versus published state distinctly.
- [ ] **Step 5: Commit documentation and report evidence.** Report features, tests and build, saved fields, iPhone real-device checks still needed, and publication status. Link relevant files; do not present localhost as a user-facing iPhone preview or claim public deployment. Use superpowers:verification-before-completion before asserting completion.

## Plan Self-Review

- Coverage: settings, finite/endless timer, input bounds, three screens, sound, screen maintenance, hidden-page pause, persistence, PWA installation/offline/update, accessibility, cloud checks, and remaining real-device checks all have tasks.
- Interface consistency: timer types flow into settings, session, and view; adapters expose exactly the methods used by SessionDeps; main owns user actions, visibility, and display status callbacks.
- Review Focus: the five failure classes are pinned in Tasks 2–5 rather than left as general warnings.
- Scope: one foreground practice workflow; no native packaging, accounts, notifications, hosting credentials, or unrelated services.
- Verification: unit tests prove timer math, browser tests prove actual UI/cache behavior, and neither substitutes for hearing the sound on iPhone SE.
