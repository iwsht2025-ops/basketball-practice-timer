import { expect,it,vi } from 'vitest';
import { createSession } from './session';
const config={workSeconds:40,restSeconds:5,sets:3,endless:false};
function setup(unlock:()=>Promise<boolean>=async()=>true){
  let now=0;const audio={unlock,play:vi.fn(),stop:vi.fn(),setEnabled:vi.fn()};const wake={setActive:vi.fn(async()=>{}),dispose:vi.fn()};
  const available=vi.fn();const session=createSession(config,{now:()=>now,audio,wake,onChange:()=>{},onAudioAvailability:available});
  return {session,audio,wake,available,time:(value:number)=>{now=value;}};
}
it.each([12500,42500])('retains phase and remaining time when hidden at %i',async(now)=>{
  const {session,audio,wake,time}=setup();session.start();await Promise.resolve();time(now);session.hide();
  const paused=session.getState();expect(paused.status).toBe('paused');
  expect(paused.remainingMs).toBe(now===12500?27500:2500);
  const sounds=audio.play.mock.calls.length;time(100000);session.tick();
  expect(session.getState()).toEqual(paused);expect(audio.play.mock.calls).toHaveLength(sounds);
  expect(wake.setActive).toHaveBeenLastCalledWith(false);
  session.resume();expect(session.getState().status).toBe('running');
});
it('does not play a late activation sound after hiding',async()=>{
  let resolve!:(value:boolean)=>void;
  const activation=new Promise<boolean>(r=>{resolve=r;});
  const {session,audio}=setup(()=>activation);
  session.start();session.hide();resolve(true);await Promise.resolve();
  expect(audio.play).not.toHaveBeenCalled();expect(session.getState().status).toBe('paused');
});
it('keeps timing when audio unlock is denied',async()=>{
  const {session,available,time}=setup(async()=>false);session.start();await Promise.resolve();time(40000);session.tick();
  expect(available).toHaveBeenCalledWith(false);expect(session.getState().phase).toBe('rest');
});
it('emits one completion cue and frees screen wake lock',async()=>{
  const {session,audio,wake,time}=setup();session.start();await Promise.resolve();time(130000);session.tick();session.tick();
  expect(audio.play.mock.calls.filter(([cue])=>cue==='session-end')).toHaveLength(1);
  expect(session.getState().completedSets).toBe(3);expect(wake.setActive).toHaveBeenLastCalledWith(false);
});
it('disposal invalidates pending activation and releases resources',async()=>{
  let resolve!:(value:boolean)=>void;const activation=new Promise<boolean>(r=>{resolve=r;});
  const {session,audio,wake}=setup(()=>activation);
  session.start();session.dispose();resolve(true);await Promise.resolve();
  expect(audio.play).not.toHaveBeenCalled();expect(wake.dispose).toHaveBeenCalled();
});
