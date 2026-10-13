import { expect, it } from 'vitest';
import { createAudioFeedback } from './audio';
function context(deny=false) {
  const notes:{frequency:number;started:boolean;stops:number[]}[]=[];
  const fake={currentTime:0,state:'running',destination:{},resume:async()=>{if(deny)throw new Error('blocked');},createGain:()=>({gain:{setValueAtTime:()=>{},linearRampToValueAtTime:()=>{}},connect:()=>{},disconnect:()=>{}}),createOscillator:()=>{
    const note={frequency:0,started:false,stops:[] as number[]};notes.push(note);
    return {frequency:{setValueAtTime:(f:number)=>{note.frequency=f;}},connect:()=>{},disconnect:()=>{},start:()=>{note.started=true;},stop:(t=0)=>{note.stops.push(t);},onended:null};
  }};
  return {fake:fake as unknown as AudioContext,notes};
}
it('produces distinct short audible signals for each transition',async()=>{
  const patterns:string[]=[];
  for(const cue of ['work-end','work-start','session-end'] as const){
    const {fake,notes}=context();const audio=createAudioFeedback(()=>fake);
    expect(await audio.unlock()).toBe(true);audio.play(cue);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every(n=>n.started&&n.frequency>=200&&n.stops[0]>0&&n.stops[0]<3)).toBe(true);
    patterns.push(notes.map(n=>n.frequency).join(','));
  }
  expect(new Set(patterns).size).toBe(3);
});
it('does not emit sound when disabled',async()=>{
  const {fake,notes}=context();const audio=createAudioFeedback(()=>fake);
  await audio.unlock();audio.setEnabled(false);audio.play('work-start');expect(notes).toHaveLength(0);
});
it('returns unavailable when audio activation is denied',async()=>{
  const {fake,notes}=context(true);const audio=createAudioFeedback(()=>fake);
  expect(await audio.unlock()).toBe(false);audio.play('work-end');expect(notes).toHaveLength(0);
});
it('cancels scheduled sound on stop',async()=>{
  const {fake,notes}=context();const audio=createAudioFeedback(()=>fake);
  await audio.unlock();audio.play('session-end');audio.stop();
  expect(notes.length).toBeGreaterThan(0);expect(notes.every(n=>n.stops.includes(0))).toBe(true);
});
