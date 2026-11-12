import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.querySelector('#game-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#071a1c');
scene.fog = new THREE.FogExp2('#071a1c', 0.018);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 20.5, 15.3);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

scene.add(new THREE.HemisphereLight(0x9bead4, 0x082326, 2.15));
const keyLight = new THREE.DirectionalLight(0xc9ffe6, 3.1);
keyLight.position.set(-5, 12, 4); keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024); keyLight.shadow.camera.left = -13; keyLight.shadow.camera.right = 13; keyLight.shadow.camera.top = 9; keyLight.shadow.camera.bottom = -9;
scene.add(keyLight);
const glowLight = new THREE.PointLight(0x27e9bb, 27, 15); glowLight.position.set(0, 3, 0); scene.add(glowLight);

const TABLE_X = 9, TABLE_Z = 5, BALL_R = 0.37;
const ballGroup = new THREE.Group(); scene.add(ballGroup);
const balls = [];
const pockets = [[-8.55,-4.55],[0,-4.55],[8.55,-4.55],[-8.55,4.55],[0,4.55],[8.55,4.55]];
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const aimPlane = new THREE.Plane(new THREE.Vector3(0,1,0), -0.035);
let aimDirection = new THREE.Vector3(1,0,0), dragStart = null, dragging = false, power = 0;
let pulseTime = 0, pulseCooldown = 0, gameStarted = false, shots = 0, sunk = 0, stability = 100;
let toastTimer = 0, lastTime = 0;
let soundOn = false;
let audioContext = null;

function box(w,h,d,color,rough=0.55,metal=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal}));m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
function cylinder(r1,r2,h,color,segments=32){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),new THREE.MeshStandardMaterial({color,roughness:.5,metalness:.25}));m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
function makeTable(){
  const base=box(19.2,.7,11.2,0x102e30,.42,.3);base.position.set(0,-.52,0);
  const felt=new THREE.Mesh(new THREE.BoxGeometry(18.2,.16,10.2),new THREE.MeshStandardMaterial({color:0x12514b,roughness:.8,metalness:.03}));felt.position.y=-.09;felt.receiveShadow=true;scene.add(felt);
  // Subtle luminous lane inlays on the new reef level.
  // Split cushions leave six clean openings: four corners and two side reefs.
  for(const z of [-4.84,4.84]) for(const x of [-4.85,4.85]){const rail=box(7.5,.34,.34,0x174d48,.35,.4);rail.position.set(x,.15,z);}
  for(const x of [-8.84,8.84]){const rail=box(.34,.34,6.8,0x174d48,.35,.4);rail.position.set(x,.15,0);}
  // Inlaid glowing edge lines.
  const lineMat=new THREE.MeshBasicMaterial({color:0x51c4a0,transparent:true,opacity:.35});
  for(const z of [-4.61,4.61]){const line=new THREE.Mesh(new THREE.BoxGeometry(17.2,.025,.025),lineMat);line.position.set(0,.253,z);scene.add(line);}
  for(const x of [-8.61,8.61]){const line=new THREE.Mesh(new THREE.BoxGeometry(.025,.025,8.8),lineMat);line.position.set(x,.253,0);scene.add(line);}
  // Dark circular pocket wells and luminous rims.
  pockets.forEach(([x,z])=>{
    const well=cylinder(.82,.92,.17,0x031214,48);well.position.set(x,-.035,z);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.78,.045,8,40),new THREE.MeshStandardMaterial({color:0x62dcb2,emissive:0x1b826b,emissiveIntensity:.75,metalness:.55,roughness:.28}));ring.rotation.x=Math.PI/2;ring.position.set(x,.04,z);scene.add(ring);
    const center=new THREE.Mesh(new THREE.CircleGeometry(.65,32),new THREE.MeshBasicMaterial({color:0x041718}));center.rotation.x=-Math.PI/2;center.position.set(x,.055,z);scene.add(center);
  });
  // Floating plank and sea-glass decoration outside the playing field.
  for(let i=0;i<18;i++){
    const a=i/18*Math.PI*2, r=10.4+(i%3)*.35;
    const peb=new THREE.Mesh(new THREE.DodecahedronGeometry(.12+(i%4)*.045,0),new THREE.MeshStandardMaterial({color:i%2?0x28645a:0x1a4142,roughness:.45,metalness:.2}));
    peb.position.set(Math.cos(a)*r,-.2,Math.sin(a)*r*.58);peb.rotation.set(a,.4,a*.3);peb.castShadow=true;scene.add(peb);
  }
  // Distant decorative floor.
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x061719,roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=-.94;floor.receiveShadow=true;scene.add(floor);
}
makeTable();

function makeBall({x,z,color,core=false,id=0}){
  const material=new THREE.MeshStandardMaterial({color,roughness:core?.22:.18,metalness:core?.2:.12,emissive:color,emissiveIntensity:core?.13:.22});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(BALL_R,32,24),material);mesh.position.set(x,BALL_R+.08,z);mesh.castShadow=true;mesh.receiveShadow=true;ballGroup.add(mesh);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(BALL_R*1.14,24,16),new THREE.MeshBasicMaterial({color,transparent:true,opacity:core?.075:.1,side:THREE.BackSide,depthWrite:false}));glow.position.copy(mesh.position);ballGroup.add(glow);
  const ball={mesh,glow,x,z,vx:0,vz:0,core,id,color,active:true,spin:0};balls.push(ball);return ball;
}
const cue=makeBall({x:-5.15,z:0,color:0xe9f3dc,core:true});
const pearlLayout=[[-1.2,0,0xff796b],[-.15,-.82,0xf5c567],[.85,-.06,0x77d6ff],[1.55,.88,0xd18cff],[2.65,-.75,0x78edb4],[3.25,.25,0xff91bd]];
pearlLayout.forEach(([x,z,color],i)=>makeBall({x,z,color,id:i+1}));

// Decorative luminous kelp columns outside the rails.
for(let i=0;i<14;i++){
  const side=i%2?1:-1, z=-4.5+Math.floor(i/2)*1.3, x=side*(10.15+(i%3)*.18);
  const stalk=new THREE.Mesh(new THREE.CylinderGeometry(.025,.07,.45+(i%3)*.18,7),new THREE.MeshStandardMaterial({color:0x30786b,emissive:0x0d453d,emissiveIntensity:.4}));stalk.position.set(x,.1,z);stalk.rotation.z=(i%2?.2:-.2);scene.add(stalk);
  const tip=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),new THREE.MeshBasicMaterial({color:i%3===0?0x7cf2c3:0x32aa90}));tip.position.set(x,.35+(i%3)*.12,z);scene.add(tip);
}

const aimMat=new THREE.LineDashedMaterial({color:0xc2ffe1,transparent:true,opacity:.7,dashSize:.14,gapSize:.1});
const aimGeom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,0,0)]);
const aimLine=new THREE.Line(aimGeom,aimMat);aimLine.computeLineDistances();scene.add(aimLine);
const pulseRing=new THREE.Mesh(new THREE.TorusGeometry(1,.035,8,72),new THREE.MeshBasicMaterial({color:0x7fffd0,transparent:true,opacity:0,depthWrite:false}));pulseRing.rotation.x=Math.PI/2;pulseRing.position.y=.12;scene.add(pulseRing);
const particles=[];

function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<.8?64:42;camera.position.y=w/h<.8?27:20.5;camera.position.z=w/h<.8?17.8:15.3;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();
function screenToWorld(event){const r=canvas.getBoundingClientRect();pointerNdc.x=(event.clientX-r.left)/r.width*2-1;pointerNdc.y=-((event.clientY-r.top)/r.height*2-1);raycaster.setFromCamera(pointerNdc,camera);const p=new THREE.Vector3();raycaster.ray.intersectPlane(aimPlane,p);return p;}
function ballsMoving(){return balls.some(b=>b.active&&Math.hypot(b.vx,b.vz)>.08);}
function setAim(world){const dx=world.x-cue.x,dz=world.z-cue.z;if(Math.hypot(dx,dz)>.15)aimDirection.set(dx,0,dz).normalize();}
canvas.addEventListener('pointermove',e=>{const p=screenToWorld(e);if(dragging){const dx=p.x-dragStart.x,dz=p.z-dragStart.z;const len=Math.hypot(dx,dz);if(len>.08){aimDirection.set(-dx,0,-dz).normalize();power=THREE.MathUtils.clamp(len/3.5,0,1);updatePower();}}else if(!ballsMoving()&&gameStarted){setAim(p);drawAim();}});
canvas.addEventListener('pointerdown',e=>{if(!gameStarted||ballsMoving())return;canvas.setPointerCapture(e.pointerId);dragging=true;dragStart=screenToWorld(e);power=0;});
canvas.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;const p=screenToWorld(e);const dx=p.x-dragStart.x,dz=p.z-dragStart.z;const len=Math.hypot(dx,dz);if(len>.16){aimDirection.set(-dx,0,-dz).normalize();power=THREE.MathUtils.clamp(len/3.5,0,1);shoot(power);}else if(power<.03){shoot(.42);}power=0;updatePower();});
canvas.addEventListener('pointercancel',()=>{dragging=false;power=0;updatePower();});

function shoot(amount){if(!gameStarted||ballsMoving()||!cue.active)return;const strength=4+amount*10.4;cue.vx=aimDirection.x*strength;cue.vz=aimDirection.z*strength;shots++;document.querySelector('#shot-count').textContent=`${shots} SHOT${shots===1?'':'S'}`;playTone(210,.07,'triangle');}
function updatePower(){document.querySelector('#power-fill').style.width=`${Math.round(power*100)}%`;document.querySelector('#power-label').textContent=power>.05?`${Math.round(power*100)}%`:pulseCooldown>0?`${pulseCooldown.toFixed(1)}s`:'READY';}
function updateHud(){document.querySelector('#score-count').textContent=sunk;document.querySelector('#progress-fill').style.width=`${sunk/6*100}%`;document.querySelector('#stability').textContent=`${Math.round(stability)}%`;document.querySelector('#stability-fill').style.width=`${stability}%`;}
function showToast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1700);}
function pulse(){if(!gameStarted||pulseCooldown>0)return;pulseTime=1.1;pulseCooldown=5.5;pulseRing.scale.setScalar(.2);pulseRing.material.opacity=.85;playTone(380,.2,'sine');showToast('TIDAL PULSE · CURRENT BENDING');}
window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();pulse();}if(e.code==='ArrowLeft'||e.code==='KeyA')aimDirection.applyAxisAngle(new THREE.Vector3(0,1,0),.08);if(e.code==='ArrowRight'||e.code==='KeyD')aimDirection.applyAxisAngle(new THREE.Vector3(0,1,0),-.08);if(e.code==='Enter'&&document.querySelector('#intro-modal').classList.contains('hidden'))shoot(.48);});
document.querySelector('#play-btn').addEventListener('click',()=>{gameStarted=true;document.querySelector('#intro-modal').classList.add('hidden');});
document.querySelector('#again-btn').addEventListener('click',()=>location.reload());
document.querySelector('#sound-btn').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.style.color=soundOn?'#83e5bf':'';if(soundOn)playTone(440,.08,'sine');});
function playTone(freq,duration,type){if(!soundOn)return;try{audioContext??=new AudioContext();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(.035,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch{}}

function pocketBall(ball){ball.active=false;ball.mesh.visible=false;ball.glow.visible=false;ball.vx=ball.vz=0;if(ball.core){stability=Math.max(0,stability-22);updateHud();showToast('CORE RECOILED · -22% STABILITY');playTone(120,.18,'sawtooth');setTimeout(()=>{if(!cue.active){cue.active=true;cue.mesh.visible=cue.glow.visible=true;cue.x=-5.15;cue.z=0;cue.mesh.position.set(cue.x,BALL_R+.08,cue.z);cue.glow.position.copy(cue.mesh.position);cue.vx=cue.vz=0;}},800);if(stability<=0){stability=45;showToast('CORE RESTORED · STABILITY LOW');}}
  else{sunk++;updateHud();playTone(520+Math.random()*180,.12,'sine');createBurst(ball.x,ball.z,ball.color);if(sunk>=6){setTimeout(()=>{document.querySelector('#win-copy').textContent=`All six pearls rescued in ${shots} shots. The reef is glowing again.`;document.querySelector('#win-modal').classList.remove('hidden');},950);}}
}
function createBurst(x,z,color){for(let i=0;i<14;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color,transparent:true}));m.position.set(x,.3,z);scene.add(m);particles.push({mesh:m,vx:(Math.random()-.5)*4,vy:1+Math.random()*3,vz:(Math.random()-.5)*4,life:.65});}}
function resolveBalls(){for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){const a=balls[i],b=balls[j];if(!a.active||!b.active)continue;let dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz),min=BALL_R*2;if(dist>=min)continue;if(dist<.0001){dx=.01;dist=.01;}const nx=dx/dist,nz=dz/dist,overlap=min-dist;a.x-=nx*overlap*.5;a.z-=nz*overlap*.5;b.x+=nx*overlap*.5;b.z+=nz*overlap*.5;const rel=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;if(rel<0){const impulse=-(1.82)*rel/2;a.vx-=impulse*nx;a.vz-=impulse*nz;b.vx+=impulse*nx;b.vz+=impulse*nz;if(a.core||b.core)playTone(160+Math.random()*70,.04,'triangle');}}}
function updatePhysics(dt){
  const step=Math.min(dt,.035);
  if(pulseCooldown>0)pulseCooldown=Math.max(0,pulseCooldown-step);
  if(pulseTime>0){pulseTime=Math.max(0,pulseTime-step);const pct=1-pulseTime/1.1;pulseRing.scale.setScalar(.3+pct*7);pulseRing.material.opacity=Math.max(0,pulseTime/1.1*.72);}
  for(const b of balls){if(!b.active)continue;
    if(pulseTime>0&&!b.core){const dx=cue.x-b.x,dz=cue.z-b.z,d=Math.hypot(dx,dz);if(d<7&&d>.01){const f=(1-d/7)*4.6;b.vx+=dx/d*f*step;b.vz+=dz/d*f*step;}}
    b.x+=b.vx*step;b.z+=b.vz*step;
    const friction=Math.pow(b.core?.988:.991,step*60);b.vx*=friction;b.vz*=friction;if(Math.hypot(b.vx,b.vz)<.035)b.vx=b.vz=0;
    // Pocket capture precedes cushion collision.
    let pocketed=false;for(const [px,pz] of pockets){if(Math.hypot(b.x-px,b.z-pz)<.77){pocketBall(b);pocketed=true;break;}}if(pocketed)continue;
    // Cushion rails; gaps around each reef pocket remain open.
    if(b.x>TABLE_X-BALL_R){const gap=Math.abs(Math.abs(b.z)-4.55)<1.02;if(!gap){b.x=TABLE_X-BALL_R;b.vx=-Math.abs(b.vx)*.82;}}
    if(b.x<-TABLE_X+BALL_R){const gap=Math.abs(Math.abs(b.z)-4.55)<1.02;if(!gap){b.x=-TABLE_X+BALL_R;b.vx=Math.abs(b.vx)*.82;}}
    if(b.z>TABLE_Z-BALL_R){const gap=Math.abs(b.x)<1.12||Math.abs(b.x)>8.05;if(!gap){b.z=TABLE_Z-BALL_R;b.vz=-Math.abs(b.vz)*.82;}}
    if(b.z<-TABLE_Z+BALL_R){const gap=Math.abs(b.x)<1.12||Math.abs(b.x)>8.05;if(!gap){b.z=-TABLE_Z+BALL_R;b.vz=Math.abs(b.vz)*.82;}}
  }
  resolveBalls();
  for(const b of balls){if(!b.active)continue;b.mesh.position.set(b.x,BALL_R+.08,b.z);b.mesh.rotation.x+=b.vz*step*.8;b.mesh.rotation.z-=b.vx*step*.8;b.glow.position.copy(b.mesh.position);}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=step;p.mesh.position.x+=p.vx*step;p.mesh.position.y+=p.vy*step;p.mesh.position.z+=p.vz*step;p.vy-=5*step;p.mesh.material.opacity=Math.max(0,p.life);if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}}
  updatePower();
}
function drawAim(){if(ballsMoving()||dragging&&power>.05){aimLine.visible=false;return;}aimLine.visible=gameStarted&&cue.active;const from=new THREE.Vector3(cue.x,.13,cue.z),to=from.clone().addScaledVector(aimDirection,4.2);aimLine.geometry.setFromPoints([from,to]);aimLine.computeLineDistances();}
function animate(time){requestAnimationFrame(animate);const now=time/1000,dt=lastTime?Math.min(now-lastTime,.05):.016;lastTime=now;updatePhysics(dt);drawAim();glowLight.intensity=25+Math.sin(now*1.8)*4;renderer.render(scene,camera);}
requestAnimationFrame(animate);
