import "./styles.css";
import {
  DEFAULT_SETTINGS,
  LIMITS,
  loadSettings,
  saveSettings,
  toDraft,
  validateDraft,
  type NumericField,
  type Settings,
} from "./settings";
import { createAudioFeedback } from "./audio";
import { createWakeLock, type WakeSource } from "./wake-lock";
import { createSession } from "./session";
import { mountApp, type AppAction, type AppModel } from "./view";
import { registerPwa } from "./pwa";

const root = document.querySelector<HTMLElement>("#app")!;
let storage: Storage | undefined,
  settings: Settings = { ...DEFAULT_SETTINGS };
try {
  storage = window.localStorage;
  settings = loadSettings(storage);
} catch {
  /* Storage may be unavailable in private contexts. */
}
let lastFiniteSets = settings.sets,
  session: ReturnType<typeof createSession> | undefined,
  ticker: ReturnType<typeof setInterval> | undefined;
let previewGeneration = 0;
const audio = createAudioFeedback();
audio.setEnabled(settings.soundEnabled);
const model: AppModel = {
  screen: "setup",
  draft: toDraft(settings),
  errors: {},
  session: null,
  wakeStatus: "released",
  audioAvailable: true,
  storageAvailable: Boolean(storage),
  confirmEnd: false,
};
const view = mountApp(root, dispatch);
function render() {
  view.render(model);
}
function save() {
  const valid = validateDraft(model.draft).value;
  if (valid) {
    settings = valid;
    model.storageAvailable = Boolean(storage && saveSettings(storage, valid));
  }
}
function syncTicker() {
  const running = Boolean(
    session?.getState().status === "running" &&
      document.visibilityState === "visible",
  );
  if (running && !ticker) ticker = setInterval(() => session?.tick(), 80);
  if (!running && ticker) {
    clearInterval(ticker);
    ticker = undefined;
  }
}
function begin() {
  const valid = validateDraft(model.draft);
  model.errors = valid.errors;
  if (!valid.value) {
    render();
    return;
  }
  previewGeneration++;
  session?.dispose();
  save();
  audio.setEnabled(settings.soundEnabled);
  const source = (navigator as Navigator & { wakeLock?: WakeSource }).wakeLock;
  const wake = createWakeLock(source, (status) => {
    model.wakeStatus = status;
    render();
  });
  session = createSession(settings, {
    now: () => performance.now(),
    audio,
    wake,
    onChange(state) {
      model.session = state;
      model.screen = state.status === "finished" ? "result" : "timer";
      syncTicker();
      render();
    },
    onAudioAvailability(value) {
      model.audioAvailable = value;
      render();
    },
  });
  model.confirmEnd = false;
  model.audioAvailable = true;
  model.screen = "timer";
  model.session = session.getState();
  session.start();
}
function editNumber(field: NumericField, value: string) {
  model.draft[field] = value;
  model.errors = validateDraft(model.draft).errors;
  if (field === "sets" && !model.errors.sets) lastFiniteSets = Number(value);
  save();
  render();
}
function dispatch(action: AppAction) {
  switch (action.type) {
    case "config":
      editNumber(action.field, action.value);
      break;
    case "preset":
      editNumber(action.field, String(action.value));
      break;
    case "step": {
      const [min, max] = LIMITS[action.field];
      const raw = Number(model.draft[action.field]);
      const base = model.errors[action.field] ? settings[action.field] : raw;
      editNumber(
        action.field,
        String(Math.min(max, Math.max(min, base + action.value))),
      );
      break;
    }
    case "endless":
      model.draft.endless = action.value;
      if (action.value) model.draft.sets = String(lastFiniteSets);
      model.errors = validateDraft(model.draft).errors;
      save();
      render();
      break;
    case "sound":
      model.draft.soundEnabled = action.value;
      audio.setEnabled(action.value);
      save();
      render();
      break;
    case "test-sound": {
      const token = ++previewGeneration;
      void audio.unlock().then((available) => {
        if (
          token === previewGeneration &&
          document.visibilityState === "visible"
        ) {
          model.audioAvailable = available;
          if (available) audio.play("work-start");
          render();
        }
      });
      break;
    }
    case "start":
    case "restart":
      begin();
      break;
    case "pause":
      session?.pause();
      break;
    case "resume":
      session?.resume();
      break;
    case "request-end":
      session?.pause();
      model.confirmEnd = model.session?.status !== "finished";
      render();
      break;
    case "cancel-end":
      model.confirmEnd = false;
      render();
      break;
    case "confirm-end":
      model.confirmEnd = false;
      session?.stop();
      break;
    case "settings":
      previewGeneration++;
      session?.dispose();
      session = undefined;
      syncTicker();
      model.screen = "setup";
      model.session = null;
      model.confirmEnd = false;
      render();
      break;
  }
}
function hide() {
  previewGeneration++;
  audio.stop();
  session?.hide();
  syncTicker();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") hide();
});
window.addEventListener("pagehide", hide);
render();
void registerPwa();
