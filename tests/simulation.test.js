import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, makeCourse, validateConfig, normalizeInput, fingerprint, replayRun, validateReplay, objectX } from '../src/simulation.js';
const config=JSON.parse(readFileSync(new URL('../data/coast.json',import.meta.url),'utf8'));
const fresh=(options={})=>{const s=new Simulation(config,options);s.start();return s;};
const steps=(s,n,input={})=>{for(let i=0;i<n;i++)s.step(typeof input==='function'?input(i,s):input);return s;};
const blank=()=>{const s=fresh();s.objects=[];return s;};
const object=(type,z,x=0)=>({id:`test-${type}-${z}`,type,...config.objects[type],x,z,route:'all',phase:0,lane:1});
const finish=(s,input={throttle:true})=>{for(let i=0;i<36000&&s.state.phase==='running';i++)s.step(input);return s;};
test('configuration validates and constructor rejects non-uint32 seeds',()=>{
  assert.equal(validateConfig(config),config);
  for(const seed of [-1,NaN,Infinity,1.5,4294967296])assert.throws(()=>new Simulation(config,{seed}));
  assert.doesNotThrow(()=>new Simulation(config,{seed:0}));
});
test('course validation rejects impossible reaction and recovery budgets',()=>{
  for(const modify of [c=>c.rules.fastSpeed=200,c=>c.course.blocks.spacing=4,c=>c.course.safeStart=10,c=>c.objects.hole.width=NaN,c=>c.course.patterns=[],c=>c.course.tutorial[0].lane=8,c=>c.rules.invulnerabilitySeconds=.1]){
    const c=structuredClone(config);modify(c);assert.throws(()=>validateConfig(c));
  }
});
test('configuration hash ignores object key order and notices balance changes',()=>{
  const reversed=Object.fromEntries(Object.entries(config).reverse());assert.equal(fingerprint(config),fingerprint(reversed));
  const c=structuredClone(config);c.rules.baseSpeed++;assert.notEqual(fingerprint(config),fingerprint(c));
});
test('seeded course is identical for equal seed, different for a different seed',()=>{
  assert.deepEqual(makeCourse(config,11),makeCourse(config,11));assert.notDeepEqual(makeCourse(config,11),makeCourse(config,12));
});
test('many seeded courses retain a safe lane, introduction and recovery space',()=>{
  for(let seed=0;seed<150;seed++){
    const objects=makeCourse(config,seed),hazards=objects.filter(o=>o.class==='HAZARD');
    assert.equal(new Set(objects.map(o=>o.id)).size,objects.length);
    assert.ok(hazards.every(o=>o.z>=config.course.safeStart));
    const rows=Map.groupBy(hazards,o=>o.z),positions=[...rows.keys()];
    for(const row of rows.values()){
      assert.ok(row.length<=2);
      assert.ok(config.course.lanes.some(x=>row.every(o=>Math.abs(o.x-x)>o.width/2+config.rules.playerRadius+(o.amplitude||0))));
    }
    for(let i=1;i<positions.length;i++)assert.ok(positions[i]-positions[i-1]>config.rules.fastSpeed*config.rules.invulnerabilitySeconds);
  }
});
test('normalizes untrusted input values',()=>{
  assert.deepEqual(normalizeInput({steer:NaN,throttle:'yes',jump:1,route:'evil'}),{steer:0,throttle:false,brake:false,jump:false,route:null});
  assert.equal(normalizeInput({steer:40}).steer,1);
});
test('ready and paused simulation do not consume time or mutate inputs',()=>{
  const s=new Simulation(config);s.step({throttle:true});assert.equal(s.state.tick,0);
  s.start();steps(s,10);s.pause();const snapshot=structuredClone(s.state);steps(s,40,{jump:true});assert.deepEqual(s.state,snapshot);
  s.resume();s.step();assert.equal(s.state.tick,11);
});
test('accelerating and braking produce measurable speed and distance differences',()=>{
  const fast=blank(),slow=blank(),base=blank();steps(fast,300,{throttle:true});steps(slow,300,{brake:true});steps(base,300);
  assert.equal(fast.state.speed,config.rules.fastSpeed);assert.equal(slow.state.speed,config.rules.brakeSpeed);
  assert.ok(fast.state.distance>base.state.distance&&base.state.distance>slow.state.distance);
  assert.ok(fast.state.score>base.state.score);
});
test('steering is continuous, immediate and constrained to the course',()=>{
  const s=blank();s.step({steer:1});assert.ok(s.state.x>0&&s.state.x<config.course.lanes[2]);
  steps(s,1000,{steer:1});assert.ok(s.state.x<=config.course.halfWidth-config.rules.playerRadius);
  steps(s,1000,{steer:-1});assert.ok(s.state.x>=-config.course.halfWidth+config.rules.playerRadius);
});
test('jump has anticipation, air, landing and ground phases',()=>{
  const s=blank();s.step({jump:true});assert.equal(s.state.jumpPhase,'anticipation');steps(s,90);
  assert.deepEqual(s.events.filter(e=>e.type==='action_phase').map(e=>e.phase),['anticipation','air','landing','ground']);
  assert.equal(s.state.y,0);assert.equal(s.events.filter(e=>e.type==='jump_landed').length,1);
});
test('held jump does not auto-repeat; releasing and pressing starts another jump',()=>{
  const s=blank();steps(s,180,{jump:true});assert.equal(s.events.filter(e=>e.type==='jump_started').length,1);
  s.step({jump:false});steps(s,10,{jump:true});assert.equal(s.events.filter(e=>e.type==='jump_started').length,2);
});
test('a correctly timed jump clears a hole without a collision',()=>{
  const s=blank();s.objects=[object('hole',14)];steps(s,80,i=>({jump:i===20}));
  assert.equal(s.state.collisions,0);assert.ok(s.events.some(e=>e.type==='hazard_cleared'&&e.jumped));
});
test('auto-jump assistance clears the longest gap at maximum speed',()=>{
  const s=fresh({autoJump:true});s.objects=[object('crevasse',70)];steps(s,250,{throttle:true});
  assert.equal(s.state.collisions,0);assert.ok(s.events.some(e=>e.type==='jump_started'));
});
test('contact is charged once and recovery prevents forced chain collisions',()=>{
  const s=blank();s.objects=[object('hole',5),object('crevasse',8)];steps(s,180);
  assert.equal(s.state.collisions,1);assert.equal(s.state.timePenalty,config.objects.hole.penalty);
  assert.ok(s.events.some(e=>e.type==='recovery_protected'));assert.equal(s.state.invulnerability,0);
});
test('moving seals cannot be avoided by jumping; animals are not damaged',()=>{
  const s=blank();const seal=object('seal',14);seal.amplitude=0;s.objects=[seal];steps(s,100,i=>({jump:i===20}));
  assert.equal(s.state.collisions,1);assert.ok(s.events.some(e=>e.type==='collision'&&e.object_type==='seal'));assert.equal(seal.health,undefined);
});
test('pickups update score and objective in the same causal event, once',()=>{
  const s=blank();s.objects=[object('supply',5),object('fish',20)];steps(s,180);
  assert.equal(s.state.supplies,1);assert.equal(s.state.fish,1);
  const events=s.events.filter(e=>e.type==='pickup_collected');assert.equal(events.length,2);
  assert.equal(events[0].object_id,'test-supply-5');assert.equal(events[0].objective_delta,1);assert.equal(events[0].score_delta,config.rules.supplyScore);
});
test('collectibles are optional; zero collection can still complete the course',()=>{
  const s=finish(blank());assert.equal(s.state.phase,'won');assert.equal(s.state.supplies,0);assert.equal(s.summary().mission_complete,false);
});
test('a near miss does not apply collision slowdown or penalty',()=>{
  const s=blank();s.state.x=2;s.objects=[object('hole',8)];steps(s,100);
  assert.equal(s.state.collisions,0);assert.equal(s.state.speed,config.rules.baseSpeed);assert.ok(s.events.some(e=>e.type==='near_miss'));
});
test('warning lead times meet the two-second budget on a normal full-speed run',()=>{
  const s=fresh();finish(s);
  assert.ok(s.events.filter(e=>e.type==='hazard_shown').every(e=>e.lead_time>=2));
});
test('route cannot be selected early or changed after commitment',()=>{
  const s=blank();s.selectRoute('fast');assert.equal(s.state.route,null);
  s.state.distance=config.course.fork.revealAt;s.step({route:'fast'});assert.equal(s.state.route,'fast');assert.equal(s.state.length,3000);
  s.step({route:'safe'});assert.equal(s.state.route,'fast');assert.equal(s.events.filter(e=>e.type==='route_selected').length,1);
});
test('unselected route defaults safely; steering right chooses the shortcut',()=>{
  const a=blank(),b=blank();a.state.distance=b.state.distance=config.course.fork.chooseAt-.1;b.state.x=3;
  a.step();b.step();assert.equal(a.state.route,'safe');assert.equal(b.state.route,'fast');
});
test('shortcut activates actual additional hazards, not just a label',()=>{
  const s=fresh();const extra=s.objects.find(o=>o.route==='fast');assert.ok(extra);assert.equal(s.active(extra),false);
  s.state.distance=config.course.fork.revealAt;s.step({route:'fast'});assert.equal(s.active(extra),true);
});
test('time out produces a single terminal result and stays frozen',()=>{
  const s=finish(blank(),{brake:true});assert.equal(s.state.phase,'lost');const snapshot=structuredClone(s.state);steps(s,60,{throttle:true});assert.deepEqual(s.state,snapshot);
  assert.equal(s.events.filter(e=>e.type==='segment_end').length,1);
});
test('training cannot time out and is recorded as an assist setting',()=>{
  const s=fresh({training:true});s.objects=[];finish(s,{brake:true});assert.equal(s.state.phase,'won');assert.equal(s.state.timeLeft,0);
  assert.equal(s.exportReplay().options.training,true);
});
test('same seed and input reproduces exact state and events',()=>{
  const a=fresh({seed:128}),b=fresh({seed:128});
  const input=i=>({throttle:i%600<350,brake:i%600>510,jump:i%83===0,steer:Math.sin(i*.007)>.8?.5:0});
  steps(a,9000,input);steps(b,9000,input);assert.deepEqual(a.state,b.state);assert.deepEqual(a.events,b.events);
});
test('exported replay round-trips to identical outcome and telemetry',()=>{
  const s=fresh({seed:19});finish(s,{throttle:true});const data=JSON.parse(JSON.stringify(s.exportReplay()));
  const copy=replayRun(data,config);assert.deepEqual(copy.summary(),s.summary());assert.deepEqual(copy.events,s.events);
});
test('paused wall-clock time is excluded from replay',()=>{
  const s=fresh();steps(s,160,{throttle:true});s.pause();steps(s,500,{steer:1});s.resume();finish(s,{throttle:true});
  assert.deepEqual(replayRun(s.exportReplay(),config).summary(),s.summary());
});
test('replay rejects version mismatches, reordered inputs, invalid values, truncation and tampered results',()=>{
  const source=fresh();finish(source);const original=source.exportReplay();
  for(const modify of [r=>r.config_hash='wrong',r=>r.build='other',r=>r.end_tick=1e9,r=>r.inputs[0].tick=1,r=>r.inputs[0].input.steer=Infinity,r=>r.options.autoJump='yes',r=>r.result=null]){
    const record=structuredClone(original);modify(record);assert.throws(()=>validateReplay(record,config));
  }
  const tampered=structuredClone(original);tampered.result.score++;assert.throws(()=>replayRun(tampered,config));
});
test('moving hazard positions are deterministic and within reserved envelope',()=>{
  const o=makeCourse(config,1).find(o=>o.type==='seal');
  for(let t=0;t<100;t+=.11)assert.ok(Math.abs(objectX(o,t)-o.x)<=o.amplitude+1e-10);
});

test('auto-jump clears long gaps at brake, cruise and top speed',()=>{
  for(const input of [{brake:true},{},{throttle:true}]){
    const s=fresh({autoJump:true});s.objects=[object('crevasse',70)];steps(s,900,input);
    assert.equal(s.state.collisions,0,JSON.stringify(input));
  }
});
test('invalid object classes and route values do not become gameplay',()=>{
  const c=structuredClone(config);c.objects.hole.class='COLLECTIBLE';assert.throws(()=>validateConfig(c));
  const s=blank();s.state.distance=config.course.fork.revealAt;s.selectRoute('unknown');assert.equal(s.state.route,null);
});
