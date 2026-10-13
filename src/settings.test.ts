import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, toDraft, validateDraft, loadSettings, saveSettings, totalDurationSeconds } from './settings';

describe('settings', () => {
  it('uses 40 seconds, 5 seconds and 3 sets by default', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({workSeconds:40, restSeconds:5, sets:3, endless:false});
    expect(totalDurationSeconds(DEFAULT_SETTINGS)).toBe(130);
    expect(totalDurationSeconds({...DEFAULT_SETTINGS, sets:1})).toBe(40);
    expect(totalDurationSeconds({...DEFAULT_SETTINGS, restSeconds:0})).toBe(120);
    expect(totalDurationSeconds({...DEFAULT_SETTINGS, endless:true})).toBeNull();
  });
  it.each(['', '-1', '0', '3601', '1.5', '1e2', 'NaN', 'Infinity', ' 40 ', '+40'])('rejects invalid work input %j', value => {
    const result = validateDraft({...toDraft(DEFAULT_SETTINGS), workSeconds:value});
    expect(result.value).toBeNull();
    expect(result.errors.workSeconds).toBeTruthy();
  });
  it.each([['workSeconds','1'],['workSeconds','3600'],['restSeconds','0'],['restSeconds','600'],['sets','1'],['sets','999']])('accepts %s boundary %s', (field, value) => {
    expect(validateDraft({...toDraft(DEFAULT_SETTINGS), [field]:value}).value).not.toBeNull();
  });
  it.each([['restSeconds','-1'],['restSeconds','601'],['sets','0'],['sets','1000'],['sets','2.1']])('rejects %s=%s', (field,value) => {
    expect(validateDraft({...toDraft(DEFAULT_SETTINGS), [field]:value}).value).toBeNull();
  });
  it('retains finite sets even in endless settings', () => {
    expect(validateDraft({...toDraft(DEFAULT_SETTINGS), sets:'7', endless:true}).value).toMatchObject({sets:7,endless:true});
  });
  it('round trips saved settings', () => {
    let payload = '';
    const settings = {...DEFAULT_SETTINGS, workSeconds:60, soundEnabled:false};
    expect(saveSettings({setItem: (_key,value) => {payload=value;}}, settings)).toBe(true);
    expect(loadSettings({getItem: () => payload})).toEqual(settings);
  });
  it.each(['{bad', '{}', 'null', JSON.stringify({version:2,settings:DEFAULT_SETTINGS}), JSON.stringify({version:1,settings:{...DEFAULT_SETTINGS,soundEnabled:'yes'}}), JSON.stringify({version:1,settings:{...DEFAULT_SETTINGS,workSeconds:0}})])('falls back for invalid saved data %s', payload => {
    expect(loadSettings({getItem:()=>payload})).toEqual(DEFAULT_SETTINGS);
  });
  it('handles storage errors without breaking the timer settings', () => {
    expect(loadSettings({getItem:()=>{throw new Error('blocked');}})).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings({setItem:()=>{throw new Error('quota');}},DEFAULT_SETTINGS)).toBe(false);
  });
});
