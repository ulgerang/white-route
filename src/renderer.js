import { clamp, objectX } from './simulation.js';

// Small, self-contained WebGL renderer. No CDN, engine runtime, or downloaded art.
const C = {
  sky: [0.72,0.87,0.92], snow: [0.91,0.97,0.96], ice: [0.43,0.77,0.82], edge: [0.3,0.62,0.72],
  sea: [0.20,0.52,0.65], dark: [0.065,0.18,0.24], white: [0.98,0.98,0.90],
  amber: [1,0.67,0.23], coral: [0.88,0.32,0.23], teal: [0.11,0.48,0.48], hole: [0.035,0.19,0.27]
};
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function lookAt(eye, target) {
  const norm = a => { const l = Math.hypot(...a); return a.map(v => v/l); };
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const z = norm(eye.map((v,i) => v-target[i])), x = norm(cross([0,1,0],z)), y = cross(z,x);
  const dot = a => a.reduce((v,n,i) => v+n*eye[i],0);
  return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x),-dot(y),-dot(z),1];
}
function multiply(a,b) {
  const out = new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r] += a[k*4+r]*b[c*4+k];
  return out;
}
class Geometry {
  constructor() { this.data = new Float32Array(600000); this.count=0; this.group=null; this.layers=[]; this.layer=0; }
  reset() { this.count=0; this.group=null; this.layers=[]; this.layer=0; }
  vertex(p, color, light=1) {
    let [x,y,z]=p;
    if(this.group) {
      const g=this.group, tx=x*Math.cos(g.lean)-y*Math.sin(g.lean), ty=x*Math.sin(g.lean)+y*Math.cos(g.lean);
      x=g.x+tx*Math.cos(g.rotation)+z*Math.sin(g.rotation); y=g.y+ty;
      z=g.z-tx*Math.sin(g.rotation)+z*Math.cos(g.rotation);
    }
    if(this.count+6>this.data.length) { const bigger=new Float32Array(this.data.length*2); bigger.set(this.data); this.data=bigger; }
    this.data[this.count++]=x; this.data[this.count++]=y; this.data[this.count++]=z;
    for(let i=0;i<3;i++) this.data[this.count++]=color[i]*light;
  }
  triangle(a,b,c,color,light=1) { this.vertex(a,color,light); this.vertex(b,color,light); this.vertex(c,color,light); this.layers.push(this.layer); }
  box(x,y,z,w,h,d,color,rotation=0) {
    const corners=[];
    for(const [a,b,c] of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]) {
      const xx=a*w/2,zz=c*d/2;
      corners.push([x+xx*Math.cos(rotation)+zz*Math.sin(rotation),y+b*h/2,z-xx*Math.sin(rotation)+zz*Math.cos(rotation)]);
    }
    for(const [a,b,c,d,l] of [[0,1,2,3,.83],[5,4,7,6,.94],[4,0,3,7,.76],[1,5,6,2,.88],[3,2,6,7,1],[4,5,1,0,.65]]) {
      this.triangle(corners[a],corners[b],corners[c],color,l); this.triangle(corners[a],corners[c],corners[d],color,l);
    }
  }
  ellipsoid(x,y,z,rx,ry,rz,color,segments=10,rings=5) {
    const point=(i,j)=>{
      const p=Math.PI*i/rings, t=Math.PI*2*j/segments;
      return [x+Math.sin(p)*Math.cos(t)*rx,y+Math.cos(p)*ry,z+Math.sin(p)*Math.sin(t)*rz];
    };
    for(let i=0;i<rings;i++) for(let j=0;j<segments;j++) {
      const light=.78+.22*Math.cos((i+.5)/rings*Math.PI/2);
      const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d=point(i,j+1);
      this.triangle(a,b,c,color,light); this.triangle(a,c,d,color,light);
    }
  }
  pyramid(x,y,z,w,h,d,color) {
    const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],d0=[x-w/2,y,z+d/2],top=[x-w*.12,y+h,z];
    for(const [p,q,l] of [[a,b,.8],[b,c,.91],[c,d0,1],[d0,a,.74]]) this.triangle(p,q,top,color,l);
  }
  disc(x,y,z,rx,rz,color) {
    for(let i=0;i<14;i++) this.triangle([x,y,z],[x+Math.cos(i*Math.PI/7)*rx,y,z+Math.sin(i*Math.PI/7)*rz],[x+Math.cos((i+1)*Math.PI/7)*rx,y,z+Math.sin((i+1)*Math.PI/7)*rz],color);
  }
}
function shader(gl,type,source) {
  const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) { const error=gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error); }
  return s;
}
export class Renderer {
  constructor(canvas, config) {
    this.canvas=canvas; this.config=config; this.geometry=new Geometry();
    const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});
    this.gl=gl; this.backend=gl?'webgl':'software'; this.lastVertexCount=0;
    if(!gl) {
      this.context2d=canvas.getContext('2d',{alpha:false});
      if(!this.context2d)throw new Error('그래픽 화면을 만들 수 없습니다. 다른 브라우저에서 실행해 주세요.');
      return;
    }
    const vs=shader(gl,gl.VERTEX_SHADER,`attribute vec3 a_position; attribute vec3 a_color; uniform mat4 u_matrix;
      varying vec3 v_color; varying float v_distance;
      void main(){gl_Position=u_matrix*vec4(a_position,1.0);v_color=a_color;v_distance=max(0.0,-a_position.z);}`);
    const fs=shader(gl,gl.FRAGMENT_SHADER,`precision mediump float; varying vec3 v_color; varying float v_distance;
      uniform vec3 u_fog; uniform float u_fogStart;
      void main(){float f=smoothstep(u_fogStart,260.0,v_distance);gl_FragColor=vec4(mix(v_color,u_fog,f),1.0);}`);
    this.program=gl.createProgram(); gl.attachShader(this.program,vs); gl.attachShader(this.program,fs); gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.buffer=gl.createBuffer();
    this.position=gl.getAttribLocation(this.program,'a_position'); this.color=gl.getAttribLocation(this.program,'a_color');
    this.matrix=gl.getUniformLocation(this.program,'u_matrix'); this.fog=gl.getUniformLocation(this.program,'u_fog'); this.fogStart=gl.getUniformLocation(this.program,'u_fogStart');
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    this.lastVertexCount=0;
  }
  center(z,route) {
    return Math.sin(z/310)*3 + Math.sin(z/680)*5 + (route==='fast'?4:-3)*Math.sin(clamp((z-1120)/1100,0,1)*Math.PI);
  }
  penguin(x,y,z,time,{hero=false,lean=0,phase='ground',recover=false,reduced=false}={}) {
    const b=this.geometry;
    const squash=phase==='anticipation'||phase==='landing'?.82:1;
    b.disc(x,.035,z,.66+Math.min(y,.8)*.2,.45,C.edge);
    b.group={x,y,z,rotation:hero?Math.PI-.25:0,lean:recover?.16:lean};
    const stride=reduced?0:Math.sin(time*13)*.12;
    b.ellipsoid(0,1.04*squash,0,.65,.83*squash,.53,C.dark);
    b.ellipsoid(0,1.04*squash,-.37,.5,.65*squash,.2,C.white);
    b.ellipsoid(0,1.91*squash,-.025,.51,.51,.47,C.dark);
    b.ellipsoid(-.20,1.91*squash,-.37,.24,.29,.16,C.white);
    b.ellipsoid(.20,1.91*squash,-.37,.24,.29,.16,C.white);
    for(const side of [-1,1]) {
      b.ellipsoid(side*.20,2.0*squash,-.502,.055,.072,.035,C.dark,6,3);
      b.ellipsoid(side*.70,1.07*squash,.02,.14,.52,.21,C.dark,6,4);
      b.box(side*.32,.13,-.19+side*stride,.42,.15,.65,C.amber);
    }
    b.ellipsoid(0,1.78*squash,-.57,.20,.095,.20,C.amber,6,3);
    b.box(0,1.49*squash,.0,1.04,.19,.9,C.coral);
    b.box(.25,1.26*squash,.6,.25,.50,.12,C.coral,Math.sin(time*5)*.14);
    b.box(0,.99*squash,.55,.73,.82,.37,C.amber);
    b.box(0,1.11*squash,.75,.51,.15,.04,C.white);
    b.box(0,1.12*squash,.78,.10,.37,.04,C.white);
    b.group=null;
  }
  object(o,sim,time,settings) {
    const b=this.geometry,s=sim.state,rel=o.z-s.distance;
    const x=objectX(o,s.elapsed)+this.center(o.z,s.route)-this.center(s.distance,s.route),z=-rel;
    if(o.type==='hole'||o.type==='crevasse') {
      b.box(x,.022,z,o.width,.025,o.depth,settings.contrast?[.015,.04,.07]:C.hole);
      for(const side of [-1,1]) {
        b.box(x+side*(o.width/2+.09),.10,z,.18,.20,o.depth+.25,C.ice);
        b.box(x,.08,z+side*(o.depth/2+.08),o.width+.35,.16,.16,C.white);
      }
      if(o.type==='crevasse') for(let j=0;j<3;j++) b.pyramid(x+o.width/2+.12,.03,z-o.depth/2+j*2,.44,.45,1.5,C.ice);
    } else if(o.type==='seal') {
      b.disc(x,.03,z,1.05,.8,C.edge);
      b.ellipsoid(x,.46,z,.99,.40,.59,[.42,.51,.58]);
      b.ellipsoid(x+.63,.83,z-.17,.43,.40,.37,[.54,.63,.67]);
      b.ellipsoid(x+.70,.81,z+.14,.26,.18,.15,C.white,8,4);
      b.ellipsoid(x+.72,.85,z+.26,.09,.07,.05,C.dark,6,3);
      for(const dx of [.48,.84]) b.ellipsoid(x+dx,.98,z+.12,.048,.048,.05,C.dark,6,3);
      b.box(x-.81,.13,z+.42,.56,.15,.34,[.31,.42,.49],-.3);
    } else if(o.type==='fish') {
      const yy=.93+(settings.reduced?0:Math.sin(time*3+o.phase)*.10);
      b.ellipsoid(x,yy,z,.46,.21,.13,C.amber,6,3);
      b.triangle([x-.30,yy,z],[x-.64,yy+.23,z],[x-.64,yy-.23,z],C.amber);
      b.ellipsoid(x+.24,yy+.045,z+.12,.037,.045,.035,C.dark,6,3);
    } else {
      b.box(x,.65,z,.78,.88,.7,C.amber);
      b.box(x,.67,z+.36,.57,.15,.02,C.white); b.box(x,.67,z+.37,.15,.57,.02,C.white);
      b.box(x,1.16,z,.36,.16,.12,C.dark);
    }
    if(o.class==='HAZARD') {
      // A physical sign and a dark silhouette remain legible without color.
      const xx=x-o.width/2-.36;
      b.box(xx,.40,z+o.depth/2,.055,.8,.055,C.dark);
      b.triangle([xx-.34,.77,z+o.depth/2],[xx+.34,.77,z+o.depth/2],[xx,1.37,z+o.depth/2],C.amber);
      b.box(xx,1.03,z+o.depth/2+.01,.065,.23,.025,C.dark);
    }
  }
  render(sim, time, settings) {
    const gl=this.gl,b=this.geometry,s=sim.state,c=this.config.course;
    const dpr=Math.min(window.devicePixelRatio||1,this.gl?1.75:1),w=Math.max(1,Math.round(this.canvas.clientWidth*dpr)),h=Math.max(1,Math.round(this.canvas.clientHeight*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    b.reset();
    const hero=s.phase==='ready', traveled=s.distance;
    const cx=this.center(traveled,s.route),at=z=>this.center(z,s.route)-cx;
    b.layer=-1; b.box(0,-2,-100,1200,.8,1600,C.sea); b.layer=0;
    for(let i=-5;i<9;i++) {
      const zz=traveled+160+i*19;
      b.pyramid((i%2?-1:1)*(34+Math.abs(i)*12)+at(zz),-1,-(zz-traveled),28+Math.abs(i)*7,18+Math.abs(i%4)*12,35,[.65,.83,.86]);
      b.pyramid((i%2?-1:1)*(34+Math.abs(i)*12)+at(zz),10,-(zz-traveled),14,13,19,C.snow);
    }
    // Continuous ribbons, not lane-locked geometry. Adjacent slabs meet exactly.
    b.layer=1; const start=Math.floor((traveled-24)/8)*8;
    for(let world=start;world<traveled+256;world+=8) {
      const a=at(world),d=at(world+8),z0=-(world-traveled),z1=z0-8,W=c.halfWidth;
      b.triangle([a-W,0,z0],[a+W,0,z0],[d+W,0,z1],C.snow);
      b.triangle([a-W,0,z0],[d+W,0,z1],[d-W,0,z1],C.snow);
      for(const sign of [-1,1]) {
        const x0=a+sign*W,x1=d+sign*W;
        b.triangle([x0,0,z0],[x1,0,z1],[x1+sign*.8,-1.8,z1],C.ice,.90);
        b.triangle([x0,0,z0],[x1+sign*.8,-1.8,z1],[x0+sign*.8,-1.8,z0],C.ice,.90);
        b.box((x0+x1)/2,.017,(z0+z1)/2,.13,.025,8.04,C.edge);
      }
    }
    b.layer=2; const markerStart=Math.floor((traveled-10)/26)*26;
    for(let world=markerStart;world<traveled+185;world+=26) {
      const rel=world-traveled;
      for(const side of [-1,1]) {
        const x=at(world)+side*(c.halfWidth+.18);
        b.box(x,.83,-rel,.07,1.66,.07,C.dark);
        b.box(x+side*.28,1.48,-rel,.58,.30,.05,side<0?C.teal:C.amber);
      }
      const side=Math.sin(world*13)>0?1:-1,x=at(world)+side*(16+Math.abs(Math.sin(world*7))*19);
      b.pyramid(x,-1.7,-rel,7,2+Math.abs(Math.sin(world))*5,8,C.ice);
      b.pyramid(x,-.3,-rel,5,2.8,5,C.snow);
    }
    for(const o of sim.objects) if(sim.active(o)&&o.z-traveled<185&&o.z-traveled>-12&&(!sim.resolved.has(o.id)||o.class==='HAZARD')) this.object(o,sim,time,settings);
    const gate=c.fork.chooseAt-traveled;
    if(gate>-15&&gate<180&&!s.route) {
      b.box(at(c.fork.chooseAt),2.9,-gate,11,.65,.24,C.teal);
      for(const side of [-1,1]) b.box(at(c.fork.chooseAt)+side*5,1.5,-gate,.15,3,.15,C.teal);
      b.box(at(c.fork.chooseAt)+2.7,2.9,-gate+.15,4.2,.36,.05,C.amber);
    }
    const finish=s.length-traveled;
    if(finish<225) {
      const xx=at(s.length),zz=-finish;
      b.box(xx,3.0,zz,11,1,.5,C.teal);
      for(const side of [-1,1]) b.box(xx+side*5,1.5,zz,.25,3,.25,C.teal);
      for(let i=0;i<10;i++) b.box(xx-4.5+i,3.02,zz+.26,.72,.65,.03,i%2?C.white:C.amber);
      b.box(xx+11,1.5,zz-6,7,3,5,C.coral); b.box(xx+11,3.15,zz-6,8,.3,6,C.white);
      for(const side of [-1,1]) b.box(xx+11+side*1.8,1.8,zz-3.45,1.1,.9,.07,C.amber);
      b.box(xx+11,.8,zz-3.4,1,1.6,.08,C.dark);
    }
    if(settings.snow&&!settings.reduced&&s.weather==='wind') for(let i=0;i<30;i++) {
      const z=-((i*9+time*12)%90),x=Math.sin(i*52)*12+Math.sin(time)*1.4;
      b.box(x,1+(i*3.7)%6,z,.05,.04,.18,C.white);
    }
    const heroX=hero?(this.canvas.clientWidth>740?2.1:0):s.x;
    b.layer=3; this.penguin(heroX,s.y,hero?(this.canvas.clientWidth>740?-1:-7):0,time,{hero,lean:settings.reduced?0:-s.vx*.025,phase:s.jumpPhase,recover:s.recovery>0,reduced:settings.reduced});
    if(s.invulnerability>0) b.disc(s.x,.023,0,.98,.75,[.84,.65,.28]);
    const aspect=w/h;
    const eye=aspect<.8?[0,7.5,15]:[0,6.3,11.5];
    const matrix=multiply(perspective(Math.PI/3,aspect,.1,900),lookAt(eye,[0,1,-16]));
    this.lastVertexCount=b.count/6;
    if(!gl){this.drawSoftware(matrix,w,h,s.weather);return;}
    gl.viewport(0,0,w,h); gl.clearColor(...C.sky,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,b.data.subarray(0,b.count),gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.position); gl.vertexAttribPointer(this.position,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(this.color); gl.vertexAttribPointer(this.color,3,gl.FLOAT,false,24,12);
    gl.uniformMatrix4fv(this.matrix,false,matrix); gl.uniform3fv(this.fog,C.sky); gl.uniform1f(this.fogStart,s.weather==='wind'?115:160);
    gl.drawArrays(gl.TRIANGLES,0,b.count/6);
  }
  /** Same 3D geometry and perspective; painter fallback for unavailable GPU contexts.
   *  Semantic layers avoid long ground triangles painting over actors. This is not
   *  a replacement for GPU depth testing or a claim of mobile performance parity.
   */
  drawSoftware(m,w,h,weather){
    const ctx=this.context2d,b=this.geometry,triangles=[];
    ctx.fillStyle=`rgb(${C.sky.map(c=>Math.round(c*255)).join(',')})`;ctx.fillRect(0,0,w,h);
    for(let i=0;i<b.count;i+=18){
      let points=[],depth=0,worldZ=0;
      for(let j=0;j<3;j++){
        const k=i+j*6,x=b.data[k],y=b.data[k+1],z=b.data[k+2];
        const p=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[3]*x+m[7]*y+m[11]*z+m[15]];
        points.push(p);depth+=p[2];worldZ-=z;
      }
      // Clip in homogeneous coordinates, before perspective division.
      const clipped=[];
      for(let j=0;j<points.length;j++){
        const a=points[j],n=points[(j+1)%points.length],ain=a[2]>=.1,nin=n[2]>=.1;
        if(ain)clipped.push(a);
        if(ain!==nin){const t=(.1-a[2])/(n[2]-a[2]);clipped.push(a.map((v,k)=>v+(n[k]-v)*t));}
      }
      if(clipped.length<3)continue;
      points=clipped.map(p=>[(p[0]/p[2]+1)*w/2,(1-p[1]/p[2])*h/2]);
      if(points.every(p=>p[0]<0)||points.every(p=>p[0]>w)||points.every(p=>p[1]<0)||points.every(p=>p[1]>h))continue;
      const fogStart=weather==='wind'?115:160,t=clamp((worldZ/3-fogStart)/(260-fogStart),0,1),fog=t*t*(3-2*t);
      const color=[0,1,2].map(k=>Math.round(clamp(b.data[i+3+k]*(1-fog)+C.sky[k]*fog,0,1)*255));
      triangles.push({points,depth,layer:b.layers[i/18],color:`rgb(${color.join(',')})`});
    }
    triangles.sort((a,b)=>a.layer-b.layer||b.depth-a.depth);
    for(const t of triangles){
      ctx.beginPath();ctx.moveTo(...t.points[0]);for(let j=1;j<t.points.length;j++)ctx.lineTo(...t.points[j]);ctx.closePath();
      ctx.fillStyle=t.color;ctx.strokeStyle=t.color;ctx.lineWidth=.45;ctx.fill();ctx.stroke();
    }
  }
  dispose() { if(this.gl){this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program);} }
}
