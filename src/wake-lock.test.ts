import { expect, it, vi } from 'vitest';
import { createWakeLock, type WakeHandle, type WakeStatus } from './wake-lock';
function handle() {
  const listeners = new Set<() => void>();
  const h: WakeHandle = {released:false,release:vi.fn(async()=>{h.released=true;listeners.forEach(f=>f());}),addEventListener:(_t,f)=>{listeners.add(f);},removeEventListener:(_t,f)=>{listeners.delete(f);}};
  return {h, releaseFromOs:()=>{h.released=true;listeners.forEach(f=>f());}};
}
it('reports unsupported API without rejecting', async()=>{
  const statuses: WakeStatus[]=[];
  const wake=createWakeLock(undefined,s=>statuses.push(s));
  await wake.setActive(true);
  expect(statuses.at(-1)).toBe('unsupported');
});
it('reports denied access without rejecting', async()=>{
  const statuses: WakeStatus[]=[];
  const wake=createWakeLock({request:async()=>{throw new Error('denied');}},s=>statuses.push(s));
  await wake.setActive(true);
  expect(statuses.at(-1)).toBe('denied');
});
it('releases a handle acquired after the session was paused', async()=>{
  const {h}=handle(); let resolve!:(h:WakeHandle)=>void;
  const acquisition=new Promise<WakeHandle>(r=>{resolve=r;});
  const statuses:WakeStatus[]=[];
  const wake=createWakeLock({request:()=>acquisition},s=>statuses.push(s));
  const pending=wake.setActive(true);
  await wake.setActive(false);
  resolve(h); await pending;
  expect(h.released).toBe(true);
  expect(statuses.at(-1)).toBe('released');
});
it('handles OS release and permits explicit retry without spinning', async()=>{
  const first=handle(), second=handle(); let requests=0;
  const statuses:WakeStatus[]=[];
  const wake=createWakeLock({request:async()=>++requests===1?first.h:second.h},s=>statuses.push(s));
  await wake.setActive(true); first.releaseFromOs();
  expect(statuses.at(-1)).toBe('released'); expect(requests).toBe(1);
  await wake.setActive(true); expect(statuses.at(-1)).toBe('held');
  wake.dispose(); await Promise.resolve(); expect(second.h.released).toBe(true);
});
it('releases pending acquisition after disposal',async()=>{
  const {h}=handle();let resolve!:(h:WakeHandle)=>void;
  const acquisition=new Promise<WakeHandle>(r=>{resolve=r;});
  const wake=createWakeLock({request:()=>acquisition},()=>{});
  const pending=wake.setActive(true);wake.dispose();resolve(h);await pending;
  expect(h.released).toBe(true);
});
