import { Simulation, BUILD_VERSION, objectX, clamp, validateReplay, replayRun } from './simulation.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
const $=id=>document.getElementById(id);
const defaults={large:false,contrast:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,snow:true,autoJump:false,muted:false};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const saved=read('white-route.settings.v1',{}),settings={...defaults};
for(const key of Object.keys(defaults))if(typeof saved?.[key]==='boolean')settings[key]=saved[key];
const audio=new Audio();
let config,renderer,sim,input,ready=false,eventCursor=0,accumulator=0,lastFrame=0,noticeUntil=0,noticePriority=0;
let replay=null,replayIndex=0,replayInput={},lastHUD=0,contextLost=false,animationTime=0;
function fatal(error){$('fatal-message').textContent=error instanceof Error?error.message:String(error);$('fatal').hidden=false;$('start').disabled=true;}
function notify(text,priority=0,seconds=2.5){
  const now=performance.now();if(now<noticeUntil&&priority<noticePriority)return;
  $('notice').textContent=text;$('notice').classList.toggle('collision',priority>=3);$('notice').hidden=false;
  noticeUntil=now+seconds*1000;noticePriority=priority;
}
function applySettings(){
  document.body.classList.toggle('large-hud',settings.large);document.body.classList.toggle('high-contrast',settings.contrast);
  audio.muted=settings.muted;$('sound').textContent=settings.muted?'♪̸':'♪';$('sound').setAttribute('aria-label',settings.muted?'효과음 켜기':'효과음 끄기');
  for(const key of ['large','contrast','reduced','snow'])$(key).checked=settings[key];$('auto-jump').checked=settings.autoJump;
}
function showScreen(phase){
  const home=phase==='ready',active=phase==='running'||phase==='paused',ended=phase==='won'||phase==='lost';
  $('welcome').hidden=!home;$('briefing').hidden=!home;
  for(const id of ['hud','speed-panel','score-panel'])$(id).hidden=!active;
  $('result').hidden=!ended;$('touch-controls').hidden=!active||Boolean(replay);
  $('controls').hidden=ended;document.body.classList.toggle('playing',active);
  $('pause').setAttribute('aria-label',active?'일시정지':'설정 열기');
  if(!active)for(const id of ['fork','phase-indicator','hazard-cue'])$(id).hidden=true;
  $('replay-label').hidden=!replay||!active;
}
function options(){return {seed:Number($('seed').value),training:$('mode').value==='training',autoJump:settings.autoJump};}
function reset({start=false,keep=false}={}){
  input?.clear();replay=null;replayIndex=0;replayInput={};
  const opt=keep&&sim?{seed:sim.seed,...sim.options}:options();
  try{sim=new Simulation(config,opt);}catch(error){notify(error.message,3);return false;}
  accumulator=0;eventCursor=0;noticeUntil=0;$('notice').hidden=true;
  if(start){document.activeElement?.blur();audio.unlock();sim.start();showScreen('running');notify('A/D 좌우 이동 · W/S 가감속 · Space 점프',1,5);}
  else{showScreen('ready');updateBest();}
  updateHUD();return true;
}
function start(){if(ready&&sim?.state.phase==='ready'&&!$('settings').open){reset({start:true});document.activeElement?.blur();}}
function updateBest(){
  if(!sim)return;
  const best=read(recordKey(sim),null);
  $('best').textContent=best&&Number.isFinite(best.score)?`이 시드 최고 기록 ${best.score.toLocaleString()}점 · ${best.elapsed.toFixed(1)}초`:'첫 항로의 기록을 남겨 보세요.';
}
function recordKey(run){return `white-route.best.${run.hash}.${run.seed}.${run.options.training?'training':'standard'}.${run.options.autoJump?'assist':'manual'}`;}
function updateHUD(){
  if(!sim)return;
  const s=sim.state,r=config.rules,c=config.course;
  $('distance').replaceChildren(document.createTextNode(`${Math.ceil(Math.max(0,s.length-s.distance)).toLocaleString()} `),Object.assign(document.createElement('small'),{textContent:'m'}));
  const t=Math.ceil(s.timeLeft);$('time').textContent=sim.options.training&&t===0?'연습':`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  $('time-box').classList.toggle('low',s.timeLeft<=20&&!sim.options.training);
  $('progress').style.width=`${clamp(s.distance/s.length*100,0,100)}%`;
  $('speed').textContent=Math.round(s.speed*3.6);$('speed-bar').style.width=`${s.speed/r.fastSpeed*100}%`;
  $('speed-state').textContent=s.recovery>0?'균형 회복 중':s.speed>r.baseSpeed+1?'가속 · 반응 거리 주의':s.speed<r.baseSpeed-1?'감속 · 정밀 조향':'안정 주행';
  $('score').textContent=Math.floor(s.score).toString().padStart(6,'0');$('supplies').textContent=`보급품 ${s.supplies} / ${c.supplyGoal}${s.supplies>=c.supplyGoal?' · 달성':''}`;
  $('streak').textContent=`연속 안전 통과 ${s.streak}회`;
  $('route-label').textContent=(s.route==='fast'?'빙붕 지름길':s.route==='safe'?'해안 보급로':'갈림길까지 주행')+(s.weather==='wind'?' · 약한 측풍':'');
  const active=s.phase==='running'||s.phase==='paused';
  const phase=s.recovery>0?'접촉 · 균형 회복':s.invulnerability>0?'회복 보호 중':({anticipation:'점프 준비',air:'공중 · 착지 위치 확인',landing:'착지',ground:''}[s.jumpPhase]);
  $('phase-indicator').textContent=phase;$('phase-indicator').hidden=!active||!phase;
  $('fork').hidden=!active||!!s.route||!s.forkShown||Boolean(replay);
  const next=sim.objects.find(o=>o.class==='HAZARD'&&sim.active(o)&&!sim.resolved.has(o.id)&&o.z-s.distance>0&&o.z-s.distance<65);
  $('hazard-cue').hidden=!active||!next||!$('fork').hidden;
  if(next){const x=objectX(next,s.elapsed);$('hazard-cue').textContent=`△ ${x<-1?'왼쪽':x>1?'오른쪽':'가운데'} ${next.label} · ${Math.ceil(next.z-s.distance)} m · ${next.type==='seal'?'옆으로 우회':'우회 / 점프'}`;}
}
function complete(){
  const s=sim.state,result=sim.summary(),won=s.phase==='won';
  showScreen(s.phase);input.clear();$('notice').hidden=true;
  $('result-eyebrow').textContent=won?'EXPEDITION COMPLETE':'ANOTHER ROUTE AWAITS';
  $('result-title').textContent=won?'항로 연결 완료':'다시 출발할 시간';
  $('result-description').textContent=won?'루미가 여명 기지에 도착했습니다. 작은 발걸음으로 대륙이 이어졌어요.':'제한 시간이 다 되었습니다. 감속 구간을 줄이거나 위험을 우회해 다시 도전하세요.';
  $('result-time').textContent=`${s.elapsed.toFixed(1)}초`;$('result-score').textContent=result.score.toLocaleString();
  $('result-mission').textContent=`${s.supplies} / ${config.course.supplyGoal}`;
  const losses=Object.entries(s.lossByType).sort((a,b)=>b[1]-a[1]),worst=losses[0];
  $('result-cause').textContent=worst?`가장 큰 시간 페널티: ${config.objects[worst[0]].label} · ${worst[1].toFixed(1)}초. 충돌 감속 시간은 별도입니다.`:won?'충돌 없이 안전하게 도착했습니다. 다음에는 다른 경로에 도전해 보세요.':'충돌 페널티는 없습니다. 가속으로 이동 시간을 줄여 보세요.';
  $('result-detail').textContent=`${sim.options.training?'연습':'탐험'} / ${sim.options.autoJump?'점프 보조':'수동 점프'} · ${s.route==='fast'?'빙붕 지름길':'해안 보급로'} · 충돌 ${s.collisions}회 · 물고기 ${s.fish}개 · 최대 연속 통과 ${s.bestStreak}회 · 시드 ${sim.seed} · 규칙 ${sim.hash} · 빌드 ${BUILD_VERSION}`;
  if(!replay&&won){
    const key=recordKey(sim),previous=read(key,null);
    if(!previous||!Number.isFinite(previous.score)||previous.score<result.score)if(!save(key,result))$('result-cause').textContent+=' 이 브라우저에서 기록 저장이 차단되어 있습니다.';
  }
  if(replay){
    const matches=JSON.stringify(sim.summary())===JSON.stringify(replay.result);
    $('result-description').textContent=matches?'저장된 시드와 입력의 재생 결과가 정확히 일치합니다.':'재생 결과 불일치: 기록 또는 규칙을 확인해 주세요.';
  }
  $('result').focus();
}
function processEvents(){
  while(eventCursor<sim.events.length){
    const e=sim.events[eventCursor++];audio.play(e.type);
    if(e.type==='pickup_collected')notify(`${e.object_type==='fish'?'물고기':'보급품'} +${e.score_delta}점${e.object_type==='supply'?` · 보급품 ${sim.state.supplies}/${config.course.supplyGoal}`:''}`);
    if(e.type==='collision')notify(`${config.objects[e.object_type].label} 접촉 · ${e.penalty}초 손실 · 자동 회복`,3,2);
    if(e.type==='near_miss')notify(`아슬아슬한 통과 · +${e.score_delta}점`,1);
    if(e.type==='route_selected')notify(e.route_id==='fast'?`빙붕 지름길 · ${config.course.fork.fastReduction} m 단축`:'해안 보급로 · 위험이 적은 경로',2,3);
    if(e.type==='weather_changed'&&e.weather==='wind')notify('약한 측풍 · 표지와 도로 경계를 따라가세요',2,4);
    if(e.type==='time_warning'&&!sim.options.training)notify('남은 시간 20초 · 목적지를 확인하세요',2,4);
    if(e.type==='segment_end')complete();
  }
}
function openSettings(){
  if(!ready||contextLost||$('settings').open)return;
  sim.pause();input.clear();accumulator=0;
  $('resume').firstElementChild.textContent=sim.state.phase==='paused'?'계속 달리기':'설정 닫기';
  $('restart').hidden=!['paused','running'].includes(sim.state.phase);
  $('settings').showModal();
}
function closeSettings(){if(contextLost)return;$('settings').close();sim.resume();input.clear();document.activeElement?.blur();accumulator=0;lastFrame=0;}
function frame(now){
  if(!ready||contextLost)return;
  const delta=lastFrame?clamp((now-lastFrame)/1000,0,.1):0;lastFrame=now;
  if(sim.state.phase==='running'){
    accumulator+=delta;
    while(accumulator>=1/config.rules.tickRate&&sim.state.phase==='running'){
      let controls;
      if(replay){
        if(replay.inputs[replayIndex]?.tick===sim.state.tick)replayInput=replay.inputs[replayIndex++].input;
        controls=replayInput;
      }else controls=input.poll();
      sim.step(controls);accumulator-=1/config.rules.tickRate;
      if(replay&&sim.state.tick>=replay.end_tick&&sim.state.phase==='running'){sim.pause();fatal(new Error('리플레이 종료 시점에 결과가 일치하지 않습니다.'));break;}
    }
    processEvents();
  }
  if(!settings.reduced&&sim.state.phase!=='paused')animationTime+=delta;
  renderer.render(sim,settings.reduced?0:animationTime,settings);
  if(now-lastHUD>80){updateHUD();lastHUD=now;}
  if(now>noticeUntil)$('notice').hidden=true;
  requestAnimationFrame(frame);
}
$('reload').addEventListener('click',()=>location.reload());
$('start').addEventListener('click',start);
$('pause').addEventListener('click',openSettings);$('resume').addEventListener('click',closeSettings);
$('settings').addEventListener('cancel',e=>{e.preventDefault();closeSettings();});

$('restart').addEventListener('click',()=>{$('settings').close();reset({start:true,keep:true});});
$('retry').addEventListener('click',()=>reset({start:true,keep:true}));
$('home').addEventListener('click',()=>{reset();$('start').focus();});
$('sound').addEventListener('click',()=>{document.activeElement?.blur();settings.muted=!settings.muted;applySettings();save('white-route.settings.v1',settings);audio.unlock();});
for(const key of ['large','contrast','reduced','snow','auto-jump'])$(key).addEventListener('change',()=>{settings[key==='auto-jump'?'autoJump':key]=$(key).checked;applySettings();save('white-route.settings.v1',settings);});
for(const element of document.querySelectorAll('[data-route]'))element.addEventListener('click',()=>{input.routeQueued=element.dataset.route;element.blur();});
for(const id of ['seed','mode'])$(id).addEventListener('change',()=>{if(ready&&sim.state.phase==='ready')reset();});
window.addEventListener('blur',()=>{if(sim?.state.phase==='running')openSettings();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&sim?.state.phase==='running')openSettings();});
$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;sim?.pause();input?.clear();fatal(new Error('그래픽 장치 연결이 중단되어 주행을 멈췄습니다. 페이지를 다시 열어 주세요.'));});
$('export').addEventListener('click',()=>{
  if(!sim||!['won','lost'].includes(sim.state.phase))return;
  const blob=new Blob([JSON.stringify(sim.exportReplay(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`white-route-${sim.seed}-${sim.state.phase}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('import').addEventListener('click',()=>$('replay-file').click());
$('replay-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>4*1024*1024)throw new Error('리플레이는 4 MB 이하여야 합니다.');
    const record=validateReplay(JSON.parse(await file.text()),config);
    // Validate the complete deterministic outcome before accepting an untrusted record.
    replayRun(record,config);
    input.clear();sim=new Simulation(config,{seed:record.seed,...record.options});sim.start();
    replay=record;replayIndex=0;replayInput={};accumulator=0;eventCursor=0;noticeUntil=0;
    $('seed').value=record.seed;showScreen('running');audio.unlock();
  }catch(error){notify(error.message,3,6);}finally{event.target.value='';}
});
try{
  const response=await fetch(new URL('../data/coast.json',import.meta.url));if(!response.ok)throw new Error(`코스 데이터를 읽지 못했습니다 (${response.status}).`);
  config=await response.json();sim=new Simulation(config,options());renderer=new Renderer($('world'),config);
  input=new Input({onPause:()=>{$('settings').open?closeSettings():openSettings();},onStart:start});
  if(renderer.backend==='software')$('controls').querySelector('small').textContent='SOFTWARE 3D / v0.1';
  applySettings();reset();ready=true;$('start').disabled=false;$('start').firstElementChild.textContent='탐험 시작';
  // Read-only snapshots are useful for browser QA without exposing a live mutation API.
  window.whiteRoute=Object.freeze({snapshot:()=>structuredClone(sim.state),summary:()=>sim.summary(),diagnostics:()=>({vertices:renderer.lastVertexCount,version:BUILD_VERSION,hash:sim.hash,renderer:renderer.backend}),exportReplay:()=>sim.exportReplay()});
  requestAnimationFrame(frame);
}catch(error){fatal(error);}
