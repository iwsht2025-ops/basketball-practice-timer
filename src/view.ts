import type { DraftSettings, NumericField } from './settings';
import { totalDurationSeconds, validateDraft } from './settings';
import type { TimerState } from './timer';
import type { WakeStatus } from './wake-lock';
import { formatDuration, formatRemaining } from './format';

export type AppModel={screen:'setup'|'timer'|'result';draft:DraftSettings;errors:Partial<Record<NumericField,string>>;session:TimerState|null;wakeStatus:WakeStatus;audioAvailable:boolean;storageAvailable:boolean;confirmEnd:boolean};
type Command='start'|'pause'|'resume'|'request-end'|'cancel-end'|'confirm-end'|'restart'|'settings'|'test-sound';
export type AppAction={type:'config';field:NumericField;value:string}|{type:'endless'|'sound';value:boolean}|{type:'preset'|'step';field:NumericField;value:number}|{type:Command};
const icon=(name:'play'|'pause'|'arrow'|'volume'|'check')=>{
  const paths={play:'<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',volume:'<path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',check:'<path d="m5 12 4 4L19 6"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
const ball='<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="currentColor"/><g stroke="#141619" stroke-width="1.8"><path d="M3 20h34M20 3v34M8 8c15 1 23 9 24 24M32 8C17 9 9 17 8 32"/></g></svg>';
const header=()=>`<header class="brand"><a class="brand-word" href="./" aria-label="COURT CLOCK ホーム"><span class="brand-mark">${ball}</span><span>COURT<span class="word-clock">CLOCK</span></span></a><span class="brand-tag">PRACTICE<br>TIMER</span></header>`;
const stepButtons=(field:NumericField,label:string)=>`<div class="step-buttons"><button type="button" data-action="step" data-field="${field}" data-value="-1" aria-label="${label}を減らす">−</button><button type="button" data-action="step" data-field="${field}" data-value="1" aria-label="${label}を増やす">＋</button></div>`;
const fieldInput=(field:NumericField,label:string)=>`<input id="${field}" data-field="${field}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="${label}" aria-describedby="${field}-error"/><span id="${field}-error" class="field-error"></span>`;
function setupTemplate(){return `${header()}
  <main class="setup"><div class="intro"><p class="eyebrow">YOUR PRACTICE. YOUR PACE.</p><h1>練習に、リズムを。</h1><p class="intro-note">時間を決めて、目の前のプレーに集中。</p></div>
  <form id="settings-form" novalidate>
    <section class="work-card" aria-labelledby="work-title"><div class="card-label"><span id="work-title">練習時間</span><span class="eyebrow">WORK</span></div>
      <div class="work-input"><button type="button" data-action="step" data-field="workSeconds" data-value="-5" aria-label="練習時間を減らす">−</button><div class="hero-value">${fieldInput('workSeconds','練習時間（秒）')}<span class="unit">秒</span></div><button type="button" data-action="step" data-field="workSeconds" data-value="5" aria-label="練習時間を増やす">＋</button></div>
      <div class="presets">${[20,40,60].map(v=>`<button type="button" data-action="preset" data-field="workSeconds" data-value="${v}">${v}秒</button>`).join('')}</div>
    </section>
    <div class="secondary-grid"><section class="small-card"><div class="card-label"><span>休憩時間</span><span class="eyebrow">REST</span></div><div class="small-value">${fieldInput('restSeconds','休憩時間（秒）')}<span class="unit">秒</span></div>${stepButtons('restSeconds','休憩時間')}<select data-preset="restSeconds" aria-label="休憩時間のプリセット"><option value="">すばやく設定</option><option value="0">休憩なし</option><option value="5">5秒</option><option value="10">10秒</option></select></section>
    <section class="small-card" id="sets-card"><div class="card-label"><span>セット数</span><span class="eyebrow">SETS</span></div><div class="small-value">${fieldInput('sets','セット数')}<span class="unit">回</span></div>${stepButtons('sets','セット数')}<select data-preset="sets" aria-label="セット数のプリセット"><option value="">すばやく設定</option><option value="3">3セット</option><option value="5">5セット</option><option value="10">10セット</option></select></section></div>
    <div class="mode-switch" aria-label="繰り返しの設定"><button type="button" data-action="endless" data-value="false" aria-pressed="true">回数を指定</button><button type="button" data-action="endless" data-value="true" aria-pressed="false"><span aria-hidden="true">∞</span> エンドレス</button></div>
    <div class="sound-row"><button class="sound-toggle" type="button" role="switch" aria-label="合図の音" aria-checked="true" data-action="sound">${icon('volume')}<span>合図の音</span><span class="toggle-track" aria-hidden="true"><span></span></span></button><button type="button" class="sound-test" data-action="test-sound">音を試す</button></div>
    <p class="helper-note" id="storage-note" hidden></p>
    <div class="start-area"><div class="total-row"><span>練習の合計</span><strong id="total-duration"></strong></div><button type="submit" class="primary" id="start-button" aria-label="練習を開始">${icon('play')}<span>練習を開始</span>${icon('arrow')}</button><p class="footer-note">最後のセットの後に休憩は入りません</p></div>
  </form></main><footer class="app-footer"><span class="tiny-ball">${ball}</span> ONE SET AT A TIME.</footer><p class="sr-only" id="announcement" role="status" aria-live="polite"></p>`;}
const ticks=Array.from({length:60},(_,i)=>{const a=i*Math.PI/30;return `<line x1="${160+151*Math.sin(a)}" y1="${160-151*Math.cos(a)}" x2="${160+(i%5===0?143:147)*Math.sin(a)}" y2="${160-(i%5===0?143:147)*Math.cos(a)}"/>`;}).join('');
function timerTemplate(){return `${header()}<main class="timer-screen"><div class="session-top"><span class="eyebrow">IN THE ZONE</span><span class="set-pill" data-testid="set-count" id="set-count"></span></div><h1 id="phase-heading">集中する時間。</h1><div class="dial"><svg class="dial-svg" viewBox="0 0 320 320" aria-hidden="true"><g class="dial-ticks" stroke-width="1">${ticks}</g><circle class="dial-track" cx="160" cy="160" r="132"/><circle id="progress-ring" class="dial-progress" cx="160" cy="160" r="132" pathLength="100" stroke-dasharray="100" transform="rotate(-90 160 160)"/></svg><div class="dial-content"><p id="phase-label" class="phase-label">練習中</p><div class="time" data-testid="remaining-time" id="remaining-time"></div><span class="dial-caption">REMAINING</span></div></div><p id="next-set" class="next-set"></p><div class="timer-actions"><button type="button" id="pause-button" class="primary" data-action="pause" aria-label="一時停止">${icon('pause')}<span>一時停止</span></button><button type="button" class="quiet-button" data-action="request-end" aria-label="練習を終了">練習を終了</button></div><p id="wake-note" class="wake-note"></p><p id="audio-note" class="helper-note" hidden>音を有効にできませんでした。残り時間を確認しながら使えます。</p></main><p class="sr-only" id="announcement" role="status" aria-live="polite"></p><dialog id="end-dialog" aria-labelledby="dialog-heading"><div class="dialog-body"><span class="eyebrow">END SESSION</span><h2 id="dialog-heading">練習を終了しますか？</h2><p>タイマーは一時停止しています。</p><button type="button" class="primary" data-action="confirm-end">終了する</button><button type="button" class="quiet-button" data-action="cancel-end">続ける</button></div></dialog>`;}
function resultTemplate(){return `${header()}<main class="result-screen"><div class="completion-mark">${icon('check')}</div><p class="eyebrow" id="result-eyebrow">SESSION COMPLETE</p><h1 id="result-heading">ナイスワーク。</h1><p id="result-note" class="result-note">今日の積み重ねが、次のプレーにつながる。</p><div class="result-stat"><strong data-testid="completed-count" id="completed-count"></strong><span>完了したセット</span></div><div class="result-details"><div><span>練習</span><strong id="result-work"></strong></div><div><span>休憩</span><strong id="result-rest"></strong></div></div><button type="button" class="primary" data-action="restart" aria-label="同じ設定でもう一度">${icon('play')}<span>同じ設定でもう一度</span></button><button type="button" class="quiet-button" data-action="settings">設定に戻る</button></main><footer class="app-footer">SHOW UP. PUT IN THE WORK.</footer><p class="sr-only" id="announcement" role="status" aria-live="polite"></p>`;}

export function mountApp(root:HTMLElement,onAction:(action:AppAction)=>void){
  let screen:AppModel['screen']|undefined, current:AppModel, announcement='';
  const find=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>(`#${id}`)!;
  const text=(id:string,value:string)=>{const node=find(id);if(node.textContent!==value)node.textContent=value;};
  function onClick(event:Event){
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if(!button||button.disabled)return;
    const type=button.dataset.action!;
    if(type==='step'||type==='preset')onAction({type,field:button.dataset.field as NumericField,value:Number(button.dataset.value)});
    else if(type==='endless')onAction({type,value:button.dataset.value==='true'});
    else if(type==='sound')onAction({type,value:!current.draft.soundEnabled});
    else onAction({type:type as Command});
  }
  function onInput(event:Event){const field=event.target as HTMLInputElement;if(field.matches('input[data-field]'))onAction({type:'config',field:field.dataset.field as NumericField,value:field.value});}
  function onChange(event:Event){const select=event.target as HTMLSelectElement;if(select.matches('select[data-preset]')&&select.value){onAction({type:'preset',field:select.dataset.preset as NumericField,value:Number(select.value)});select.value='';}}
  function onSubmit(event:Event){event.preventDefault();onAction({type:'start'});}
  function onCancel(event:Event){event.preventDefault();onAction({type:'cancel-end'});}
  root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('change',onChange);root.addEventListener('submit',onSubmit);root.addEventListener('cancel',onCancel,true);
  return {
    render(model:AppModel){
      current=model;
      if(screen!==model.screen){screen=model.screen;root.innerHTML=screen==='setup'?setupTemplate():screen==='timer'?timerTemplate():resultTemplate();window.scrollTo(0,0);announcement='';}
      root.dataset.phase=model.session?.phase??'work';root.dataset.paused=String(model.session?.status==='paused');
      if(screen==='setup'){
        for(const field of ['workSeconds','restSeconds','sets'] as const){
          const input=find<HTMLInputElement>(field);if(input.value!==model.draft[field])input.value=model.draft[field];
          input.setAttribute('aria-invalid',String(Boolean(model.errors[field])));text(`${field}-error`,model.errors[field]??'');
        }
        root.querySelectorAll<HTMLButtonElement>('[data-action="preset"][data-field="workSeconds"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===model.draft.workSeconds)));
        root.querySelectorAll<HTMLButtonElement>('[data-action="endless"]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.value==='true')===model.draft.endless)));
        find('sets-card').classList.toggle('is-disabled',model.draft.endless);
        find('sets-card').querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select').forEach(control=>control.disabled=model.draft.endless);
        root.querySelector('[role="switch"]')!.setAttribute('aria-checked',String(model.draft.soundEnabled));
        const valid=validateDraft(model.draft).value,total=valid?totalDurationSeconds(valid):null;
        text('total-duration',valid?(total===null?'終了するまで':formatDuration(total)):'—');find<HTMLButtonElement>('start-button').disabled=!valid;
        find('storage-note').hidden=model.storageAvailable;text('storage-note','設定を保存できないため、次回は初期設定から始まります。');
      }else if(screen==='timer'&&model.session){
        const state=model.session,paused=state.status==='paused';
        text('set-count',state.config.endless?`${state.completedSets+ (state.phase==='work'?1:0)}セット目`:`${String(state.completedSets+(state.phase==='work'?1:0)).padStart(2,'0')} / ${String(state.config.sets).padStart(2,'0')}`);
        text('phase-label',paused?'一時停止':state.phase==='work'?'練習中':'切り替え・休憩');
        text('phase-heading',paused?'自分のペースで。':state.phase==='work'?'集中する時間。':'呼吸を整えて。');
        text('remaining-time',formatRemaining(state.remainingMs));
        text('next-set',state.phase==='rest'?`次は ${state.completedSets+1}セット目`:paused?'準備ができたら、再開。':'ひとつのプレーに、集中。');
        const duration=(state.phase==='work'?state.config.workSeconds:state.config.restSeconds)*1000;
        find<SVGElement&HTMLElement>('progress-ring').style.strokeDashoffset=String(100*(1-Math.min(1,state.remainingMs/duration)));
        const button=find<HTMLButtonElement>('pause-button'), action=paused?'resume':'pause',label=paused?'再開':'一時停止';
        if(button.dataset.action!==action){button.dataset.action=action;button.setAttribute('aria-label',label);button.innerHTML=`${icon(paused?'play':'pause')}<span>${label}</span>`;}
        text('wake-note',paused?'画面を離れると、一時停止します。':model.wakeStatus==='held'?'● 画面をオンに保っています':model.wakeStatus==='requesting'?'画面の維持を準備しています': '画面が消える場合は、自動ロック設定を確認してください。');
        find('audio-note').hidden=model.audioAvailable;
        const dialog=find<HTMLDialogElement>('end-dialog');
        if(model.confirmEnd&&!dialog.open)dialog.showModal();else if(!model.confirmEnd&&dialog.open)dialog.close();
      }else if(screen==='result'&&model.session){
        const completed=model.session.reason==='completed';
        text('result-heading',completed?'ナイスワーク。':'おつかれさま。');text('result-eyebrow',completed?'SESSION COMPLETE':'SESSION ENDED');
        text('result-note',completed?'今日の積み重ねが、次のプレーにつながる。':'ここまでの練習も、大切な積み重ね。');
        text('completed-count',String(model.session.completedSets));text('result-work',`${model.session.config.workSeconds}秒`);text('result-rest',`${model.session.config.restSeconds}秒`);
      }
      const nextAnnouncement=screen==='timer'?`${model.session?.status==='paused'?'一時停止':model.session?.phase==='rest'?'休憩':'練習'}、${model.session?.completedSets??0}セット完了`:screen==='result'?'練習を終了しました':'';
      if(nextAnnouncement!==announcement){text('announcement',nextAnnouncement);announcement=nextAnnouncement;}
    },
    dispose(){root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);root.removeEventListener('submit',onSubmit);root.removeEventListener('cancel',onCancel,true);},
  };
}
