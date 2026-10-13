import type { TimerConfig } from './timer';
export type Settings = TimerConfig & { soundEnabled: boolean };
export type NumericField = 'workSeconds' | 'restSeconds' | 'sets';
export type DraftSettings = Record<NumericField, string> & { endless: boolean; soundEnabled: boolean };
export const DEFAULT_SETTINGS: Settings = {workSeconds:40, restSeconds:5, sets:3, endless:false, soundEnabled:true};
export function toDraft(settings: Settings): DraftSettings {
  return {workSeconds:String(settings.workSeconds),restSeconds:String(settings.restSeconds),sets:String(settings.sets),endless:settings.endless,soundEnabled:settings.soundEnabled};
}
export const LIMITS: Record<NumericField, readonly [number, number]> = {workSeconds:[1,3600],restSeconds:[0,600],sets:[1,999]};
const KEY = 'basketball-practice-timer.settings.v1';
export function validateDraft(draft: DraftSettings): {value:Settings|null;errors:Partial<Record<NumericField,string>>} {
  const errors: Partial<Record<NumericField,string>> = {};
  for (const field of Object.keys(LIMITS) as NumericField[]) {
    const [min,max] = LIMITS[field];
    const value = Number(draft[field]);
    if (!/^\d+$/.test(draft[field]) || !Number.isSafeInteger(value) || value < min || value > max) {
      errors[field] = `${min}〜${max.toLocaleString('ja-JP')}の整数を入力してください`;
    }
  }
  return {errors, value: Object.keys(errors).length ? null : {
    workSeconds:Number(draft.workSeconds),restSeconds:Number(draft.restSeconds),sets:Number(draft.sets),
    endless:draft.endless,soundEnabled:draft.soundEnabled,
  }};
}
export function loadSettings(storage:Pick<Storage,'getItem'>): Settings {
  try {
    const data = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (data?.version !== 1 || !data.settings || typeof data.settings.endless !== 'boolean' || typeof data.settings.soundEnabled !== 'boolean') return {...DEFAULT_SETTINGS};
    for (const field of Object.keys(LIMITS) as NumericField[]) {
      if (typeof data.settings[field] !== 'number' || !Number.isSafeInteger(data.settings[field])) return {...DEFAULT_SETTINGS};
    }
    return validateDraft(toDraft(data.settings)).value ?? {...DEFAULT_SETTINGS};
  } catch { return {...DEFAULT_SETTINGS}; }
}
export function saveSettings(storage:Pick<Storage,'setItem'>,settings:Settings):boolean {
  try { storage.setItem(KEY,JSON.stringify({version:1,settings})); return true; } catch { return false; }
}
export function totalDurationSeconds(config:TimerConfig):number|null {
  return config.endless ? null : config.workSeconds * config.sets + config.restSeconds * (config.sets - 1);
}
