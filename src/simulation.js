/** Browser-independent deterministic domain. One step is exactly one simulation tick. */
export const BUILD_VERSION = '0.1.0';
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const approach = (a, b, d) => a < b ? Math.min(a + d, b) : Math.max(a - d, b);
const stable = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
  : value;
export function fingerprint(config) {
  let hash = 2166136261;
  for (const ch of JSON.stringify(stable(config))) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function validateConfig(config) {
  const fail = message => { throw new Error(`Invalid course data: ${message}`); };
  if (!config?.rules || !config?.course || !config?.objects || typeof config.version !== 'string') fail('missing sections');
  const { rules: r, course: c, objects } = config;
  for (const key of ['tickRate','baseSpeed','fastSpeed','brakeSpeed','recoverySpeed','acceleration','braking','lateralSpeed','steeringResponse','playerRadius','playerDepth','jumpVelocity','gravity','anticipationSeconds','landingSeconds','recoverySeconds','invulnerabilitySeconds','visibilityDistance','nearMissDistance','distanceScore','clearScore','fishScore','supplyScore','autoJumpLeadSeconds']) {
    if (!Number.isFinite(r[key]) || r[key] <= 0) fail(`rules.${key}`);
  }
  if (r.tickRate !== 60 || r.brakeSpeed >= r.baseSpeed || r.baseSpeed >= r.fastSpeed || r.recoverySpeed > r.brakeSpeed) fail('speed/tick ordering');
  if (r.visibilityDistance / r.fastSpeed < 2 || r.invulnerabilitySeconds < r.recoverySeconds) fail('reaction/recovery budget');
  for (const key of ['length','timeLimit','halfWidth','safeStart','safeFinish','supplyGoal','defaultSeed']) if (!Number.isFinite(c[key]) || c[key] <= 0) fail(`course.${key}`);
  if (!Array.isArray(c.lanes) || c.lanes.length !== 3 || !c.lanes.every(Number.isFinite) || c.lanes.some((x, i) => Math.abs(x) + 1.8 > c.halfWidth || i && x <= c.lanes[i - 1])) fail('lanes');
  if (c.safeStart / r.fastSpeed < 10) fail('ten second introduction');
  if (!Number.isInteger(c.defaultSeed) || c.defaultSeed > 0xffffffff) fail('defaultSeed');
  if (!c.fork || !['revealAt','chooseAt','endAt','fastReduction'].every(k => Number.isFinite(c.fork[k])) || !(c.fork.revealAt < c.fork.chooseAt && c.fork.chooseAt < c.fork.endAt && c.fork.endAt < c.length - c.safeFinish)) fail('fork ordering');
  if (!Number.isFinite(c.fork.fastReduction) || c.fork.fastReduction < 0 || c.fork.fastReduction >= c.safeFinish) fail('fork reduction');
  if (!c.weather || !Number.isFinite(c.weather.wind) || !(c.weather.from < c.weather.to && c.weather.to < c.length)) fail('weather');
  if (!c.blocks || !Number.isFinite(c.blocks.spacing) || c.blocks.spacing / r.fastSpeed < r.invulnerabilitySeconds + 2 || !(c.blocks.from > c.fork.chooseAt && c.blocks.to < c.length - c.fork.fastReduction - 100)) fail('pattern spacing');
  if (!Array.isArray(c.patterns) || !c.patterns.length || !Array.isArray(c.tutorial) || !c.tutorial.length) fail('patterns/tutorial');
  for (const type of ['hole','crevasse','seal','fish','supply']) {
    const o = objects[type];
    if (!o || !['HAZARD','COLLECTIBLE'].includes(o.class) || !Number.isFinite(o.width) || o.width <= 0 || !Number.isFinite(o.depth) || o.depth <= 0) fail(`object ${type}`);
    if (o.class !== (['fish','supply'].includes(type) ? 'COLLECTIBLE' : 'HAZARD')) fail(`object class ${type}`);
    if (type === 'seal' && (!Number.isFinite(o.amplitude) || o.amplitude < 0)) fail('seal amplitude');
    if (o.class === 'HAZARD' && (!Number.isFinite(o.penalty) || o.penalty < 0 || o.clearHeight !== null && (!Number.isFinite(o.clearHeight) || o.clearHeight < 0))) fail(`hazard ${type}`);
  }
  for (const p of [...c.patterns, ...c.tutorial]) if (objects[p.type]?.class !== 'HAZARD') fail('pattern hazard type');
  for (const p of c.tutorial) if (!Number.isFinite(p.z) || p.z < c.safeStart || p.z >= c.fork.revealAt || !Number.isInteger(p.lane) || p.lane < 0 || p.lane > 2) fail('tutorial placement');
  return config;
}
export function makeCourse(config, seed) {
  const c = config.course, rng = random(seed), objects = [];
  const add = (type, z, lane, route = 'all', pattern = 'intro') => objects.push({
    id: `${c.id}_${objects.length.toString().padStart(3, '0')}`, type,
    ...config.objects[type], z, x: c.lanes[lane], lane, route, pattern, phase: rng() * Math.PI * 2
  });
  for (const p of c.tutorial) {
    add(p.type, p.z, p.lane);
    add('fish', p.z + 38, (p.lane + 1) % 3);
    add('supply', p.z + 65, 1);
  }
  for (const z of [120, 150, 180]) add('fish', z, 1);
  add('supply', 220, 0);
  for (let z = c.blocks.from; z <= c.blocks.to; z += c.blocks.spacing) {
    const p = c.patterns[Math.floor(rng() * c.patterns.length)], lane = Math.floor(rng() * 3);
    add(p.type, z, lane, 'all', p.id);
    // The fast variant occupies one additional lane; the third remains safe.
    if (z < c.fork.endAt) add('hole', z, (lane + 1) % 3, 'fast', p.id);
    const safe = (lane + 2) % 3;
    for (const offset of [28, 42, 56]) add('fish', z + offset, safe, 'all', p.id);
    add('supply', z + 82, safe, 'all', p.id);
  }
  return objects.sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
}
export function objectX(object, elapsed) {
  return object.x + (object.type === 'seal' ? Math.sin(elapsed * 1.7 + object.phase) * object.amplitude : 0);
}
export function normalizeInput(input = {}) {
  const axis = value => Number.isFinite(value) ? Math.round(clamp(value, -1, 1) * 1000) / 1000 : 0;
  return { steer: axis(input.steer), throttle: input.throttle === true, brake: input.brake === true,
    jump: input.jump === true, route: ['safe','fast'].includes(input.route) ? input.route : null };
}
export class Simulation {
  constructor(config, { seed = config.course.defaultSeed, training = false, autoJump = false } = {}) {
    validateConfig(config);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer');
    this.config = structuredClone(config);
    this.seed = seed; this.options = { training: training === true, autoJump: autoJump === true };
    this.hash = fingerprint(config); this.objects = makeCourse(this.config, seed);
    this.events = []; this.inputs = []; this.seen = new Set(); this.resolved = new Set(); this.encounters = new Map();
    this.lastInput = ''; this.jumpHeld = false;
    this.state = {
      phase: 'ready', tick: 0, elapsed: 0, distance: 0, length: config.course.length,
      timeLeft: config.course.timeLimit, timePenalty: 0, speed: config.rules.baseSpeed,
      x: 0, vx: 0, y: 0, vy: 0, jumpPhase: 'ground', phaseTime: 0, airStarted: 0,
      recovery: 0, invulnerability: 0, route: null, weather: 'clear',
      score: 0, fish: 0, supplies: 0, collisions: 0, streak: 0, bestStreak: 0,
      lossByType: {}, lowTimeWarned: false, forkShown: false
    };
  }
  emit(type, data = {}) { this.events.push({ type, tick: this.state.tick, ...data }); }
  start() {
    if (this.state.phase !== 'ready') return;
    this.state.phase = 'running';
    this.emit('segment_start', { segment_id: this.config.course.id, seed: this.seed, assist_flags: { ...this.options } });
  }
  pause() { if (this.state.phase === 'running') this.state.phase = 'paused'; }
  resume() { if (this.state.phase === 'paused') this.state.phase = 'running'; }
  active(object) { return object.route === 'all' || object.route === this.state.route; }
  selectRoute(route) {
    const s = this.state, f = this.config.course.fork;
    if (!['safe','fast'].includes(route) || s.route || s.distance < f.revealAt || s.distance > f.chooseAt + this.config.rules.fastSpeed / 60) return;
    s.route = route;
    if (route === 'fast') s.length -= f.fastReduction;
    this.emit('route_selected', { route_id: route, displayed_tradeoff: route === 'fast' ? `${f.fastReduction}m shorter / extra hazard` : 'fewer hazards / full distance' });
  }
  setJumpPhase(phase) {
    const s = this.state;
    this.emit('action_phase', { action: 'jump', phase, previous_phase: s.jumpPhase, duration: s.phaseTime });
    s.jumpPhase = phase; s.phaseTime = 0;
  }
  step(rawInput = {}) {
    const s = this.state, r = this.config.rules, c = this.config.course;
    if (s.phase !== 'running') return;
    const input = normalizeInput(rawInput), encoded = JSON.stringify(input), dt = 1 / r.tickRate;
    if (encoded !== this.lastInput) { this.inputs.push({ tick: s.tick, input }); this.lastInput = encoded; }
    const oldDistance = s.distance;
    s.tick++; s.elapsed = s.tick * dt;
    s.recovery = Math.max(0, s.recovery - dt); s.invulnerability = Math.max(0, s.invulnerability - dt);
    const target = s.recovery > 0 ? r.recoverySpeed : input.brake ? r.brakeSpeed : input.throttle ? r.fastSpeed : r.baseSpeed;
    s.speed = approach(s.speed, target, (target > s.speed ? r.acceleration : r.braking) * dt);
    const weather = s.distance >= c.weather.from && s.distance < c.weather.to ? 'wind' : 'clear';
    if (s.weather !== weather) { s.weather = weather; this.emit('weather_changed', { weather }); }
    const wind = weather === 'wind' ? c.weather.wind * Math.sin(s.elapsed * 0.6) : 0;
    s.vx += (input.steer * r.lateralSpeed + wind - s.vx) * Math.min(1, r.steeringResponse * dt);
    s.x = clamp(s.x + s.vx * dt, -c.halfWidth + r.playerRadius + 0.15, c.halfWidth - r.playerRadius - 0.15);
    let wantJump = input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    if (this.options.autoJump && s.jumpPhase === 'ground') {
      wantJump ||= this.objects.some(o => this.active(o) && o.class === 'HAZARD' && o.clearHeight !== null && !this.resolved.has(o.id)
        && o.z - o.depth / 2 - s.distance > 0 && o.z - o.depth / 2 - s.distance < s.speed * r.autoJumpLeadSeconds
        && Math.abs(objectX(o, s.elapsed) - s.x) < o.width / 2 + r.playerRadius);
    }
    if (wantJump && s.jumpPhase === 'ground' && s.recovery <= 0) {
      this.setJumpPhase('anticipation'); this.emit('action_used', { action: 'jump', speed: s.speed, x: s.x });
    }
    s.phaseTime += dt;
    if (s.jumpPhase === 'anticipation' && s.phaseTime >= r.anticipationSeconds) {
      this.setJumpPhase('air'); s.vy = r.jumpVelocity; s.airStarted = s.elapsed;
      this.emit('jump_started', { speed: s.speed, x: s.x });
    }
    if (s.jumpPhase === 'air') {
      s.y += s.vy * dt - 0.5 * r.gravity * dt * dt; s.vy -= r.gravity * dt;
      if (s.y <= 0) {
        s.y = 0; s.vy = 0; this.setJumpPhase('landing');
        this.emit('jump_landed', { speed: s.speed, landing_x: s.x, airborne_duration: s.elapsed - s.airStarted });
      }
    } else if (s.jumpPhase === 'landing' && s.phaseTime >= r.landingSeconds) this.setJumpPhase('ground');
    s.distance = Math.min(s.length, s.distance + s.speed * dt);
    s.score += (s.distance - oldDistance) * r.distanceScore * (input.throttle && !input.brake ? 1.25 : 1);
    if (s.distance >= c.fork.revealAt && !s.forkShown) { s.forkShown = true; this.emit('route_shown'); }
    if (input.route) this.selectRoute(input.route);
    if (!s.route && s.distance >= c.fork.chooseAt) this.selectRoute(s.x > 1 ? 'fast' : 'safe');
    for (const o of this.objects) {
      if (!this.active(o) || this.resolved.has(o.id) || o.z - s.distance > r.visibilityDistance) continue;
      if (!this.seen.has(o.id)) {
        this.seen.add(o.id);
        this.emit(o.class === 'HAZARD' ? 'hazard_shown' : 'pickup_shown', {
          object_id: o.id, object_type: o.type, class: o.class,
          lead_time: Math.max(0, (o.z - o.depth / 2 - s.distance) / s.speed), weather: s.weather
        });
      }
      const dx = Math.abs(s.x - objectX(o, s.elapsed)) - o.width / 2 - r.playerRadius;
      // Swept longitudinal interval prevents tunnelling at maximum speed.
      const overlap = oldDistance - r.playerDepth <= o.z + o.depth / 2 && s.distance + r.playerDepth >= o.z - o.depth / 2;
      const encounter = this.encounters.get(o.id) || { closest: Infinity, airborne: false };
      if (overlap) { encounter.closest = Math.min(encounter.closest, dx); encounter.airborne ||= s.y > 0.35; this.encounters.set(o.id, encounter); }
      if (overlap && dx < 0 && o.class === 'COLLECTIBLE' && s.y < 1.4) {
        const reward = o.type === 'fish' ? r.fishScore : r.supplyScore;
        s[o.type === 'fish' ? 'fish' : 'supplies']++; s.score += reward;
        this.resolved.add(o.id);
        this.emit('pickup_collected', { object_id: o.id, object_type: o.type, score_delta: reward, objective_delta: o.type === 'supply' ? 1 : 0 });
      } else if (overlap && dx < 0 && o.class === 'HAZARD' && (o.clearHeight === null || s.y < o.clearHeight)) {
        this.resolved.add(o.id);
        if (s.invulnerability > 0) { this.emit('recovery_protected', { object_id: o.id }); continue; }
        s.collisions++; s.streak = 0; s.timePenalty += o.penalty;
        s.lossByType[o.type] = (s.lossByType[o.type] || 0) + o.penalty;
        s.recovery = r.recoverySeconds; s.invulnerability = r.invulnerabilitySeconds;
        s.speed = r.recoverySpeed; s.y = 0; s.vy = 0;
        if (s.jumpPhase !== 'ground') this.setJumpPhase('ground');
        this.emit('collision', { hazard_id: o.id, object_type: o.type, penalty: o.penalty, recover_time: r.recoverySeconds });
      }
      if (!this.resolved.has(o.id) && s.distance - r.playerDepth > o.z + o.depth / 2) {
        this.resolved.add(o.id);
        if (o.class === 'HAZARD') {
          s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
          const reward = r.clearScore * (1 + Math.min(4, Math.floor(s.streak / 3)));
          s.score += reward;
          const type = encounter.closest >= 0 && encounter.closest < r.nearMissDistance ? 'near_miss' : 'hazard_cleared';
          this.emit(type, { hazard_id: o.id, object_type: o.type, closest_distance: Number.isFinite(encounter.closest) ? encounter.closest : null, jumped: encounter.airborne, score_delta: reward });
        }
      }
    }
    s.timeLeft = Math.max(0, c.timeLimit - s.elapsed - s.timePenalty);
    if (s.timeLeft <= 20 && !s.lowTimeWarned) { s.lowTimeWarned = true; this.emit('time_warning'); }
    if (s.timeLeft <= 0 && !this.options.training) this.finish('lost');
    else if (s.distance >= s.length) this.finish('won');
  }
  finish(phase) {
    if (this.state.phase !== 'running') return;
    this.state.phase = phase; this.emit('segment_end', this.summary());
  }
  summary() {
    const s = this.state;
    return { result: s.phase, tick: s.tick, score: Math.floor(s.score), time_left: +s.timeLeft.toFixed(3), elapsed: +s.elapsed.toFixed(3),
      distance: +s.distance.toFixed(3), fish: s.fish, supplies: s.supplies, collisions: s.collisions,
      best_streak: s.bestStreak, route: s.route, mission_complete: s.supplies >= this.config.course.supplyGoal };
  }
  exportReplay() {
    return { schema: 1, build: BUILD_VERSION, config_hash: this.hash, course_version: this.config.version,
      seed: this.seed, options: { ...this.options }, end_tick: this.state.tick,
      inputs: structuredClone(this.inputs), result: this.summary(), events: structuredClone(this.events) };
  }
}
export function validateReplay(replay, config) {
  const fail = reason => { throw new Error(`리플레이를 읽을 수 없습니다: ${reason}`); };
  if (!replay || replay.schema !== 1 || replay.build !== BUILD_VERSION || replay.config_hash !== fingerprint(config)) fail('빌드 또는 코스 버전이 다릅니다.');
  if (!Number.isInteger(replay.seed) || replay.seed < 0 || replay.seed > 0xffffffff) fail('잘못된 시드');
  if (!replay.options || typeof replay.options.training !== 'boolean' || typeof replay.options.autoJump !== 'boolean') fail('보조 설정 누락');
  if (!Number.isInteger(replay.end_tick) || replay.end_tick < 1 || replay.end_tick > 36000) fail('기록 길이 초과');
  if (!Array.isArray(replay.inputs) || !replay.inputs.length || replay.inputs.length > replay.end_tick) fail('입력 목록');
  let last = -1;
  for (const packet of replay.inputs) {
    if (!Number.isInteger(packet.tick) || packet.tick <= last || packet.tick >= replay.end_tick || last === -1 && packet.tick !== 0) fail('입력 순서');
    const i = packet.input;
    if (!i || !Number.isFinite(i.steer) || Math.abs(i.steer) > 1 || ['throttle','brake','jump'].some(k => typeof i[k] !== 'boolean') || ![null,'safe','fast'].includes(i.route)) fail('입력 값');
    last = packet.tick;
  }
  if (!replay.result || !['won','lost'].includes(replay.result.result) || replay.result.tick !== replay.end_tick) fail('완료되지 않은 기록');
  return replay;
}
export function replayRun(replay, config) {
  validateReplay(replay, config);
  const sim = new Simulation(config, { seed: replay.seed, ...replay.options }); sim.start();
  let index = 0, input = {};
  while (sim.state.tick < replay.end_tick && sim.state.phase === 'running') {
    if (replay.inputs[index]?.tick === sim.state.tick) input = replay.inputs[index++].input;
    sim.step(input);
  }
  if (JSON.stringify(sim.summary()) !== JSON.stringify(replay.result)) throw new Error('리플레이 결과가 일치하지 않습니다. 기록이 손상되었거나 규칙이 변경되었습니다.');
  return sim;
}
