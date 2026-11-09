import * as THREE from 'three';

const BLOCK=64;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9d7067);
scene.fog=new THREE.FogExp2(0x9d7067,.0025);
const camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.1,900);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#game'),antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.18;
const clock=new THREE.Clock();
const hemi=new THREE.HemisphereLight(0xffd8bb,0x263344,2.1);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffc28a,3.4);sun.position.set(-100,145,95);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-115;sun.shadow.camera.right=115;sun.shadow.camera.top=115;sun.shadow.camera.bottom=-115;sun.shadow.bias=-.00015;scene.add(sun,sun.target);
const mat=(color,roughness=.82,metalness=0,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const mats={asphalt:mat(0x30383b),sidewalk:mat(0x777673),concrete:mat(0xb2a08e),glass:mat(0x3c5965,.28,.38),yellow:mat(0xf0bb63,.45),white:mat(0xf0e7d8,.45),dark:mat(0x171b20,.5),skin:mat(0xc68a67),shirt:mat(0x48616a),pants:mat(0x262b35)};
const ui={};
for(const [key,id] of Object.entries({district:'district',street:'street-name',missionTime:'mission-time',missionTitle:'mission-title',missionSubtitle:'mission-subtitle',missionProgress:'mission-progress',wantedPanel:'wanted-panel',wantedStars:'wanted-stars',wantedStatus:'wanted-status',toast:'dispatch-toast',toastMessage:'toast-message',eventToast:'event-toast',speedValue:'speed-value',gear:'gear-label',speedArc:'speed-progress',map:'minimap',loading:'loading-screen',objective:'objective',objectiveText:'objective-text',help:'help-card',sound:'sound-toggle',soundLabel:'sound-label',pause:'pause-screen'})) ui[key]=document.getElementById(id);
ui.wantedStars=[...ui.wantedStars.children];
let paused=false,wanted=0,escapeTimer=0,dispatchTimer=0,eventTimer=0,elapsed=0,trafficHitCooldown=0,lastHelpMode=null;
const traffic=[],walkers=[],policeCars=[],keys=new Set();
const player={car:null,onFoot:true,heading:Math.PI,speed:0,mesh:null,position:new THREE.Vector3(2,0,4)};
function playerPosition(){return player.car?player.car.position:player.position;}
function showToast(message,duration=4){ui.toastMessage.textContent=message;ui.toast.classList.add('show');dispatchTimer=duration;}
function showEvent(message){ui.eventToast.textContent=message;ui.eventToast.classList.add('show');eventTimer=2.8;}
function updateSiren(now){/* Audio-free visual sirens keep the scene playable without permission prompts. */}
function box(parent,geometry,material,x,y,z,cast=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(parent,r,h,material,x,y,z,segments=12){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function makeCar(color=0x9c4938,police=false){
  const root=new THREE.Group(),paint=mat(color,.32,.28),rubber=mat(0x17191b,.92),chrome=mat(0xb3b4ae,.25,.72),glass=mat(police?0x233d4d:0x263b47,.2,.4,{transparent:true,opacity:.88});
  box(root,new THREE.BoxGeometry(2.05,.62,4.35),paint,0,.7,0);
  box(root,new THREE.BoxGeometry(1.76,.7,2.12),glass,0,1.31,-.15);
  box(root,new THREE.BoxGeometry(1.83,.12,1.12),paint,0,1.72,-.05);
  box(root,new THREE.BoxGeometry(1.96,.14,1.1),paint,0,.98,1.47);
  box(root,new THREE.BoxGeometry(1.9,.13,.12),chrome,0,.49,-2.16);
  for(const x of [-.78,.78])for(const z of [-1.35,1.38]){
    const w=cylinder(root,.38,.22,rubber,x,.39,z,16);w.rotation.z=Math.PI/2;root.userData.wheels??=[];root.userData.wheels.push(w);
    cylinder(root,.2,.235,chrome,x,.39,z,12).rotation.z=Math.PI/2;
  }
  for(const x of [-.67,.67]){
    const lamp=box(root,new THREE.BoxGeometry(.4,.19,.08),mat(0xffe6a1,.25,.05,{emissive:0xffbc62,emissiveIntensity:.3}),x,.82,-2.2,false);
    box(root,new THREE.BoxGeometry(.32,.14,.07),mat(0xc5231f,.3,0,{emissive:0x9c1009,emissiveIntensity:.3}),x,.78,2.2,false);
  }
  if(police){
    box(root,new THREE.BoxGeometry(1.16,.13,.28),mat(0x171a20,.3,.2),0,1.79,-.08);
    for(const [x,color] of [[-.36,0x287eff],[.36,0xff293a]]){
      const lm=new THREE.PointLight(color,0,8,2);lm.position.set(x,2,.0);root.add(lm);
      box(root,new THREE.BoxGeometry(.34,.12,.27),mat(color,.25,0,{emissive:color,emissiveIntensity:2}),x,1.86,0,false);
    }
    box(root,new THREE.BoxGeometry(.12,.25,1.1),mat(0xe9e9e5,.3),0,1.26,-.1);
  }
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return root;
}
function makePerson(){
  const root=new THREE.Group();
  cylinder(root,.18,.52,mats.pants,0,.48,0,10);
  cylinder(root,.19,.48,mats.shirt,0,1,0,10);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.17,12,10),mats.skin);head.position.y=1.39;head.castShadow=true;root.add(head);
  const legs=[];
  for(const x of [-.105,.105]){const pivot=new THREE.Group();pivot.position.set(x,.26,0);root.add(pivot);box(pivot,new THREE.BoxGeometry(.13,.5,.15),mats.pants,0,-.17,0);legs.push(pivot);}
  root.userData.legPivots=legs;return root;
}
player.mesh=makePerson();player.mesh.position.copy(player.position);scene.add(player.mesh);
const roadMat=mats.asphalt,lineMat=mat(0xe1c38a,.82),grassMat=mat(0x566451);
const ground=box(scene,new THREE.PlaneGeometry(900,900),mat(0x82766b),0,-.22,0,false);ground.rotation.x=-Math.PI/2;
// A real street grid with sidewalks, lane markings, landscaped lots and varied downtown blocks.
for(let n=-7;n<=7;n++){
  const p=n*BLOCK;
  const roadV=box(scene,new THREE.BoxGeometry(14,.05,900),roadMat,p,-.08,0,false);
  const roadH=box(scene,new THREE.BoxGeometry(900,.05,14),roadMat,0,-.08,p,false);
  for(const offset of [-7.6,7.6]){
    box(scene,new THREE.BoxGeometry(.9,.19,900),mats.sidewalk,p+offset,-.035,0,false);
    box(scene,new THREE.BoxGeometry(900,.19,.9),mats.sidewalk,0,-.035,p+offset,false);
  }
  for(let k=-7;k<=7;k++){
    const z=k*BLOCK+31;
    box(scene,new THREE.BoxGeometry(.13,.012,8),lineMat,p,-.045,z,false);
    box(scene,new THREE.BoxGeometry(8,.012,.13),lineMat,z,-.045,p,false);
  }
}
const buildingMats=[0x8c7669,0x827d78,0xb49b7d,0x647078,0x9c887d,0xc0ad8e].map(c=>mat(c,.75));
const windowMat=mat(0xf2bd72,.3,.1,{emissive:0xd98645,emissiveIntensity:.22});
for(let gx=-6;gx<=5;gx++)for(let gz=-6;gz<=5;gz++){
  const cx=gx*BLOCK+32,cz=gz*BLOCK+32;
  if(Math.abs(cx)<30&&Math.abs(cz)<30)continue;
  const park=(gx===1&&gz===0)||(gx===-2&&gz===2)||(gx===3&&gz===-3);
  if(park){box(scene,new THREE.BoxGeometry(43,.18,43),grassMat,cx,-.035,cz,false);for(let t=0;t<5;t++){const tx=cx+(t%3-1)*12,tz=cz+(Math.floor(t/3)-.5)*15;cylinder(scene,.22,2.5,mat(0x574839),tx,1.2,tz);const crown=new THREE.Mesh(new THREE.SphereGeometry(2.1,9,7),mat(t%2?0x58705a:0x65745c));crown.position.set(tx,3,tz);crown.castShadow=true;scene.add(crown);}continue;}
  const count=1+Math.floor(Math.random()*3);
  for(let b=0;b<count;b++){
    const w=12+Math.random()*10,d=13+Math.random()*10,h=12+Math.random()*Math.random()*46;
    const x=cx+(Math.random()-.5)*18,z=cz+(Math.random()-.5)*18;
    const base=box(scene,new THREE.BoxGeometry(w,h,d),buildingMats[Math.floor(Math.random()*buildingMats.length)],x,h/2-.02,z);
    base.userData.bounds={x,z,w,d};
    box(scene,new THREE.BoxGeometry(w+1,.45,d+1),mat(0x393d3e),x,h+.2,z);
    for(let floor=1;floor<h/3;floor++)for(const side of [-1,1]){
      const win=box(scene,new THREE.BoxGeometry(w*.22,1.05,.06),windowMat,x+side*w*.24,floor*3,z-d/2-.04,false);
      win.material=windowMat;
    }
  }
}
// Decorative palms along the coast-side avenues.
for(let i=-6;i<=6;i++)for(const side of [-1,1]){const x=i*BLOCK+20,z=side*20;cylinder(scene,.22,4,mat(0x66503d),x,2,z);const crown=new THREE.Mesh(new THREE.SphereGeometry(2.4,8,6),mat(0x486050));crown.position.set(x,4.1,z);scene.add(crown);}
function buildingCollision(pos,radius=1){for(const o of scene.children){const b=o.userData?.bounds;if(b&&Math.abs(pos.x-b.x)<b.w/2+radius&&Math.abs(pos.z-b.z)<b.d/2+radius)return true;}return false;}
const car=makeCar(0xa34b39);car.position.set(0,0,0);scene.add(car);
player.position.set(-2.2,0,1.5);player.mesh.position.copy(player.position);
function addTraffic(x,z,axis,direction=1){const mesh=makeCar([0x687d8b,0xc2a77a,0x4c5556,0x9a4935][Math.floor(Math.random()*4)]);mesh.position.set(x,0,z);mesh.rotation.y=axis==='x'?(direction>0?-Math.PI/2:Math.PI/2):(direction>0?Math.PI:0);scene.add(mesh);traffic.push({mesh,axis,direction,speed:9+Math.random()*4});}
for(let n=-4;n<=4;n++){addTraffic(n*BLOCK+13,-45,'z',1);addTraffic(45,n*BLOCK+13,'x',-1);}
function makeWalker(x,z,axis){const mesh=makePerson();mesh.position.set(x,0,z);scene.add(mesh);walkers.push({mesh,x,z,axis,phase:Math.random()*6,span:3});}
for(let i=0;i<16;i++)makeWalker((Math.floor(Math.random()*8)-4)*BLOCK+10,(Math.floor(Math.random()*8)-4)*BLOCK+10,i%2?'x':'z');
function ensurePolice(){if(!policeCars.length){for(let i=0;i<Math.min(3,Math.max(1,wanted));i++){const angle=i*2.1+Math.PI,mesh=makeCar(0x202c3c,true);mesh.position.set(playerPosition().x+Math.sin(angle)*(38+i*8),0,playerPosition().z+Math.cos(angle)*(38+i*8));mesh.rotation.y=angle;scene.add(mesh);policeCars.push({mesh,speed:0,phase:i*2.4});}}}
function setWanted(value){const next=THREE.MathUtils.clamp(value,0,5);if(next>wanted){wanted=next;escapeTimer=0;showToast('Dispatch alert. Units are responding.',3.5);showEvent('POLICE NOTIFIED');ensurePolice();}}
function targetPosition(){return playerPosition();}
function enterExit(){if(player.onFoot){if(player.position.distanceTo(car.position)<4){player.onFoot=false;player.car=car;player.speed=0;scene.remove(player.mesh);showEvent('VEHICLE ACQUIRED');}else showToast('Get closer to your car.',1.8);}else{player.onFoot=true;player.position.copy(car.position).add(new THREE.Vector3(2.3,0,0));player.mesh.position.copy(player.position);scene.add(player.mesh);player.car=null;player.speed=0;}}
function handleKeyDown(e){const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys.add(k);if(k==='e'&&!e.repeat)enterExit();if(k==='escape'&&!e.repeat){paused=!paused;ui.pause.classList.toggle('hidden',!paused);}if(k==='h'&&!e.repeat)setWanted(wanted+1);}
window.addEventListener('keydown',handleKeyDown);window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
for(const button of document.querySelectorAll('[data-key]')){const k=button.dataset.key;button.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(k);});for(const type of ['pointerup','pointerleave','pointercancel'])button.addEventListener(type,()=>keys.delete(k));}
document.getElementById('resume-button').addEventListener('click',()=>{paused=false;ui.pause.classList.add('hidden');});
ui.sound.addEventListener('click',()=>{ui.soundLabel.textContent=ui.soundLabel.textContent==='SOUND ON'?'SOUND OFF':'SOUND ON';});
function updateFoot(dt){const x=(keys.has('d')?1:0)-(keys.has('a')?1:0),z=(keys.has('s')?1:0)-(keys.has('w')?1:0);const len=Math.hypot(x,z);if(len){const speed=keys.has('shift')?7:4;player.position.x+=x/len*speed*dt;player.position.z+=z/len*speed*dt;player.heading=Math.atan2(-x,-z);player.mesh.rotation.y=player.heading;if(buildingCollision(player.position,.45)){player.position.x-=x/len*speed*dt;player.position.z-=z/len*speed*dt;}player.mesh.userData.legPivots.forEach((p,i)=>p.rotation.x=Math.sin(elapsed*13+i*Math.PI)*.45);}player.mesh.position.copy(player.position);}
function updateDrive(dt){const throttle=(keys.has('w')?1:0)-(keys.has('s')?1:0),steer=(keys.has('a')?1:0)-(keys.has('d')?1:0);player.speed+=throttle*17*dt;player.speed=THREE.MathUtils.clamp(player.speed,-13,36);player.speed*=Math.pow(keys.has(' ')?.91:.985,dt*60);if(Math.abs(player.speed)<.08)player.speed=0;car.rotation.y+=steer*dt*(.65+Math.min(Math.abs(player.speed),20)*.035)*Math.sign(player.speed||1);const next=car.position.clone().add(new THREE.Vector3(-Math.sin(car.rotation.y),0,-Math.cos(car.rotation.y)).multiplyScalar(player.speed*dt));if(!buildingCollision(next,1.25))car.position.copy(next);else{player.speed*=-.23;if(trafficHitCooldown<=0){setWanted(wanted+1);trafficHitCooldown=2.5;showEvent('COLLISION REPORTED');}}car.userData.wheels.forEach(w=>w.rotation.x+=player.speed*dt*1.7);for(const t of traffic){if(t.mesh.position.distanceTo(car.position)<2.7&&trafficHitCooldown<=0){setWanted(wanted+1);player.speed*=.65;trafficHitCooldown=2.5;showEvent('TRAFFIC COLLISION');}}}

function updateWorld(dt,now) {
  for(const t of traffic) {
    const p=t.mesh.position;
    if(t.axis==='z'){p.z+=t.direction*t.speed*dt;if(p.z>285)p.z=-285;if(p.z< -285)p.z=285;}
    else {p.x+=t.direction*t.speed*dt;if(p.x>285)p.x=-285;if(p.x< -285)p.x=285;}
    t.mesh.userData.wheels.forEach(w=>{w.rotation.x+=t.speed*dt*1.6;});
  }
  for(const w of walkers) {
    w.phase+=dt*(w.axis==='x'?1.5:1.2);const offset=Math.sin(w.phase)*w.span;
    w.mesh.position.x=w.x+(w.axis==='x'?offset:0);w.mesh.position.z=w.z+(w.axis==='z'?offset:0);
    w.mesh.rotation.y=w.axis==='x'?(Math.cos(w.phase)>0?-Math.PI/2:Math.PI/2):(Math.cos(w.phase)>0?Math.PI:0);
    const leg=w.mesh.userData.legPivots;leg[0].rotation.x=Math.sin(w.phase*3)*.25;leg[1].rotation.x=-Math.sin(w.phase*3)*.25;
  }
  for(let i=0;i<policeCars.length;i++) {
    const unit=policeCars[i],mesh=unit.mesh,target=playerPosition();
    const dx=target.x-mesh.position.x,dz=target.z-mesh.position.z,distance=Math.hypot(dx,dz);
    const desired=Math.atan2(-dx,-dz);
    let delta=((desired-mesh.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
    const maxTurn=1.5*dt*Math.min(1,distance/8);
    mesh.rotation.y+=THREE.MathUtils.clamp(delta,-maxTurn,maxTurn);
    const maxSpeed=20+wanted*2.7;
    unit.speed=THREE.MathUtils.damp(unit.speed,maxSpeed,distance<8?1.9:1.1,dt);
    const fx=-Math.sin(mesh.rotation.y),fz=-Math.cos(mesh.rotation.y);
    const next=mesh.position.clone().add(new THREE.Vector3(fx,0,fz).multiplyScalar(unit.speed*dt));
    if(!buildingCollision(next,1.4))mesh.position.copy(next);
    else {
      // A blocked patrol takes the nearest cross-street instead of nosing into a facade.
      const gx=Math.round(target.x/BLOCK)*BLOCK+Math.sign(target.x-mesh.position.x||1)*4;
      const gz=Math.round(target.z/BLOCK)*BLOCK+Math.sign(target.z-mesh.position.z||1)*4;
      const a=Math.atan2(-(gx-mesh.position.x),-(gz-mesh.position.z));let d=((a-mesh.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
      mesh.rotation.y+=THREE.MathUtils.clamp(d,-2.5*dt,2.5*dt);
      unit.speed=Math.min(unit.speed,9);
    }
    mesh.userData.wheels.forEach(w=>{w.rotation.x+=unit.speed*dt*1.7;});
    // Alternate lightbar and reflected color flicker across the patrol car body.
    const flash=Math.sin(now*13+unit.phase)>0;
    let lamp=0;
    for(const child of mesh.children) if(child.isLight){child.intensity=(child.color.r>.5?flash:!flash)?3.2:0;}
    for(const child of mesh.children) if(child.isMesh&&child.material?.emissiveIntensity===2){child.material.emissiveIntensity=(lamp++%2===0?flash:!flash)?2.8:.35;}
    if(distance<3.6&&player.car&&Math.abs(player.speed)<11&&trafficHitCooldown<=0) {
      player.speed+=player.speed>=0?4:-4;trafficHitCooldown=2.2;showEvent('KEEP MOVING');
    }
  }
  if(wanted>0) {
    ensurePolice();
    let nearest=Infinity;for(const c of policeCars)nearest=Math.min(nearest,c.mesh.position.distanceTo(targetPosition()));
    if(nearest>130)escapeTimer+=dt;else escapeTimer=Math.max(0,escapeTimer-dt*.65);
    if(escapeTimer>15){wanted=0;escapeTimer=0;policeCars.forEach(c=>scene.remove(c.mesh));policeCars.length=0;showToast('Suspect lost. Units stand down.',3.5);showEvent('YOU LOST THE COPS');}
  }
}
function updateHud(dt,now) {
  if(dispatchTimer>0){dispatchTimer-=dt;if(dispatchTimer<=0)ui.toast.classList.remove('show');}
  if(eventTimer>0){eventTimer-=dt;if(eventTimer<=0)ui.eventToast.classList.remove('show');}
  if(trafficHitCooldown>0)trafficHitCooldown-=dt;
  elapsed+=dt;
  ui.missionTime.textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
  ui.wantedPanel.classList.toggle('active',wanted>0);
  ui.wantedStars.forEach((star,i)=>star.classList.toggle('on',i<wanted));
  ui.wantedStatus.textContent=wanted===0?'ALL QUIET':escapeTimer>0?`LOSING UNITS · ${Math.ceil(15-escapeTimer)}s`:`ACTIVE PURSUIT · ${policeCars.length} UNIT${policeCars.length===1?'':'S'}`;
  const mph=player.car?Math.round(Math.abs(player.speed)*2.237):0;
  ui.speedValue.textContent=String(mph).padStart(3,'0');
  ui.gear.textContent=!player.car?'PARK':Math.abs(player.speed)<.5?'IDLE':player.speed<0?'REVERSE':'DRIVE';
  ui.speedArc.style.strokeDashoffset=String(207-Math.min(1,mph/125)*207);
  ui.missionTitle.textContent=wanted>0?'LOSE THE POLICE':'A QUIET NIGHT IN THE CITY';
  ui.missionSubtitle.textContent=wanted>0?(escapeTimer>0?'Break line of sight. Stay clear for 15 seconds.':'Stay on the move. Avoid collisions.'):(player.onFoot?'Find a ride. Keep a low profile.':'Take a drive through the city.');
  if(lastHelpMode!==player.onFoot){
    ui.objectiveText.innerHTML=player.onFoot?'Walk to the car and press <b>E</b> to enter':'Cruise the city. Press <b>E</b> to exit';
    ui.help.innerHTML=player.onFoot?'<span class="help-key">W A S D</span><span>MOVE</span><i></i><span class="help-key">SHIFT</span><span>SPRINT</span><i></i><span class="help-key">E</span><span>ENTER CAR</span>':'<span class="help-key">W A S D</span><span>DRIVE</span><i></i><span class="help-key">SPACE</span><span>BRAKE</span><i></i><span class="help-key">E</span><span>EXIT CAR</span>';
    lastHelpMode=player.onFoot;
  }
  ui.missionProgress.style.width=wanted>0?`${Math.min(100,escapeTimer/15*100)}%`:player.onFoot?'20%':'46%';
  updateSiren(now);
  // Neighborhood label follows the player, with fictional streets and coordinates.
  const pos=playerPosition(),sectorX=Math.floor((pos.x+160)/64),sectorZ=Math.floor((pos.z+160)/64);
  const areas=['VESPUCCI CANALS','DEL PERRO','LA PUERTA','PILLBOX HILL','ROCKFORD HILLS','STRAWBERRY','WEST VINEWOOD','LITTLE SEOUL','DOWNTOWN'];
  ui.district.textContent=areas[(Math.abs(sectorX*3+sectorZ*5)+Math.floor(Math.abs(pos.z)/135))%areas.length];
  const streets=['SAN ANDREAS AVE','ELGIN AVENUE','VESPUCCI BLVD','CARSON AVENUE','OCEAN DRIVE','LINCOLN BOULEVARD'];
  ui.street.textContent=streets[Math.floor(Math.abs(pos.x/64+pos.z/81))%streets.length];
}
function drawMinimap() {
  const ctx=ui.map.getContext('2d'),w=ui.map.width,h=ui.map.height,cx=w/2,cy=h/2,pos=playerPosition(),scale=.49;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#19242a';ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-player.heading);
  const span=w/scale;
  ctx.fillStyle='#363e40';
  for(let n=-5;n<=5;n++){
    const p=n*BLOCK-pos.x;ctx.fillRect(p*scale-4,-h/2,8,h);
    const q=n*BLOCK-pos.z;ctx.fillRect(-w/2,q*scale-4,w,8);
  }
  // Park patches and block texture.
  ctx.fillStyle='rgba(102,128,100,.46)';for(const [x,z] of [[64,0],[-128,128]])ctx.fillRect((x-pos.x)*scale-9,(z-pos.z)*scale-9,18,18);
  ctx.strokeStyle='rgba(206,197,173,.23)';ctx.lineWidth=1;
  for(let n=-4;n<=4;n++){ctx.beginPath();ctx.moveTo(n*BLOCK*scale-pos.x*scale,-h/2);ctx.lineTo(n*BLOCK*scale-pos.x*scale,h/2);ctx.stroke();ctx.beginPath();ctx.moveTo(-w/2,n*BLOCK*scale-pos.z*scale);ctx.lineTo(w/2,n*BLOCK*scale-pos.z*scale);ctx.stroke();}
  for(const t of traffic){const x=(t.mesh.position.x-pos.x)*scale,y=(t.mesh.position.z-pos.z)*scale;if(Math.abs(x)<cx-5&&Math.abs(y)<cy-5){ctx.fillStyle='#d5bc8e';ctx.fillRect(x-1.6,y-1.6,3.2,3.2);}}
  for(const c of policeCars){const x=(c.mesh.position.x-pos.x)*scale,y=(c.mesh.position.z-pos.z)*scale;if(Math.abs(x)<cx&&Math.abs(y)<cy){ctx.fillStyle='#ff594f';ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,87,77,.38)';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.stroke();}}
  if(player.onFoot){ctx.fillStyle='#e6c27b';ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fill();}else{ctx.fillStyle='#e8c67f';ctx.fillRect(-2.2,-4.2,4.4,8.4);}
  ctx.restore();ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1;ctx.strokeRect(.5,.5,w-1,h-1);
}
const cameraTarget=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),lookTarget=new THREE.Vector3();
function updateCamera(dt) {
  const target=playerPosition();const heading=player.car?player.car.rotation.y:player.heading;
  const distance=player.car?12.4:8.6,height=player.car?5.3:4.15;
  desiredCamera.set(target.x+Math.sin(heading)*distance,target.y+height,target.z+Math.cos(heading)*distance);
  camera.position.lerp(desiredCamera,1-Math.exp(-dt*4.2));
  lookTarget.set(target.x-Math.sin(heading)*(player.car?4.7:2),target.y+(player.car?1.3:1.45),target.z-Math.cos(heading)*(player.car?4.7:2));
  camera.lookAt(lookTarget);
  const desiredFov=player.car?THREE.MathUtils.mapLinear(Math.min(Math.abs(player.speed),34),0,34,57,64):57;
  camera.fov=THREE.MathUtils.damp(camera.fov,desiredFov,3,dt);camera.updateProjectionMatrix();
}
function update(dt,now) {
  if(!paused){if(player.onFoot)updateFoot(dt);else updateDrive(dt);updateWorld(dt,now);updateHud(dt,now);drawMinimap();updateCamera(dt);}
  renderer.render(scene,camera);
}
function animate() {requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);update(dt,clock.elapsedTime);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));});
// Keep the shadow camera centered on the moving action so the streets remain grounded.
function followSun(){const p=playerPosition();sun.position.set(p.x-100,145,p.z+95);sun.target.position.set(p.x,0,p.z);}
const originalUpdateCamera=updateCamera;
function boot() {
  camera.position.set(0,5.2,18);camera.lookAt(0,1,-2);followSun();
  const started=performance.now();
  const bootFrame=()=>{const t=(performance.now()-started)/1000;followSun();requestAnimationFrame(bootFrame);if(t>1.7){ui.loading.classList.add('done');setTimeout(()=>ui.loading.remove(),900);}}
  requestAnimationFrame(bootFrame);animate();
}
boot();
