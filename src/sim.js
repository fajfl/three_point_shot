// 《斷踝》規則與物理：手機與伺服器跑同一份
function createSim(){
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,hyp=Math.hypot,PI=Math.PI;
const rnd=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const gauss=()=>{let u=0;for(let i=0;i<4;i++)u+=Math.random();return(u-2)/.577};
const pick=a=>a[Math.floor(Math.random()*a.length)];
const TP={shoot:{n:'射手',ult:'神準',num:'3',w:1.17,h:1.24,v:-.1,green:1.2,cdK:1,lay:0,steal:0,block:0,react:0,dmg:1},slash:{n:'切入王',ult:'隔扣',num:'1',w:1.21,h:1.22,v:.35,green:.92,cdK:.8,lay:.6,steal:0,block:0,react:0,dmg:1},wall:{n:'鐵閘',ult:'封鎖',num:'55',w:1.33,h:1.25,v:-.15,green:.85,cdK:1.1,lay:0,steal:.1,block:.16,react:.05,dmg:.8}};
const CD={cross:1.1,behind:1.4,step:1.5,spin:2.4,burst:2.2,halt:.9};
const MV={cross:'變向',behind:'背後',step:'後撤',spin:'轉身',burst:'突破',halt:'急停'};
/* ───────────── 規則與物理：與畫面分開，之後接線上對戰時由伺服器或持球方跑這一段 ───────────── */
const H=1/120,GR=13,BR=.2,RIMY=3.05,HOOP={x:0,z:1.5},RIM=.42,BOARDZ=.98,W=12.4,D=11.6,ARC=6.1,CORNER=5.6,WIN=11,REACT=.27,REACT_H=.38,SHOT_MID=.8,LAY=3.6;
const LV={
  rookie:{name:'國中生',pull:.2,react:.25,read:.4,aim:.17,move:.5,steal:.3,bite:.62,block:.3},
  reg:{name:'系隊學長',pull:.45,react:.2,read:.6,aim:.11,move:.76,steal:.5,bite:.42,block:.5},
  king:{name:'河濱阿伯',pull:.75,react:.15,read:.8,aim:.06,move:.88,steal:.8,bite:.2,block:.75}
};
const mk=(id)=>({id,human:false,x:0,z:8,y:0,vy:0,vx:0,vz:0,ax:0,az:0,fx:0,fz:-1,ix:0,iz:0,mag:0,type:'slash',en:0,ultT:0,cds:{},last:'',strikes:0,strikeT:-9,burstV:6.6,stepShot:false,swatT:-9,pull:false,ride:false,shoeLost:false,shoeX:0,shoeZ:0,shoeT:0,taunt:'',fade:false,moveT:-9,spinS:null,spinDir:1,euS:1,euHit:false,s:'free',t:0,dur:0,bal:0,tapT:-9,c:false,pc:false,pend:null,cd:0,hand:1,handV:1,drib:0,meter:0,jumped:false,stepT:-9,noPick:0,a:false,b:false,pa:false,pb:false,skid:0,tx:0,tz:8,hist:[],aiT:0,aiCd:0,aiG:null,aiGT:0,aiRel:.8,aiP:null,aiRe:9,aiB:null,aiF:false,struck:false,relDone:false,dk:null,fakeT:-10,baitGiven:false,baitUntil:0,jumpT:-10,blockChaseUntil:0,chaseUntil:0,whiffUntil:0});
const G={me:0,online:false,quiet:false,foeType:null,lat:[0,0],myType:'slash',cele:-1,celeT:0,finale:false,winner:-1,t:0,phase:'check',pt:0,off:0,next:1,holder:null,clock:12,needClear:false,score:[0,0],attract:true,level:'reg',slow:0,camT:0,camP:null,shake:0,rimKick:0,netKick:0,greenFlash:0,
  ball:{mode:'held',x:0,y:1,z:8,vx:0,vy:0,vz:0,make:false,pts:0,owner:0,tf:0,touched:false,q:'',spin:0},
  p:[mk(0),mk(1)],stats:{ankle:[0,0],green:0},fx:[],hintN:{}};
const mkI=()=>({x:0,z:0,mag:0,a:false,b:false,c:false,tapA:false,tapB:false,tapC:false});
const INP=[mkI(),mkI()];
const emit=(k,d)=>{if(!G.quiet&&G.fx.length<120)G.fx.push([k,d||{}])};
const opp=p=>G.p[1-p.id];
const dH=p=>hyp(p.x-HOOP.x,p.z-HOOP.z);
const isThree=p=>dH(p)>=ARC-.045||Math.abs(p.x)>=CORNER-.045; // 街頭規則：踩到弧線也算出線
const toHoop=p=>{const d=dH(p)||1;return{x:(HOOP.x-p.x)/d,z:(HOOP.z-p.z)/d}};
const dist=(a,b)=>hyp(a.x-b.x,a.z-b.z);
const setS=(p,s,dur)=>{p.s=s;p.t=0;if(dur!==undefined)p.dur=dur};
const speed=p=>hyp(p.vx,p.vz);
const DOWN=new Set(['fall','getup','stag']);
const STEALABLE=new Set(['free','cross','step','burst','halt','fake','stag','land']);
const canAct=p=>p.s==='free'||(p.s==='land'&&p.t>.05)||p.s==='halt'||(p.s==='step'&&p.t>.12)||(p.s==='cross'&&p.t>.14)||(p.s==='behind'&&p.t>.2)||(p.s==='step'&&p.t>.16)||(p.s==='burst'&&p.t>.1)||(p.s==='fake'&&p.t>.12);

function ballPos(p){
  const rx=-p.fz,rz=p.fx;
  if(p.s==='hold'||p.s==='fake'){
    const u=p.s==='fake'?Math.sin(clamp(p.t/.24,0,1)*PI)*.6:clamp(p.t/.3,0,1);
    return{x:p.x+p.fx*.22,y:p.y+lerp(1.3,2.5,u),z:p.z+p.fz*.22};
  }
  if(p.s==='layup'){if(p.pull){const u=clamp(p.t/.2,0,1);return{x:p.x+rx*.34*(p.hand)-p.fx*.05,y:p.y+1.55+u*.6,z:p.z+rz*.34*p.hand-p.fz*.05}}return{x:p.x+p.fx*.35-rx*.1,y:p.y+lerp(1.5,2.65,clamp(p.t/.2,0,1)),z:p.z+p.fz*.35-rz*.1}}
  if(p.s==='dunk')return{x:p.x+p.fx*.36,y:p.y+lerp(1.4,2.7,clamp(p.t/.2,0,1)),z:p.z+p.fz*.36};
  if(p.s==='euro')return{x:p.x+p.fx*.3,y:p.y+1.2,z:p.z+p.fz*.3};
  if(p.s==='behind'){const u=clamp(p.t/.3,0,1),e=u*u*(3-2*u),o=lerp(-p.hand,p.hand,e),n=Math.sin(u*PI),y=u<.6?.92:lerp(.92,.34,(u-.6)/.4);return{x:p.x+rx*o*.48+p.fx*(.22-.6*n),y,z:p.z+rz*o*.48+p.fz*(.22-.6*n)}}
  if(p.s==='spin'){const a=clamp(p.t/.48,0,1)*PI*2*p.spinDir,c=Math.cos(a),n=Math.sin(a),ox=rx*p.handV*.5+p.fx*.3,oz=rz*p.handV*.5+p.fz*.3;return{x:p.x+ox*c-oz*n,y:.62,z:p.z+ox*n+oz*c}}
  if(p.s==='cross'){const u=clamp(p.t/.22,0,1),o=lerp(-p.hand,p.hand,u),e=Math.sin(u*PI);return{x:p.x+rx*o*.5+p.fx*(.38+.2*e),y:BR+.05+.36*Math.abs(Math.cos(u*PI)),z:p.z+rz*o*.5+p.fz*(.38+.2*e)}}
  if(p.s==='step'){const u=clamp(p.t/.26,0,1),o=lerp(-p.hand,p.hand,u);return{x:p.x+rx*o*.42+p.fx*.08,y:BR+.05+.5*Math.abs(Math.cos(u*PI)),z:p.z+rz*o*.42+p.fz*.08}}
  if(p.s==='burst'){const k=Math.abs(Math.sin(p.drib));return{x:p.x+rx*p.handV*.34+p.fx*.72,y:BR+.04+k*.76,z:p.z+rz*p.handV*.34+p.fz*.72}}
  const k=Math.abs(Math.sin(p.drib));
  return{x:p.x+rx*p.handV*.52+p.fx*.34,y:BR+.04+k*.82,z:p.z+rz*p.handV*.52+p.fz*.34};
}

function newGame(attract,level){
  G.finale=false;G.attract=attract;G.level=level||G.level;
  const ty=Object.keys(TP);G.p[0].type=attract?pick(ty):G.myType;G.p[1].type=G.foeType||pick(ty);
  for(const p of G.p){p.en=0;p.ultT=0;p.cds={};p.last='';p.strikes=0;p.shoeLost=false;p.taunt='';p.pull=false;p.ride=false;p.dk=null;p.fakeT=-10;p.baitGiven=false;p.baitUntil=0;p.jumpT=-10;p.blockChaseUntil=0;p.chaseUntil=0;p.whiffUntil=0}emit('types');G.score=[0,0];G.stats={ankle:[0,0],green:0};G.fx.length=0;G.slow=0;G.camT=0;
  G.p[0].human=!attract;G.p[1].human=G.online;
  toCheck(attract||G.online?(Math.random()<.5?0:1):0);
}
function toCheck(off){
  G.off=off;G.phase='check';G.pt=0;G.needClear=false;G.clock=12;
  const a=G.p[off],d=G.p[1-off],b=G.ball;
  G.holder=a;b.mode='held';b.pts=0;b.make=false;b.touched=false;
  for(const p of G.p){setS(p,'free');p.pend=null;p.bal=0;p.vy=0;p.y=0;p.cd=0;p.taunt='';p.pull=false;p.ride=false;p.fade=false;p.stepShot=false;p.strikes=0;p.strikeT=-9;p.ax=p.az=0;p.aiG=null;p.aiB=null;p.aiF=false;p.dk=null;p.fakeT=-10;p.baitGiven=false;p.baitUntil=0;p.jumpT=-10;p.blockChaseUntil=0;p.chaseUntil=0;p.whiffUntil=0}
  const x=rnd(-1.5,1.5);a.tx=x;a.tz=9.2;d.tx=x*.85;d.tz=7;
  emit('check',{off});
}
function endPossession(nextOff,wait){G.phase='dead';G.pt=wait;G.next=nextOff}
function give(p){
  const b=G.ball;G.holder=p;b.mode='held';b.pts=0;b.make=false;
  if(p.id!==G.off){
    // 每次球權真正交換時，兩邊的斷踝失誤都重新計數。
    for(const q of G.p){q.strikes=0;q.strikeT=-9;q.bal=0;q.pend=null}
    G.off=p.id;G.needClear=!isThree(p);G.clock=14;
    emit('switch',{p:p.id,clear:G.needClear});
  }
  else G.clock=Math.max(G.clock,8);
  emit('grab',{p:p.id});
  if(p.blockChaseUntil>G.t){p.blockChaseUntil=0;p.chaseUntil=G.t+2.8;emit('chase',{p:p.id,clear:G.needClear})}
}
const gain=(p,v)=>{p.en=clamp(p.en+v,0,100)};
const ultOn=p=>G.t<p.ultT;
function miss(p,by){
  if(ultOn(p)&&p.type==='wall'){return}
  const pvp=G.online&&p.human,threshold=pvp?3:2;
  // 雙人即時操作時不把相隔太近的晃動重複計為兩次失誤。
  if(pvp&&G.t-p.strikeT<.35)return;
  // 失誤累積至本次球權結束，不再在數秒後自行歸零。
  p.strikes++;p.strikeT=G.t;
  p.bal=threshold===3?(p.strikes===1?42:p.strikes===2?75:100):(p.strikes>=2?100:60);
  if(p.strikes>=threshold){p.strikes=0;knock(p,by)}
  else{setS(p,'stag',pvp?.32:.5);gain(opp(p),pvp?10:18);emit('stag',{p:p.id,remaining:threshold-p.strikes})}
}
function knock(p,by){
  setS(p,'fall',1.25);p.bal=100;p.pend=null;
  const dropped=G.holder===p;if(dropped)looseBall(p,1.6);
  const a=rnd(PI*2),r=rnd(2,3.2);p.shoeLost=true;p.shoeX=clamp(p.x+Math.cos(a)*r,-W/2+.8,W/2-.8);p.shoeZ=clamp(p.z+Math.sin(a)*r,1,D-.8);p.shoeT=G.t+.9;
  gain(opp(p),40);G.stats.ankle[1-p.id]++;G.slow=.7;G.camT=1.05;G.camP=p;
  emit('ankle',{p:p.id,by:by===undefined?1-p.id:by});
}
function looseBall(from,pop){
  const b=G.ball,q=ballPos(from);b.x=q.x;b.y=q.y;b.z=q.z;b.mode='loose';b.make=false;b.pts=0;b.touched=true;b.tf=0;
  const a=rnd(PI*2);b.vx=Math.cos(a)*pop;b.vz=Math.sin(a)*pop;b.vy=2.4;G.holder=null;
}
function strike(a,D,k,easy=0){
  const d=opp(a);if(d.y>.05||d.s==='fall'||d.s==='getup')return;
  const gap=dist(a,d);if(gap>(d.human?2.6:3.4))return;
  const commit=Math.max(0,-(d.vx*D.x+d.vz*D.z));
  d.pend={D,t:0,win:(d.human?REACT_H+(G.online?.1:0):REACT)+TP[d.type].react+easy+G.lat[d.id],commit,close:gap<1.8,k};
  emit('juke',{to:d.id,D});
}
function moveKind(p){
  if(p.mag<.2||hyp(p.ix,p.iz)<.25)return'halt';
  const f=toHoop(p),l=hyp(p.ix,p.iz),d=(p.ix*f.x+p.iz*f.z)/l;
  if(d>.65)return spinReady(p)&&d<.94?'spin':'burst';
  if(d<-.65)return'step';
  return dist(p,opp(p))<1.65?'behind':'cross';
}
function spinReady(p){const o=opp(p),f=toHoop(p),ox=o.x-p.x,oz=o.z-p.z,ahead=ox*f.x+oz*f.z,side=Math.abs(ox*f.z-oz*f.x);return ahead>0&&ahead<1.9&&side<1.05}
function doMove(p){
  const k=moveKind(p);
  if(p.cd>0||(p.cds[k]||0)>0)return;
  const f=toHoop(p),rep=p.last===k,set=G.t-p.moveT<.75&&!rep,easy=rep?.14:0;
  p.cd=.42;p.cds[k]=CD[k]*TP[p.type].cdK;p.last=k;p.moveT=G.t;
  const l=hyp(p.ix,p.iz)||1,ix=p.ix/l,iz=p.iz/l;
  const bait=G.t<p.baitUntil,whiff=G.t<p.whiffUntil,chase=G.t<p.chaseUntil;
  const boost=Math.min(1.6,(bait?1.15:0)+(whiff?.75:0)+(chase?.45:0));
  if(k==='halt'){
    const sp=speed(p);setS(p,'halt');emit('squeak',{p:p.id});
    if(sp>1.4)strike(p,{x:-p.vx/sp,z:-p.vz/sp},1,easy);
  }else if(k==='burst'){
    p.burstV=(set?8:6.6)+boost;setS(p,'burst');p.vx=f.x*p.burstV;p.vz=f.z*p.burstV;strike(p,f,1,easy);emit('dust',{p:p.id,n:4});if(set)emit('combo',{p:p.id});
  }else if(k==='spin'){
    const o=opp(p),lat=(o.x-p.x)*(-f.z)+(o.z-p.z)*f.x,s2=lat>0?-1:1;p.spinS={x:-f.z*s2,z:f.x*s2};p.spinDir=s2;setS(p,'spin');
    strike(p,{x:p.spinS.x,z:p.spinS.z},1,easy);emit('spin',{p:p.id});emit('dust',{p:p.id,n:4});
  }else if(k==='step'){
    setS(p,'step');p.hand=-p.hand;p.vx=-f.x*8.6;p.vz=-f.z*8.6;p.vy=2.3;p.y=.01;p.stepT=G.t;strike(p,{x:-f.x,z:-f.z},1,easy);emit('dust',{p:p.id,n:5});emit('squeak',{p:p.id});
  }else{
    const d=ix*f.x+iz*f.z;let sx=ix-f.x*d,sz=iz-f.z*d,sl=hyp(sx,sz)||1;sx/=sl;sz/=sl;
    const Dx=sx+f.x*.22,Dz=sz+f.z*.22,dl=hyp(Dx,Dz),Dn={x:Dx/dl,z:Dz/dl},side=(-p.fz*Dn.x+p.fx*Dn.z);
    p.hand=side>=0?1:-1;setS(p,k);p.vx=Dn.x*((k==='behind'?5.8:6.4)+boost*.45);p.vz=Dn.z*((k==='behind'?5.8:6.4)+boost*.45);
    strike(p,Dn,1,easy);emit('squeak',{p:p.id});emit('dust',{p:p.id,n:3});if(k==='behind')emit('behind',{p:p.id});
  }
  if(k==='burst'||k==='behind'||k==='cross'){
    if(bait){p.baitUntil=0;emit('baitDrive',{p:p.id})}
    if(whiff){p.whiffUntil=0;emit('whiffDrive',{p:p.id})}
  }
}
function doUlt(p){
  if(p.en<100)return;p.en=0;const t=TP[p.type];p.ultT=G.t+(p.type==='slash'?9:7);
  const description=p.type==='shoot'?'7 秒綠區變大、投籃更抗干擾':p.type==='slash'?'9 秒擴大扣籃距離、隔扣更強':'7 秒加速、防抄截與空中壓迫';
  G.shake=Math.max(G.shake,.4);emit('ult',{p:p.id,name:t.ult,description});
}
function doFake(p){setS(p,'fake');p.fakeT=G.t;p.baitGiven=false;p.baitUntil=0;emit('fake',{p:p.id})}
function greenW(p){
  const o=opp(p);let open=clamp((dist(p,o)-.9)/2.3,.37,1);
  if(DOWN.has(o.s))open=1.3;
  if(ultOn(p)&&p.type==='shoot')open=2.2;
  let w=.125*open*TP[p.type].green;
  if(G.t-p.stepT<.95)w*=p.stepShot&&isThree(p)?1.5:1.35;
  if(speed(p)>3.5&&!p.ride&&!p.fade&&!p.stepShot)w*=.8;
  if(p.ride)w*=.72;
  if(dH(p)>ARC+1.7)w*=.7;
  return w;
}
// 空中壓迫：貼身起跳最強，擦肩掠過或距離較遠仍有微弱影響。
function contestPenalty(p){
  const o=opp(p),gap=dist(p,o),jumpAge=G.t-o.jumpT;
  if(jumpAge<0||jumpAge>.95||o.y<.08||o.s==='fall'||o.s==='getup'||gap>4.7)return 0;
  // 以防守者朝向為中心，左右各 60 度；背後或側後方起跳不構成干擾。
  const dx=p.x-o.x,dz=p.z-o.z;
  const face=gap>.001?(dx*o.fx+dz*o.fz)/gap:1;
  if(face<.5)return 0;
  const base=gap<1.6?.2:gap<2.5?.11:gap<3.5?.055:.025;
  let penalty=base*(.75+.25*clamp((face-.5)/.5,0,1));
  if(ultOn(o)&&o.type==='wall')penalty=Math.min(.28,penalty*1.3);
  if(ultOn(p)&&p.type==='shoot')penalty*=.55;
  return penalty;
}
function canDunk(p){
  const d=dH(p);
  return d<LAY||(ultOn(p)&&p.type==='slash'&&d<5.6);
}
function startShot(p){
  if(G.needClear&&isThree(p)){G.needClear=false;emit('cleared',{p:p.id,step:p.s==='step'})}
  if(G.needClear){emit('needClear',{p:p.id});return}
  if(canDunk(p)){
    setS(p,'dunk');
    p.dk={x0:p.x,z0:p.z,done:false,flew:false,save:false,rescued:false};
    p.vx*=.8;p.vz*=.8;
    return;
  }
  if(G.t-p.tapT<.3){doFake(p);return}
  const f=toHoop(p),lat=Math.abs(p.vx*f.z-p.vz*f.x),back=p.mag>.3&&(p.ix*f.x+p.iz*f.z)<-.5;
  p.stepShot=G.t-p.stepT<.8;p.fade=back&&!p.stepShot;p.ride=!back&&!p.stepShot&&lat>3.1&&!isThree(p);
  setS(p,'hold');p.meter=0;p.jumped=false;
  if(p.ride){p.jumped=true;p.vy=4.5;p.y=.01;emit('ride',{p:p.id})}
  if(p.fade){p.jumped=true;p.vy=4.5;p.y=.01;p.vx=-f.x*2.5;p.vz=-f.z*2.5;emit('fade',{p:p.id})}
  if(p.stepShot){p.jumped=true;p.vy=4.3;p.y=Math.max(p.y,.01);emit('stepShot',{p:p.id,three:isThree(p)})}
}
function launch(p,make,pts,q,T){
  const b=G.ball,from=ballPos(p);
  b.x=from.x;b.y=from.y;b.z=from.z;
  let tx=HOOP.x,tz=HOOP.z;
  if(!make){const a=rnd(PI*2),o=RIM+rnd(.0,.12);tx+=Math.cos(a)*o;tz+=Math.sin(a)*o}
  const tt=T||.86+hyp(tx-b.x,tz-b.z)*.052;
  b.vx=(tx-b.x)/tt;b.vz=(tz-b.z)/tt;b.vy=(RIMY-b.y+.5*GR*tt*tt)/tt;
  b.mode='air';b.make=make;b.pts=pts;b.owner=p.id;b.tf=0;b.touched=false;b.q=q;b.spin=-9;b.safe=p.pull;b.ride=p.ride?.9:p.fade?.66:1;
  G.holder=null;p.noPick=G.t+.4;
}
function release(p){
  if(p.s!=='hold'||G.holder!==p)return;
  const err=Math.abs(p.meter-SHOT_MID),w=greenW(p);
  const q=err<=w?'green':err<=w*2.4?'ok':'bad';
  if(!p.jumped){p.vy=3.2;p.jumped=true}
  const penalty=contestPenalty(p),contested=penalty>0;
  const make=Math.random()<(q==='green'?1-penalty:(q==='ok'?.65:.15)*(1-penalty*1.45));
  if(q==='green'){G.greenFlash=1;gain(p,15);if(p.human)G.stats.green++}
  emit('release',{p:p.id,q,err,early:p.meter<SHOT_MID,contested,penalty});
  setS(p,'rel');
  launch(p,make,isThree(p)?3:2,q);
}
function strikeSteal(p){
  p.struck=true;const h=G.holder;
  if(!h||h===p||!STEALABLE.has(h.s)){p.dur=.6;return}
  const q=ballPos(h),d=hyp(q.x-(p.x+p.fx*.95),q.z-(p.z+p.fz*.95));
  const ultW=ultOn(p)&&p.type==='wall';
  const stealChance=ultW?.72:(p.type==='wall'?.57:.47);
  if(d<.54+TP[p.type].steal+(ultW?.3:0)&&Math.random()<stealChance){
    const b=G.ball;b.x=q.x;b.y=q.y;b.z=q.z;b.mode='loose';b.make=false;b.pts=0;b.touched=true;b.tf=0;
    b.vx=(p.x-h.x)*.7+rnd(-.5,.5);b.vz=(p.z-h.z)*.7+rnd(-.5,.5);b.vy=2.6;G.holder=null;h.noPick=G.t+.32;setS(h,'stag',.22);
    gain(p,25);emit('steal',{p:p.id});
  }else{
    p.dur=ultW?.34:.62;
    if(dist(p,h)<2.4){h.whiffUntil=G.t+1.05;emit('whiffWindow',{p:h.id})}
    emit('whiff',{p:p.id});
  }
}
function actions(p){
  const pA=p.a&&!p.pa,pB=p.b&&!p.pb,rB=!p.b&&p.pb,pC=p.c&&!p.pc;p.pa=p.a;p.pb=p.b;p.pc=p.c;
  if(G.phase==='dead'&&G.cele===p.id&&!p.taunt&&p.y===0&&p.s==='free'){
    if(pA||pB||pC){p.taunt=pA?'fold':pB?'dance':'cele';p.tauntT=G.t;G.pt=Math.max(G.pt,1.5);emit('taunt',{p:p.id})}
  }
  if(G.phase!=='play')return;
  const o=opp(p);
  if(pC&&p.s!=='fall'&&p.s!=='getup')doUlt(p);
  if(p===G.holder&&p.s==='dunk'&&p.dk?.save&&pB){
    const u=(G.t-p.dk.saveAt)/DUNK_RESCUE_DURATION;
    resolveDunkRescue(p,Math.abs(u-DUNK_RESCUE_CENTER)<=DUNK_RESCUE_HALF);
    return;
  }
  if(p===G.holder&&p.s==='layup'&&pB&&!p.pull&&!p.relDone){p.pull=true;emit('pull',{p:p.id})}
  if(p===G.holder){
    if(rB&&p.s==='hold'){
      if(p.t<.14){setS(p,'free');p.tapT=G.t}else release(p);
    }
    if(pA&&canAct(p))doMove(p);
    if((pB||(p.b&&p.s==='step'&&G.t-p.stepT<.8&&!G.needClear))&&canAct(p))startShot(p);
  }else if(G.holder===o){
    if(pA&&p.s==='free'&&p.y===0){setS(p,'steal',.34);p.struck=false;p.vx*=.5;p.vz*=.5}
    if(pB&&p.s==='free'&&p.y===0){setS(p,'jump');p.jumpT=G.t;p.vy=5.5;p.y=.01;
      const shooter=opp(p);
      if(G.holder===shooter&&shooter.s==='fake'&&G.t-shooter.fakeT<.52&&!shooter.baitGiven&&dist(shooter,p)<3.1){
        shooter.baitGiven=true;shooter.baitUntil=G.t+1.25;emit('bait',{p:shooter.id});
      }}
  }else if(pB&&p.s==='free'&&p.y===0){setS(p,'jump');p.jumpT=G.t;p.vy=5.5;p.y=.01;
      const shooter=opp(p);
      if(G.holder===shooter&&shooter.s==='fake'&&G.t-shooter.fakeT<.52&&!shooter.baitGiven&&dist(shooter,p)<3.1){
        shooter.baitGiven=true;shooter.baitUntil=G.t+1.25;emit('bait',{p:shooter.id});
      }}
}
const DUNK_RESCUE_DURATION=.18,DUNK_RESCUE_CENTER=.64,DUNK_RESCUE_HALF=.1;
function finishDunk(p){
  const o=opp(p),d=p.dk,b=G.ball;
  d.done=true;b.x=HOOP.x;b.z=HOOP.z;b.y=RIMY-.05;b.vx=b.vz=0;b.vy=-7;
  b.mode='loose';b.make=false;b.touched=true;b.owner=p.id;G.holder=null;
  p.noPick=G.t+1;G.rimKick=1;G.netKick=1;G.shake=1;
  if(ultOn(p)&&p.type==='slash'){p.ultT=0;if(dist(p,o)<2.6&&!DOWN.has(o.s))knock(o,p.id)}
  scored(p.id,2,'dunk');
}
function resolveDunkRescue(p,success){
  const d=p.dk;if(!d?.save)return;
  d.save=false;
  if(success){
    d.rescued=true;d.rescueAt=G.t;p.hand=-p.hand;
    p.y=Math.max(p.y,.85);p.vx=p.vz=0;
    G.slow=Math.min(G.slow,.18);
    emit('pull',{p:p.id,rescue:true});
  }else{
    G.slow=Math.min(G.slow,.18);
    swat(opp(p),p);setS(p,'rel');p.vy=0;
    emit('pullFail',{p:p.id});
  }
}
function dunkStep(p,dt){
  const T1=.15,d=p.dk,o=opp(p),T2=T1+.3+(d.len||0)*.04;
  if(d.save){
    const u=(G.t-d.saveAt)/DUNK_RESCUE_DURATION;
    if(!p.human&&u>=DUNK_RESCUE_CENTER){
      resolveDunkRescue(p,Math.random()<.22+LV[G.level].pull*.28);
    }else if(u>=1)resolveDunkRescue(p,false);
    return;
  }
  if(d.rescued){
    const elapsed=G.t-d.rescueAt;
    if(elapsed<.26){
      const u=clamp(elapsed/.26,0,1),a=Math.atan2(p.x-HOOP.x,p.z-HOOP.z);
      p.x=lerp(p.x,HOOP.x+Math.sin(a)*.27,u*.16);
      p.z=lerp(p.z,HOOP.z+Math.cos(a)*.27,u*.16);
      p.y=.85+.14*Math.sin(u*PI);
      return;
    }
    if(!d.done){
      if(Math.random()<.88)finishDunk(p);
      else{
        d.done=true;looseBall(p,2.8);
        p.noPick=G.t+.28;setS(p,'rel');p.vy=0;
        emit('pullFail',{p:p.id,miss:true});
      }
    }
    return;
  }
  if(p.t<T1){p.x+=p.vx*dt;p.z+=p.vz*dt;return}
  if(!d.flew){d.flew=true;d.x0=p.x;d.z0=p.z;d.len=dH(p);p.vx=p.vz=0;emit('dust',{p:p.id,n:5});return}
  if(p.t<T2){
    const u=(p.t-T1)/(T2-T1),e=u*(2-u),a=Math.atan2(p.x-HOOP.x,p.z-HOOP.z),tx=HOOP.x+Math.sin(a)*.5,tz=HOOP.z+Math.cos(a)*.5;
    p.x=lerp(d.x0,tx,e);p.z=lerp(d.z0,tz,e);p.y=1.0*Math.sin(u*PI/2);
    if(u>.2&&o.y>.3&&!(ultOn(p)&&p.type==='slash')){
      const q=ballPos(p);
      if(hyp(q.x-(o.x+o.fx*.25),q.y-(o.y+2.7),q.z-(o.z+o.fz*.25))<.78+TP[o.type].block){
        d.save=true;d.saveAt=G.t;p.vx=p.vz=0;
        G.slow=Math.max(G.slow,.7);
        emit('dunkRescue',{p:p.id});
        return;
      }
    }
  }else if(!d.done)finishDunk(p);
  else if(p.t>T2+.24){p.y=Math.max(p.y,.6);setS(p,'rel');p.vy=0}
}
function swat(by,victim){
  const b=G.ball,h=victim||G.p[b.owner];gain(by,30);
  if(G.holder){const q=ballPos(G.holder);b.x=q.x;b.y=q.y;b.z=q.z}
  b.mode='pin';b.by=by.id;b.pinT=G.t+.075;b.make=false;b.pts=0;b.touched=true;b.tf=0;b.vx=b.vy=b.vz=0;G.holder=null;h.noPick=G.t+.5;by.swatT=G.t;
  by.blockChaseUntil=G.t+2.3;G.slow=Math.max(G.slow,.15);G.shake=Math.max(G.shake,.65);emit('block',{p:by.id});
}
function inertia(p,vmax,acc,brk,dt){
  const tx=p.ix*p.mag*vmax,tz=p.iz*p.mag*vmax,dvx=tx-p.vx,dvz=tz-p.vz,dv=hyp(dvx,dvz);
  if(dv<1e-4){p.skid*=.9;return}
  const sp=speed(p),opp2=sp>.2?clamp(-(dvx*p.vx+dvz*p.vz)/(dv*sp),0,1):0;
  const a=lerp(acc,brk,opp2),st=Math.min(a*dt,dv);
  p.vx+=dvx/dv*st;p.vz+=dvz/dv*st;
  const sk=sp>2.6&&opp2>.55&&p.mag>.3?1:0;
  if(sk&&p.skid<.2)emit('squeak',{p:p.id,soft:true});
  p.skid=lerp(p.skid,sk,1-Math.exp(-14*dt));
}
function upd(p,dt){
  p.t+=dt;p.cd=Math.max(0,p.cd-dt);for(const k in p.cds)p.cds[k]=Math.max(0,p.cds[k]-dt);
  if(p.shoeLost&&G.t>p.shoeT&&hyp(p.x-p.shoeX,p.z-p.shoeZ)<.95&&p.s!=='fall'&&p.s!=='getup'){p.shoeLost=false;emit('shoeBack',{p:p.id})}
  if(p.strikes===0)p.bal=Math.max(0,p.bal-60*dt);
  p.handV+=(p.hand-p.handV)*(1-Math.exp(-15*dt));
  const pvx=p.vx,pvz=p.vz,sp=speed(p);p.drib+=dt*(6.4+sp*.75);
  const fric=k=>{const f=Math.exp(-k*dt);p.vx*=f;p.vz*=f};
  let steer=false,vmax=(p===G.holder?5.1:(p.human?4.8:4.5))+TP[p.type].v+(ultOn(p)&&p.type==='wall'?.8:0),acc=16,brk=11.5;
  if(p.shoeLost)vmax*=.76;
  if(G.t<p.chaseUntil)vmax+=.4;
  switch(p.s){
    case'free':steer=true;break;
    case'cross':fric(1.1);if(p.t>.22){setS(p,'free');p.drib=.46}break;
    case'step':fric(3.5);if(p.t>.36){setS(p,'free');p.drib=.5}break;
    case'burst':steer=true;vmax=p.burstV;acc=24;brk=15;if(p.t>.42)setS(p,'free');break;
    case'behind':fric(1);if(p.t>.3){setS(p,'free');p.drib=.42}break;
    case'spin':{const f=toHoop(p),u=clamp(p.t/.48,0,1),a=1.15*(1-u),x=p.spinS.x*a+f.x*(.45+u),z=p.spinS.z*a+f.z*(.45+u),l=hyp(x,z)||1;p.vx=x/l*4.8;p.vz=z/l*4.8;if(p.t>.48){setS(p,'free');p.drib=.46}break}
    case'euro':{const f=toHoop(p),sx=-f.z*p.euS,sz=f.x*p.euS,k=p.t<.21?1:-1;p.vx=sx*k*4.9+f.x*3.3;p.vz=sz*k*4.9+f.z*3.3;
      if(!p.euHit&&p.t>.21){p.euHit=true;strike(p,{x:-sx,z:-sz},.95);emit('dust',{p:p.id,n:3})}
      if(p.t>.42){setS(p,'layup');p.vx=f.x*5;p.vz=f.z*5;p.vy=5;p.y=.01;p.relDone=false;p.pull=false}break}
    case'halt':fric(12);if(p.t>.16)setS(p,'free');break;
    case'hold':fric(p.ride||p.fade?.8:p.stepShot?1.6:9);p.meter+=dt/(p.ride||p.fade||p.stepShot?.6:.82);if(!p.jumped&&p.t>.33){p.jumped=true;p.vy=4;p.y=.01}if(p.meter>=1)release(p);break;
    case'rel':fric(3);if(p.y===0&&p.vy===0&&p.t>.05)setS(p,'free');break;
    case'fake':fric(14);if(p.t>.24)setS(p,'free');break;
    case'layup':
      fric(2.2);
      if(!p.relDone&&!p.pull&&p.t>.24){
        const o=opp(p),q=ballPos(p);
        if(o.y>.25&&hyp(q.x-(o.x+o.fx*.25),q.y-(o.y+2.7),q.z-(o.z+o.fz*.25))<.78+TP[o.type].block){swat(o,p);p.relDone=true;setS(p,'rel');break}
      }
      if(!p.relDone&&p.t>(p.pull?.5:.38)){
        p.relDone=true;const o=opp(p),g=dist(p,o);let pr=.96;
        if(!DOWN.has(o.s)&&g<1.25)pr=.72;if(o.y>.3&&g<1.6)pr=.55;
        if(p.dk?.rescued)pr=.83;else if(p.pull)pr=.5;
        const mk=Math.random()<pr;emit('release',{p:p.id,q:'lay'});
        launch(p,mk,2,'lay',.5);
      }break;
    case'dunk':dunkStep(p,dt);break;
    case'steal':steer=true;vmax=1.8;if(!p.struck&&p.t>.1)strikeSteal(p);if(p.t>p.dur)setS(p,'free');break;
    case'jump':fric(1.5);break;
    case'land':fric(10);if(p.t>p.dur)setS(p,'free');break;
    case'stag':fric(3);if(p.t>p.dur)setS(p,'free');break;
    case'fall':fric(4.5);if(p.t>p.dur)setS(p,'getup');break;
    case'getup':fric(14);if(p.t>.6){setS(p,'free');p.bal=0}break;
  }
  if(steer)inertia(p,vmax,acc,brk,dt);else p.skid*=.92;
  if(p.s!=='dunk'){
    p.x+=p.vx*dt;p.z+=p.vz*dt;
    if(p.y>0||p.vy>0){
      p.vy-=GR*dt;p.y+=p.vy*dt;
      if(p.y<=0){p.y=0;p.vy=0;
        if(p.s==='rel'||p.s==='layup')setS(p,'land',.12);
        else if(p.s==='jump')setS(p,'land',.26);
        emit('step',{p:p.id});}
    }
  }
  const lim=W/2-.25;
  if(Math.abs(p.x)>lim){p.x=clamp(p.x,-lim,lim);p.vx=0}
  if(p.z<.35){p.z=.35;p.vz=0}
  if(p.z>D-.15){p.z=D-.15;p.vz=0}
  p.ax=lerp(p.ax,(p.vx-pvx)/dt,1-Math.exp(-18*dt));p.az=lerp(p.az,(p.vz-pvz)/dt,1-Math.exp(-18*dt));
  // 面向：持球面向籃框並順著速度，防守盯人，搶球看球
  const o=opp(p);let tx=0,tz=-1,cur=speed(p);
  if(p===G.holder||p.s==='hold'||p.s==='rel'||p.s==='layup'||p.s==='dunk'){
    const h=toHoop(p);tx=h.x;tz=h.z;
    if(cur>1.6&&p.s!=='hold'&&p.s!=='step'){tx+=p.vx/cur*.9;tz+=p.vz/cur*.9}
  }else if(G.holder===o){const g=dist(p,o)||1;tx=(o.x-p.x)/g;tz=(o.z-p.z)/g}
  else{const b=G.ball,g=hyp(b.x-p.x,b.z-p.z)||1;tx=(b.x-p.x)/g;tz=(b.z-p.z)/g}
  if(p.s!=='fall'&&p.s!=='getup'){
    const a0=Math.atan2(p.fx,p.fz);let a1=Math.atan2(tx,tz),d=a1-a0;
    while(d>PI)d-=2*PI;while(d<-PI)d+=2*PI;
    const r=clamp(d,-13*dt,13*dt),a=a0+r;p.fx=Math.sin(a);p.fz=Math.cos(a);
  }
  // 反應窗：他變向後，你要在時限內把搖桿推向同一邊
  if(p.pend){
    const q=p.pend;q.t+=dt;
    const dot=p.ix*q.D.x+p.iz*q.D.z;
    const kept=p.human?((dot>.05&&p.mag>.2)||p.vx*q.D.x+p.vz*q.D.z>.8):(dot>.4&&p.mag>.35);
    if(kept){
      if(q.t/q.win<.5){gain(p,8);emit('read',{p:p.id})}
      p.pend=null;
    }else if(q.t>=q.win){
      p.pend=null;miss(p,1-p.id);
    }
  }
  p.hist.push(p.x,p.z);if(p.hist.length>96)p.hist.splice(0,2);
}
function past(p,sec){const n=Math.floor(sec/H)*2,i=Math.max(0,p.hist.length-2-n);return p.hist.length?{x:p.hist[i],z:p.hist[i+1]}:{x:p.x,z:p.z}}
function collide(){
  const[a,b]=G.p;
  if(a.s==='fall'||b.s==='fall'||a.s==='dunk'||b.s==='dunk'||Math.abs(a.y-b.y)>1.1)return;
  let dx=b.x-a.x,dz=b.z-a.z,d=hyp(dx,dz);const R=.88;
  if(d>=R||d<1e-4)return;
  dx/=d;dz/=d;const ov=(R-d)/2;a.x-=dx*ov;a.z-=dz*ov;b.x+=dx*ov;b.z+=dz*ov;
  const h=G.holder;
  if(h&&h.s==='burst'){
    const o=opp(h);
    if(speed(o)<2.2&&o.s==='free'){h.vx*=.5;h.vz*=.5;setS(h,'free');emit('bump',{p:o.id})}
    else{const n=h===a?1:-1;o.vx+=dx*n*2.5;o.vz+=dz*n*2.5;miss(o,h.id)}
    return;
  }
  for(const[p,s]of[[a,1],[b,-1]]){const v=p.vx*dx*s+p.vz*dz*s;if(v>0){p.vx-=dx*s*v*.8;p.vz-=dz*s*v*.8}}
}
function scored(owner,pts,kind){
  if(G.phase==='dead'||G.phase==='over')return;
  G.score[owner]+=pts;G.ball.pts=0;G.cele=owner;G.celeT=G.t;gain(G.p[owner],12);{const P=G.p[owner];if(!P.human&&Math.random()<.55){P.taunt=pick(['fold','dance','cele']);P.tauntT=G.t+.3}}
  emit('score',{p:owner,pts,kind});
  G.phase='dead';G.pt=1.35;G.next=1-owner;G.holder=null;
}
function stepBall(dt){
  const b=G.ball;
  if(b.mode==='held'&&G.holder){const q=ballPos(G.holder);b.x=q.x;b.y=q.y;b.z=q.z;return}
  if(b.mode==='pin'){
    const d=G.p[b.by],k=1-Math.exp(-46*dt);b.x+=(d.x+d.fx*.42-b.x)*k;b.y+=(d.y+2.62-b.y)*k;b.z+=(d.z+d.fz*.42-b.z)*k;
    if(G.t>=b.pinT){const side=Math.random()<.5?-1:1,power=rnd(3.3,4.7);b.mode='loose';b.vx=-d.fz*side*power+d.fx*1.25;b.vz=d.fx*side*power+d.fz*1.25;b.vy=-7.5;emit('smack',{p:b.by})}
    return;
  }
  b.tf+=dt;const py=b.y;
  b.vy-=GR*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
  const dx=b.x-HOOP.x,dz=b.z-HOOP.z,hr=hyp(dx,dz)||1e-4;
  if(py>RIMY&&b.y<=RIMY&&hr<RIM-.02&&b.pts>0){
    b.touched=b.touched;G.netKick=1;
    if(b.q==='green'&&!b.touched)G.greenFlash=1;
    scored(b.owner,b.pts,b.q);b.vx*=.2;b.vz*=.2;b.vy*=.55;
    if(b.mode==='air')b.mode='loose';
    b.make=false;
  }
  if(!b.make){
    if(b.z-BR<BOARDZ&&b.z>BOARDZ-.3&&b.vz<0&&Math.abs(b.x)<1&&b.y>2.72&&b.y<3.95){
      b.z=BOARDZ+BR;b.vz*=-.55;b.touched=true;emit('board');
    }
    const cx=HOOP.x+dx/hr*RIM,cz=HOOP.z+dz/hr*RIM,ex=b.x-cx,ey=b.y-RIMY,ez=b.z-cz,ed=hyp(ex,ey,ez);
    if(ed<BR+.04&&ed>1e-4){
      const nx=ex/ed,ny=ey/ed,nz=ez/ed,vn=b.vx*nx+b.vy*ny+b.vz*nz;
      if(vn<0){const k=1.5*vn;b.vx-=k*nx;b.vy-=k*ny;b.vz-=k*nz;b.vx+=rnd(-.3,.3);b.vz+=rnd(-.3,.3);if(!b.touched||Math.abs(vn)>1)emit('rim',{v:Math.abs(vn)});G.rimKick=Math.max(G.rimKick,.35)}
      const pu=BR+.04-ed;b.x+=nx*pu;b.y+=ny*pu;b.z+=nz*pu;b.touched=true;
    }
  }
  if(b.y<BR){
    b.y=BR;
    if(b.vy<0){if(b.vy<-1)emit('bounce',{v:-b.vy});b.vy*=-.64;b.vx*=.84;b.vz*=.84;b.touched=true}
    if(Math.abs(b.vy)<.5){const f=Math.exp(-1.3*dt);b.vx*=f;b.vz*=f}
  }
  const lx=W/2+.3;
  if(Math.abs(b.x)>lx){b.x=clamp(b.x,-lx,lx);b.vx*=-.5}
  if(b.z>D+.3){b.z=D+.3;b.vz*=-.5}
  if(b.z<-.2){b.z=-.2;b.vz*=-.5}
  if(b.mode==='air'&&b.touched)b.mode='loose';
  // 空中封蓋
  if(b.mode==='air'&&b.tf<.32&&!b.safe){
    const d=G.p[1-b.owner],wl=ultOn(d)&&d.type==='wall'?.3:0;
    if(d.y>.2&&hyp(b.x-(d.x+d.fx*.25),b.y-(d.y+2.7),b.z-(d.z+d.fz*.25))<(.72+TP[d.type].block+wl)*(b.ride||1))swat(d,G.p[b.owner]);
  }
  if(b.mode==='loose'&&G.phase==='play'){
    const order=Math.random()<.5?[0,1]:[1,0];
    for(const i of order){
      const p=G.p[i];if(G.t<p.noPick||p.s==='fall'||p.s==='getup'||p.s==='dunk')continue;
      if(hyp(b.x-p.x,b.z-p.z)<.82&&b.y<p.y+2.5){give(p);break}
    }
  }
}
/* 對手 AI：走同一套輸入與慣性，所以他也會滑、也會被你騙 */
function ai(p,dt){
  p.a=false;
  if(G.phase!=='play'){p.ix=p.iz=p.mag=0;p.b=false;p.c=false;return}
  const L=LV[G.level],o=opp(p);
  if(G.holder===p)aiOff(p,o,L,dt);else if(G.holder===o)aiDef(p,o,L,dt);else aiLoose(p,o,L);
}
function steerTo(p,tx,tz,soft){const dx=tx-p.x,dz=tz-p.z,l=hyp(dx,dz);if(l<.03){p.ix=p.iz=p.mag=0;return}p.ix=dx/l;p.iz=dz/l;p.mag=clamp(l/soft,0,1)}
function aiOff(p,o,L,dt){
  if(p.s==='hold'){p.b=p.meter<p.aiRel;return}
  p.b=false;p.c=false;
  if(p.s==='layup'){if(o.y>.12&&dist(p,o)<2.2&&!p.pull&&!p.aiPulled){p.aiPulled=true;p.b=Math.random()<L.pull}return}
  p.aiPulled=false;
  if(p.en>=100){const ty=p.type,dd=dH(p);if((ty==='slash'&&dd<5)||(ty==='shoot'&&dd<ARC+1)){p.c=true}}
  if(p.shoeLost&&G.t>p.shoeT&&hyp(p.x-p.shoeX,p.z-p.shoeZ)<4.5){steerTo(p,p.shoeX,p.shoeZ,.5);p.aiT-=dt;return}
  const d=dH(p),gap=dist(p,o),down=DOWN.has(o.s),f=toHoop(p);
  p.aiGT-=dt;
  if(!p.aiG||p.aiGT<=0||hyp(p.aiG.x-p.x,p.aiG.z-p.z)<.8){
    p.aiGT=rnd(.9,1.8);
    if(G.needClear){const a=Math.atan2(p.x-HOOP.x,p.z-HOOP.z)||.01,r=ARC+1.5;p.aiG={x:clamp(HOOP.x+Math.sin(a)*r,-5,5),z:clamp(HOOP.z+Math.abs(Math.cos(a))*r,6,10)}}
    else p.aiG={x:rnd(-3.2,3.2),z:rnd(1.8,5)};
  }
  steerTo(p,p.aiG.x,p.aiG.z,.8);
  if(down)steerTo(p,HOOP.x,HOOP.z+.6,.8);
  p.aiT-=dt;
  if(p.aiT>0||!canAct(p))return;
  p.aiT=rnd(.14,.36);
  if(o.strikes>0&&!DOWN.has(o.s)&&p.cd<=0&&Math.random()<.6){const s=p.hand>0?-1:1;p.ix=-f.z*s;p.iz=f.x*s;p.mag=1;p.a=true;return}
  if(G.needClear)return;
  const shoot=()=>{
    if(d>=LAY&&Math.random()<.13){doFake(p);return}
    p.b=true;p.aiRel=SHOT_MID+gauss()*L.aim;
    if(d>=LAY&&gap<2&&Math.random()<.45){p.ix=-f.x;p.iz=-f.z;p.mag=1}
    else if(d<LAY&&d>1.7&&gap<2.4&&Math.random()<.5){const s=Math.random()<.5?1:-1;p.ix=-f.z*s;p.iz=f.x*s;p.mag=1}
  };
  if(d<LAY&&(d<2.6||gap>1.6||speed(p)>3.2)){shoot();return}
  if(G.clock<1.8){shoot();return}
  if(down&&(gap>2.2)&&d<ARC+.8&&Math.random()<.4){shoot();return}
  if(gap>2.4&&d<ARC+1&&Math.random()<.5){shoot();return}
  if(gap>1.75&&d>3.2&&d<ARC+.2&&Math.random()<.3){shoot();return}
  if(gap<2.9&&Math.random()<L.move){
    const r=Math.random();
        if(r<.55){const s=Math.random()<.5?1:-1;p.ix=-f.z*s;p.iz=f.x*s;p.mag=1}
    else if(r<.75&&d<ARC+1.4){p.ix=-f.x;p.iz=-f.z;p.mag=1}
    else{p.ix=f.x;p.iz=f.z;p.mag=1}
    p.a=true;
  }
}
function aiDef(p,o,L,dt){
  const s=past(o,L.react),nx=HOOP.x-s.x,nz=HOOP.z+.4-s.z,nl=hyp(nx,nz)||1,sag=hyp(s.x-HOOP.x,s.z-HOOP.z)>ARC+1.3?2.5:1.5;
  steerTo(p,s.x+nx/nl*sag,s.z+nz/nl*sag,.7);
  if(p.pend){
    if(p.pend!==p.aiP){p.aiP=p.pend;p.aiRe=Math.random()<L.read?L.react+rnd(0,.05):9}
    if(p.pend.t>=p.aiRe){p.ix=p.pend.D.x;p.iz=p.pend.D.z;p.mag=1}
  }
  p.b=false;p.c=false;p.aiCd-=dt;
  const gap=dist(p,o);
  if(p.en>=100&&p.type==='wall'&&gap<3)p.c=true;
  if(o.s==='free'||o.s==='cross'||o.s==='burst'){p.aiB=null;p.aiF=false}
  if(p.s!=='free')return;
  if(o.s==='hold'&&gap<2.8){if(!p.aiB)p.aiB={at:rnd(.25,.5)};if(o.t>=p.aiB.at)p.b=true}
  else if(o.s==='fake'&&gap<2.8&&!p.aiF){p.aiF=true;if(Math.random()<L.bite){p.b=true;if(o.human)emit('bit',{p:o.id})}}
  else if((o.s==='layup'||o.s==='dunk')&&gap<2.2&&!p.aiB){p.aiB={at:0};p.b=Math.random()<L.block}
  if(gap<1.7&&p.aiCd<=0&&Math.random()<L.steal*dt*1.4){p.a=true;p.aiCd=1.3}
}
function aiLoose(p,o,L){
  p.c=false;const b=G.ball;steerTo(p,b.x+b.vx*.25,b.z+b.vz*.25,.5);p.b=false;
  if(p.s==='free'&&b.y>2.4&&b.y<4.2&&hyp(b.x-p.x,b.z-p.z)<1.2&&Math.random()<.04)p.b=true;
}
function step(dt){
  G.t+=dt;
  const[a,b]=G.p;
  if(G.phase==='check'){
    G.pt+=dt;const k=1-Math.exp(-6.5*dt);
    for(const p of G.p){const dx=p.tx-p.x,dz=p.tz-p.z;p.x+=dx*k;p.z+=dz*k;p.vx=clamp(dx*6.5,-6,6);p.vz=clamp(dz*6.5,-6,6);p.fx=lerp(p.fx,0,.02);p.fz=lerp(p.fz,-1,.02);const l=hyp(p.fx,p.fz)||1;p.fx/=l;p.fz/=l;p.drib+=dt*7;p.handV=p.hand;p.t+=dt;
      {const I=INP[p.id];p.pa=p.human?I.a:false;p.pb=p.human?I.b:false;p.b=p.human?I.b:false;p.pc=p.c=p.human?I.c:false}}
    G.p[1-G.off].fz=1;G.p[1-G.off].fx=0;
    if(G.pt>.95){G.phase='play';for(const p of G.p){p.vx=p.vz=0}emit('go',{off:G.off})}
    stepBall(dt);return;
  }
  for(const p of G.p){
    if(p.human){
      const I=INP[p.id];p.ix=I.x;p.iz=I.z;p.mag=I.mag;p.a=I.a||I.tapA;p.b=I.b||I.tapB;p.c=I.c||I.tapC;I.tapA=I.tapB=I.tapC=false;
      // 持球往籃框方向時微微吸附，切入更好走直線
      if(G.holder===p&&p.mag>.3){const f=toHoop(p),d=p.ix*f.x+p.iz*f.z;if(d>.9){p.ix=f.x;p.iz=f.z}}
    }else ai(p,dt);
  }
  actions(a);actions(b);
  upd(a,dt);upd(b,dt);collide();stepBall(dt);
  G.rimKick*=Math.exp(-5*dt);G.netKick*=Math.exp(-4*dt);G.greenFlash*=Math.exp(-4*dt);G.shake*=Math.exp(-7*dt);
  if(G.phase==='play'&&G.holder){
    if(G.needClear&&isThree(G.holder)){G.needClear=false;emit('cleared',{p:G.holder.id,step:G.holder.s==='step'})}
    G.clock-=dt;
    if(G.clock<=0){G.clock=0;const h=G.holder;if(h.s==='hold'){h.s='free'}emit('clock');looseBall(h,1);endPossession(1-G.off,.75)}
  }
  if(G.phase==='dead'){
    G.pt-=dt;
    if(G.pt<=0){
      const top=Math.max(...G.score);
      if(top>=WIN){if(G.attract){G.score=[0,0];toCheck(G.next)}else{G.phase='over';emit('over')}}
      else toCheck(G.next);
    }
  }
}


let acc=0;
function advance(dt,onStep){
  const ts=G.slow>0?.26:1;if(G.slow>0)G.slow-=dt;
  acc+=dt*ts;let n=0;
  while(acc>=H&&n<14&&G.phase!=='over'){step(H);acc-=H;n++;if(onStep)onStep()}
  return ts;
}
const n3=v=>typeof v==='number'?Math.round(v*1e3)/1e3:v;
const PK=['x','z','y','vy','vx','vz','ax','az','fx','fz','ix','iz','mag','s','t','dur','bal','cd','hand','handV','drib','meter','jumped','stepT','noPick','skid','tx','tz','type','en','ultT','strikes','strikeT','burstV','stepShot','swatT','pull','ride','fade','shoeLost','shoeX','shoeZ','shoeT','taunt','tauntT','moveT','last','tapT','struck','relDone','euS','euHit','spinDir','pa','pb','pc','fakeT','baitGiven','baitUntil','jumpT','blockChaseUntil','chaseUntil','whiffUntil'];
const BK=['mode','x','y','z','vx','vy','vz','make','pts','owner','tf','touched','q','safe','ride','by','pinT'];
function snap(){
  const b=G.ball;
  return{g:[G.t,G.phase,G.pt,G.off,G.next,G.holder?G.holder.id:-1,G.clock,G.needClear,G.score,G.slow,G.cele,G.celeT,G.finale,G.winner,G.camT,G.camP?G.camP.id:-1,G.rimKick,G.netKick,G.greenFlash,G.shake].map(n3),
    b:BK.map(k=>n3(b[k])),p:G.p.map(p=>[PK.map(k=>n3(p[k])),p.cds,p.pend,p.spinS,p.dk])};
}
function restore(st){
  const g=st.g;[G.t,G.phase,G.pt,G.off,G.next]=g;G.holder=g[5]<0?null:G.p[g[5]];
  G.clock=g[6];G.needClear=g[7];G.score=g[8];G.slow=g[9];G.cele=g[10];G.celeT=g[11];G.finale=g[12];G.winner=g[13];G.camT=g[14];G.camP=g[15]<0?null:G.p[g[15]];G.rimKick=g[16];G.netKick=g[17];G.greenFlash=g[18];G.shake=g[19];
  BK.forEach((k,i)=>{G.ball[k]=st.b[i]});
  G.p.forEach((p,i)=>{const r=st.p[i];PK.forEach((k,j)=>{p[k]=r[0][j]});p.cds=r[1];p.pend=r[2];p.spinS=r[3];p.dk=r[4]});
}
return{clamp,lerp,hyp,PI,rnd,gauss,pick,TP,CD,MV,LV,H,GR,BR,RIMY,HOOP,RIM,BOARDZ,W,D,ARC,CORNER,WIN,LAY,SHOT_MID,G,INP,step,advance,snap,restore,newGame,toCheck,knock,setS,startShot,ballPos,opp,dH,isThree,toHoop,dist,speed,DOWN,canDunk,moveKind,spinReady,ultOn,greenW,contestPenalty,DUNK_RESCUE_DURATION,DUNK_RESCUE_CENTER,DUNK_RESCUE_HALF};
}

export { createSim };
