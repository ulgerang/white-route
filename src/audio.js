export class Audio {
  constructor(){this.context=null;this.muted=false;}
  unlock(){
    if(this.muted)return;
    try {
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context)return;
      this.context ||= new Context();
      if(this.context.state==='suspended')this.context.resume().catch(()=>{});
    } catch { /* Audio is optional; lack of a device must never stop play. */ }
  }
  play(event){
    if(this.muted||!this.context||this.context.state!=='running')return;
    const tones={pickup_collected:[720,1040,.10],jump_started:[260,520,.12],jump_landed:[160,110,.06],
      collision:[110,55,.23],near_miss:[470,580,.08],route_selected:[420,640,.16],segment_end:[520,780,.36],time_warning:[340,280,.22]};
    const tone=tones[event];if(!tone)return;
    const ctx=this.context,t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=event==='collision'?'triangle':'sine';osc.frequency.setValueAtTime(tone[0],t);osc.frequency.exponentialRampToValueAtTime(tone[1],t+tone[2]);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.045,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+tone[2]+.04);
    osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+tone[2]+.05);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
}
