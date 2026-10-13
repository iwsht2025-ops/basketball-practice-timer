import type { Cue } from './timer';
export type AudioFeedback={unlock():Promise<boolean>;play(cue:Cue):void;stop():void;setEnabled(enabled:boolean):void};
export function createAudioFeedback(factory=()=>{
  const Constructor=globalThis.AudioContext ?? (globalThis as typeof globalThis & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if (!Constructor) throw new Error('Audio unavailable');
  return new Constructor();
}):AudioFeedback {
  let context:AudioContext|undefined, enabled=true, ready=false;
  const nodes=new Set<OscillatorNode>();
  function stop(){
    for(const node of nodes){try{node.stop();}catch{/* already stopped */}}
    nodes.clear();
  }
  return {
    async unlock(){
      if(!enabled)return true;
      try { context??=factory(); await context.resume(); ready=context.state==='running'; return ready; }
      catch {ready=false;return false;}
    },
    play(cue){
      if(!enabled||!ready||!context||context.state!=='running')return;
      stop();
      const tones=cue==='work-end'?[540,440]:cue==='work-start'?[880]:[660,880,1100];
      tones.forEach((frequency,index)=>{
        const node=context!.createOscillator(), gain=context!.createGain();
        const start=context!.currentTime+index*0.19, end=start+0.16;
        node.frequency.setValueAtTime(frequency,start);
        gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(0.24,start+0.012);gain.gain.linearRampToValueAtTime(0,end);
        node.connect(gain);gain.connect(context!.destination);nodes.add(node);
        node.onended=()=>{nodes.delete(node);node.disconnect();gain.disconnect();};
        node.start(start);node.stop(end);
      });
    },
    stop,
    setEnabled(value){enabled=value;if(!value)stop();},
  };
}
