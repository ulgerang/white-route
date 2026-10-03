/** Keyboard + multi-touch input. Edges are consumed by a simulation tick, not a render frame. */
export class Input {
  constructor({ onPause, onStart }) {
    this.keys=new Set(); this.pointers=new Map(); this.jumpQueued=false; this.routeQueued=null;
    this.onPause=onPause;
    const handled=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','Digit1','Digit2'];
    window.addEventListener('keydown',e=>{
      if(e.target instanceof HTMLElement && (e.target.matches('input,select,textarea,button') || e.target.closest('dialog[open]'))) return;
      if(e.code==='Escape'&&!e.repeat){onPause();return;}
      if(e.code==='Enter'&&!e.repeat){onStart();return;}
      if(!handled.includes(e.code)) return;
      e.preventDefault(); this.keys.add(e.code);
      if(!e.repeat&&e.code==='Space') this.jumpQueued=true;
      if(!e.repeat&&e.code==='Digit1') this.routeQueued='safe';
      if(!e.repeat&&e.code==='Digit2') this.routeQueued='fast';
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
    for(const element of document.querySelectorAll('[data-control]')) {
      element.addEventListener('pointerdown',e=>{
        if(e.button!==0) return;
        e.preventDefault(); element.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId,element.dataset.control); element.classList.add('pressed');
        if(element.dataset.control==='jump') this.jumpQueued=true;
      });
      const release=e=>{this.pointers.delete(e.pointerId);if(![...this.pointers.values()].includes(element.dataset.control))element.classList.remove('pressed');};
      element.addEventListener('pointerup',release); element.addEventListener('pointercancel',release); element.addEventListener('lostpointercapture',release);
    }
  }
  poll() {
    const has=(code,alt,control)=>this.keys.has(code)||this.keys.has(alt)||[...this.pointers.values()].includes(control);
    const input={steer:Number(has('ArrowRight','KeyD','right'))-Number(has('ArrowLeft','KeyA','left')),
      throttle:has('ArrowUp','KeyW','throttle'),brake:has('ArrowDown','KeyS','brake'),jump:this.jumpQueued,route:this.routeQueued};
    this.jumpQueued=false; this.routeQueued=null; return input;
  }
  clear() {
    this.keys.clear();this.pointers.clear();this.jumpQueued=false;this.routeQueued=null;
    for(const el of document.querySelectorAll('.pressed'))el.classList.remove('pressed');
  }
}
