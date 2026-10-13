export type WakeStatus='unsupported'|'requesting'|'held'|'released'|'denied';
export type WakeHandle={released:boolean;release():Promise<void>;addEventListener(type:'release',listener:()=>void):void;removeEventListener(type:'release',listener:()=>void):void};
export type WakeSource={request(type:'screen'):Promise<WakeHandle>};
export function createWakeLock(source:WakeSource|undefined,onStatus:(status:WakeStatus)=>void) {
  let handle:WakeHandle|undefined, listener:(()=>void)|undefined;
  let generation=0, desired=false, pending=false, disposed=false;
  async function release(){
    const previous=handle;handle=undefined;
    if(previous&&listener)previous.removeEventListener('release',listener);
    listener=undefined;
    if(previous&&!previous.released){try{await previous.release();}catch{/* OS may already have released it */}}
  }
  async function setActive(active:boolean){
    if(disposed)return;
    if(active&&desired&&(handle||pending))return;
    desired=active;const token=++generation;
    if(!active){pending=false;await release();if(token===generation&&!disposed)onStatus('released');return;}
    if(!source){desired=false;onStatus('unsupported');return;}
    pending=true;onStatus('requesting');
    try{
      const acquired=await source.request('screen');
      if(token!==generation||!desired||disposed){try{await acquired.release();}catch{}return;}
      pending=false;handle=acquired;
      listener=()=>{if(handle===acquired){handle=undefined;desired=false;onStatus('released');}};
      acquired.addEventListener('release',listener);
      if(acquired.released){listener();return;}
      onStatus('held');
    }catch{if(token===generation&&!disposed){pending=false;desired=false;onStatus('denied');}}
  }
  return {setActive,dispose(){disposed=true;desired=false;generation++;void release();}};
}
