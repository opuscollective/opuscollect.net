// Behaviour for the Opus Collective pages carried over from the v23 site (waitlist form, countdown, reveals, carousels).
// @ts-nocheck
const form=document.querySelector('#waitlist-form');if(form){form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button');const status=document.querySelector('#form-status');button.disabled=true;status.textContent='Adding you to the list…';try{const body=Object.fromEntries(new FormData(form));body.interest=new URLSearchParams(location.search).get('interest')||'membership';const response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Something went wrong.');status.textContent=data.returning?"You’re already on the list. We updated your details.":"You’re on the list. Opus will reach out when there’s news. You can join the Discord now.";form.reset();}catch(error){status.textContent=error.message+' Please try again.';}finally{button.disabled=false;}});}

(function(){
var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/* countdown */
var target=new Date('2026-10-16T00:00:00-05:00').getTime(),last={};
function pad(n){return String(n).padStart(2,'0');}
function tick(){var now=Date.now(),diff=Math.max(0,target-now);var d=Math.floor(diff/864e5);diff-=d*864e5;var h=Math.floor(diff/36e5);diff-=h*36e5;var m=Math.floor(diff/6e4);diff-=m*6e4;var s=Math.floor(diff/1e3);var v={d:pad(d),h:pad(h),m:pad(m),s:pad(s)};
document.querySelectorAll('[data-cd]').forEach(function(el){var k=el.getAttribute('data-cd');if(k==='label'){if(now>=target&&el.dataset.live)el.textContent=el.dataset.live;return;}if(el.textContent!==v[k]){el.textContent=v[k];if(!reduce&&last[k]!==undefined){el.classList.remove('tick');void el.offsetWidth;el.classList.add('tick');}}});last=v;}
if(document.querySelector('[data-cd]')){tick();setInterval(tick,1000);}
/* timeline */
document.querySelectorAll('.opus-timeline').forEach(function(tl){var a=new Date(tl.dataset.start).getTime(),b=new Date(tl.dataset.end).getTime();function pct(t){return Math.min(100,Math.max(0,(t-a)/(b-a)*100));}var now=Date.now();tl.style.setProperty('--now',pct(now)+'%');tl.querySelectorAll('[data-date]').forEach(function(el){var t=new Date(el.dataset.date).getTime();el.style.left=pct(t)+'%';if(el.classList.contains('opus-tl-dot')&&now>=t)el.classList.add('done');});});
/* split words */
document.querySelectorAll('[data-words]').forEach(function(p){var i=0;(function walk(node){Array.prototype.slice.call(node.childNodes).forEach(function(c){if(c.nodeType===3){var frag=document.createDocumentFragment();c.textContent.split(/(\s+)/).forEach(function(part){if(!part)return;if(/^\s+$/.test(part)){frag.appendChild(document.createTextNode(part));return;}var w=document.createElement('span');w.className='w';w.style.setProperty('--wi',i++);w.textContent=part;frag.appendChild(w);});node.replaceChild(frag,c);}else if(c.nodeType===1){walk(c);}});})(p);});
/* auto-tag subpage content */
document.querySelectorAll('main section:not(.opus-home-hero):not(#explore)').forEach(function(sec){if(sec.querySelector('[data-reveal]'))return;var k=0;sec.querySelectorAll('.opus-container > *').forEach(function(el){if(el.closest('[data-reveal]'))return;var st=el.getAttribute('style')||'';if(/display: grid/.test(st)&&el.children.length>1){Array.prototype.forEach.call(el.children,function(c,j){c.setAttribute('data-reveal','');c.style.setProperty('--d',Math.min(j,6)*0.08+'s');});}else{el.setAttribute('data-reveal','');el.style.setProperty('--d',Math.min(k++,4)*0.1+'s');}});});
/* reveal on scroll */
var els=document.querySelectorAll('[data-reveal],[data-words]');
if(reduce||!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('is-in');});return;}
var io=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add('is-in');io.unobserve(en.target);}});},{threshold:0.15,rootMargin:'0px 0px -6% 0px'});
els.forEach(function(e){io.observe(e);});
})();
(function(){
/* release timeline: line fills with scroll, nodes light as you pass them */
var rtl=document.querySelector('[data-rtl]');
if(rtl){var items=rtl.querySelectorAll('.opus-tl-item');var ticking=false;
function update(){ticking=false;var r=rtl.getBoundingClientRect(),mark=window.innerHeight*0.6;
if(getComputedStyle(rtl).display==='grid'){/* left-to-right timeline: fills across as you scroll down to it */
var p=Math.min(1,Math.max(0,(window.innerHeight*0.85-r.top)/(r.height*0.75)));rtl.style.setProperty('--p',p.toFixed(4));
items.forEach(function(it){var n=it.querySelector('.opus-tl-node').getBoundingClientRect();it.classList.toggle('lit',p>0&&(n.left+n.width/2-r.left)/r.width<=p+0.001);});return;}
var p=Math.min(1,Math.max(0,(mark-r.top)/r.height));rtl.style.setProperty('--p',p.toFixed(4));
items.forEach(function(it){var n=it.querySelector('.opus-tl-node').getBoundingClientRect();it.classList.toggle('lit',n.top+n.height/2<mark);});}
window.addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(update);}},{passive:true});window.addEventListener('resize',update);update();}
/* shelf arrows */
document.querySelectorAll('[data-shelf]').forEach(function(btn){btn.addEventListener('click',function(){var row=btn.closest('.opus-shelf').querySelector('.opus-shelf-row');row.scrollBy({left:row.clientWidth*0.8*Number(btn.dataset.shelf),behavior:'smooth'});});});
})();
(function(){
/* rotating community spotlight */
var root=document.querySelector('[data-spot]');if(!root)return;
var slides=root.querySelectorAll('.opus-spot-slide'),dots=root.querySelectorAll('.opus-spot-dot'),n=slides.length,i=0,timer=null,MS=6000;
var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
root.style.setProperty('--spot-ms',MS+'ms');
function show(k){i=(k+n)%n;slides.forEach(function(s,j){var on=j===i;s.classList.toggle('is-active',on);if(on)s.removeAttribute('aria-hidden');else s.setAttribute('aria-hidden','true');s.querySelectorAll('a').forEach(function(a){if(on)a.removeAttribute('tabindex');else a.setAttribute('tabindex','-1');});});
dots.forEach(function(d,j){d.classList.toggle('is-active',j===i);var sp=d.querySelector('span');if(j===i){var c=sp.cloneNode(true);d.replaceChild(c,sp);}});
root.style.setProperty('--spot-img',"url('"+slides[i].dataset.img+"')");}
function play(){if(reduce)return;stop();root.classList.add('is-playing');root.classList.remove('is-paused');timer=setInterval(function(){show(i+1);},MS);}
function stop(){clearInterval(timer);timer=null;}
function pause(){stop();root.classList.add('is-paused');}
root.querySelectorAll('[data-step]').forEach(function(b){b.addEventListener('click',function(){show(i+Number(b.dataset.step));play();});});
dots.forEach(function(d){d.addEventListener('click',function(){show(Number(d.dataset.go));play();});});
root.addEventListener('mouseenter',pause);root.addEventListener('mouseleave',play);
root.addEventListener('focusin',pause);root.addEventListener('focusout',function(e){if(!root.contains(e.relatedTarget))play();});
document.addEventListener('visibilitychange',function(){if(document.hidden)pause();else play();});
/* swipe on touch */
var x0=null;root.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});root.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>50){show(i+(dx<0?1:-1));play();}x0=null;});
/* preload covers */
slides.forEach(function(s){var im=new Image();im.src=s.dataset.img;});
play();
})();

// v21: touch screens. Phones get a swipe deck of the four cards; tablets color the card in the middle of the screen.
(()=>{const grid=document.querySelector('.opus-explore-grid');if(!grid||!('IntersectionObserver' in window))return;
if(matchMedia('(hover:hover) and (pointer:fine)').matches)return;
const cards=[...grid.querySelectorAll('.opus-explore-card')];const mq=matchMedia('(max-width:760px)');
let order=cards.map((_,i)=>i),io,dots,hint;
function render(){order.forEach((ci,pos)=>{cards[ci].dataset.pos=pos;cards[ci].classList.toggle('is-live',pos===0);});
 if(dots)[...dots.children].forEach((d,k)=>d.classList.toggle('on',k===order[0]));}
function next(dir){const top=cards[order[0]];top.classList.remove('is-dragging');top.style.transition='transform .35s ease-in, opacity .35s';
 top.style.transform=`translateX(${dir*120}%) rotate(${dir*14}deg)`;top.style.opacity='0';
 setTimeout(()=>{top.style.transition='none';order.push(order.shift());top.style.transform='';top.style.opacity='';render();void top.offsetWidth;top.style.transition='';},340);}
function goTo(i){if(order[0]===i)return;while(order[0]!==i)order.push(order.shift());render();}
function deckOn(){grid.classList.add('opus-deck');
 dots=document.createElement('div');dots.className='opus-explore-dots';
 cards.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Show card '+(i+1)+' of '+cards.length);b.onclick=()=>goTo(i);dots.append(b);});
 hint=document.createElement('span');hint.className='opus-deck-hint';hint.textContent='Swipe to explore';
 grid.after(dots);dots.after(hint);render();}
function deckOff(){grid.classList.remove('opus-deck');cards.forEach(c=>{delete c.dataset.pos;c.style.transform='';});dots&&dots.remove();hint&&hint.remove();dots=hint=null;}
// drag on the top card
let sx=0,sy=0,dx=0,drag=false,moved=false,card=null;
grid.addEventListener('pointerdown',e=>{if(!grid.classList.contains('opus-deck'))return;card=e.target.closest('.opus-explore-card');if(!card||card.dataset.pos!=='0'){card=null;return;}sx=e.clientX;sy=e.clientY;dx=0;drag=true;moved=false;});
grid.addEventListener('pointermove',e=>{if(!drag||!card)return;dx=e.clientX-sx;const dy=e.clientY-sy;
 if(!moved&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){drag=false;return;}
 if(Math.abs(dx)>6){moved=true;card.classList.add('is-dragging');card.style.transform=`translateX(${dx}px) rotate(${dx/18}deg)`;}});
function end(){if(!drag||!card){drag=false;return;}drag=false;card.classList.remove('is-dragging');
 if(Math.abs(dx)>80)next(dx>0?1:-1);else card.style.transform='';}
grid.addEventListener('pointerup',end);grid.addEventListener('pointercancel',()=>{if(card){card.classList.remove('is-dragging');card.style.transform='';}drag=false;});
grid.addEventListener('click',e=>{if(moved){e.preventDefault();moved=false;}},true);
function setup(){if(io)io.disconnect();cards.forEach(c=>c.classList.remove('is-live'));
 if(mq.matches){deckOn();}else{deckOff();io=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('is-live',e.isIntersecting)),{rootMargin:'-42% 0px -42% 0px'});cards.forEach(c=>io.observe(c));}}
setup();(mq.addEventListener?mq.addEventListener('change',()=>{deckOff();setup();}):mq.addListener(()=>{deckOff();setup();}));})();

// v21: hero countdown. Counts down to Amazing, then switches to Scenic once Amazing is out.
(()=>{const box=document.querySelector('[data-hero-cd]');if(!box)return;
const drops=[
 {date:'2026-10-16T00:00:00-05:00',cover:'images/amazing-cover.jpg',alt:'Amazing cover art',eyebrow:'The first ever release under Opus Collective',day:'October 16',url:'https://ditto.fm/amazing-bogo',name:'Amazing'},
 {date:'2026-10-26T00:00:00-05:00',cover:'images/scenic-cover.jpg',alt:'Scenic cover art',eyebrow:'The first ever project under Opus Collective',day:'October 26',url:'https://ditto.fm/scenic-bogo',name:'Scenic'}
].map(r=>({...r,t:new Date(r.date).getTime()}));
const q=k=>box.querySelector('[data-hcd="'+k+'"]');const pad=n=>String(n).padStart(2,'0');let shown=null;
function tick(){const now=Date.now();const r=drops.find(x=>x.t>now)||drops[drops.length-1];
 if(shown!==r.name){shown=r.name;const c=q('cover');c.src=r.cover;c.alt=r.alt;q('eyebrow').textContent=r.eyebrow;box.href=r.url;}
 const live=now>=r.t;box.setAttribute('aria-label',(live?'Listen to ':'Presave ')+r.name+', '+r.eyebrow.toLowerCase()+(live?', out now':', out '+r.day));
 q('foot').textContent=live?'Out now · Listen →':'Out '+r.day+' · Presave →';
 let diff=Math.max(0,r.t-now);const d=Math.floor(diff/864e5);diff-=d*864e5;const h=Math.floor(diff/36e5);diff-=h*36e5;const m=Math.floor(diff/6e4);diff-=m*6e4;const s=Math.floor(diff/1e3);
 const v={d,h,m,s};for(const k in v){const el=q(k),t=pad(v[k]);if(el.textContent!==t)el.textContent=t;}}
tick();setInterval(tick,1000);})();

// v21: interactive left-to-right release timeline (tablet and up)
(()=>{const rtl=document.querySelector('[data-rtl]');if(!rtl)return;
const items=[...rtl.querySelectorAll('.opus-tl-item')];const today=rtl.querySelector('.opus-rtl-today');
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function layout(){const horiz=getComputedStyle(rtl).display==='grid';rtl.classList.toggle('is-h',horiz);if(!horiz)return;
 const r=rtl.getBoundingClientRect(),now=Date.now();
 const pts=items.map(it=>{const n=it.querySelector('.opus-tl-node').getBoundingClientRect();return {x:n.left+n.width/2-r.left,t:new Date(it.dataset.date).getTime(),it};});
 let x;const first=pts[0],last=pts[pts.length-1];
 if(now<=first.t){const lead=30*864e5;x=first.x*Math.max(0,Math.min(1,1-(first.t-now)/lead));}
 else if(now>=last.t){x=Math.min(r.width,last.x+(r.width-last.x)*Math.min(1,(now-last.t)/(60*864e5)));}
 else{for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];if(now>=a.t&&now<b.t){x=a.x+(b.x-a.x)*(now-a.t)/(b.t-a.t);break;}}}
 rtl.style.setProperty('--today',x.toFixed(1)+'px');rtl.style.setProperty('--todayf',(x/r.width).toFixed(4));
 let nextSet=false;pts.forEach(p=>{const out=now>=p.t;p.it.classList.toggle('is-out',out);const nx=!out&&!nextSet;if(nx)nextSet=true;p.it.classList.toggle('is-next',nx);});}
layout();addEventListener('resize',layout);setInterval(layout,60000);
// hover: focus one release, dim the others
items.forEach(it=>{const on=()=>{rtl.classList.add('has-focus');it.classList.add('is-focus');},off=()=>{rtl.classList.remove('has-focus');it.classList.remove('is-focus');};
 it.addEventListener('mouseenter',on);it.addEventListener('mouseleave',off);it.addEventListener('focusin',on);it.addEventListener('focusout',off);
 const art=it.querySelector('.opus-tl-art'),img=art&&art.querySelector('img');if(img)it.style.setProperty('--art',`url("${img.getAttribute('src')}")`);
 // 3D tilt + glare on the cover
 if(art&&fine&&!reduce){art.addEventListener('pointermove',e=>{const b=art.getBoundingClientRect(),px=(e.clientX-b.left)/b.width,py=(e.clientY-b.top)/b.height;
  art.style.setProperty('--rx',((.5-py)*10).toFixed(2)+'deg');art.style.setProperty('--ry',((px-.5)*12).toFixed(2)+'deg');art.style.setProperty('--gx',(px*100).toFixed(1)+'%');art.style.setProperty('--gy',(py*100).toFixed(1)+'%');});
  art.addEventListener('pointerleave',()=>{art.style.setProperty('--rx','0deg');art.style.setProperty('--ry','0deg');});}
 // click a date or dot to jump focus to that card
 const date=it.querySelector('.opus-tl-date');if(date){date.style.cursor='pointer';date.addEventListener('click',()=>{const b=it.querySelector('.opus-btn');b&&b.focus({preventScroll:true});it.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'});});}
});})();

// v21: release carousel. Drag the timeline (or the cards) to move between releases.
(()=>{const rc=document.querySelector('[data-rc]');if(!rc)return;
const vp=rc.querySelector('.opus-rc-viewport'),track=rc.querySelector('.opus-rc-track'),slides=[...rc.querySelectorAll('.opus-rc-slide')],
 scrub=rc.querySelector('.opus-rc-scrub'),handle=rc.querySelector('.opus-rc-handle'),stops=[...rc.querySelectorAll('.opus-rc-stop')];
const n=slides.length,max=n-1,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let pos=0,target=0,raf=0,W=400,G=32;
function measure(){const vw=vp.clientWidth;W=Math.min(420,Math.max(260,vw<700?vw*0.78:vw*0.34));G=vw<700?16:Math.max(24,vw*0.03);
 rc.style.setProperty('--rc-w',W+'px');slides.forEach(s=>s.style.width=W+'px');
 track.style.height='auto';const h=Math.max(...slides.map(s=>s.querySelector('.opus-tl-card').offsetHeight));rc.style.setProperty('--rc-h',h+'px');track.style.height=h+'px';render();}
function render(){const vw=vp.clientWidth,cx=vw/2;
 slides.forEach((s,i)=>{const d=i-pos,ad=Math.abs(d);const x=cx-W/2+d*(W+G)*(1-Math.min(ad,1)*0.06);const sc=1-Math.min(ad,1.5)*0.12;
  s.style.transform=`translateX(${x}px) scale(${sc})`;s.style.opacity=String(Math.max(0.25,1-ad*0.55));s.style.zIndex=String(10-Math.round(ad*2));s.style.filter=ad>0.05?`brightness(${1-Math.min(ad,1)*0.35})`:'none';
  const act=Math.round(pos)===i;s.classList.toggle('is-active',act);s.setAttribute('aria-hidden',act?'false':'true');});
 const f=pos/max;rc.style.setProperty('--rc-f',f.toFixed(4));const ai=Math.round(pos);
 stops.forEach((b,i)=>{b.classList.toggle('is-active',i===ai);b.classList.toggle('passed',i/max<=f+0.001);});
 handle.setAttribute('aria-valuenow',String(ai));handle.setAttribute('aria-valuetext',stops[ai].querySelector('.opus-rc-lab').textContent);}
const SNAP=0.14;/* how close (in releases) the handle must be to a date to snap */
function settle(p){const n=Math.round(p);return Math.abs(p-n)<=SNAP?n:p;}
function magnet(p){const n=Math.round(p),d=p-n;return Math.abs(d)<SNAP?n+d*Math.abs(d)/SNAP:p;}
let ease=0.1;function animate(){if(raf)return;if(reduce){pos=target;render();return;}const step=()=>{pos+=(target-pos)*ease;if(Math.abs(target-pos)<0.0005)pos=target;render();raf=pos!==target?requestAnimationFrame(step):0;};raf=requestAnimationFrame(step);}
function go(i){ease=0.085;target=Math.max(0,Math.min(max,i));rc.classList.add('was-used');animate();}
// drag on the timeline
let dragging=false,mode=null,sx=0,spos=0,moved=false;
function fromScrub(e){const r=scrub.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*max;}
scrub.addEventListener('pointerdown',e=>{if(e.target.closest('.opus-rc-stop')&&!e.target.closest('.opus-rc-handle')){return;}dragging=true;mode='scrub';scrub.setPointerCapture(e.pointerId);rc.classList.add('is-dragging','was-used');ease=0.22;target=magnet(fromScrub(e));animate();});
scrub.addEventListener('pointermove',e=>{if(dragging&&mode==='scrub'){ease=0.22;target=magnet(fromScrub(e));animate();}});
// drag on the cards
vp.addEventListener('pointerdown',e=>{dragging=true;mode='cards';sx=e.clientX;spos=target;moved=false;});
addEventListener('pointermove',e=>{if(!dragging||mode!=='cards')return;const dx=e.clientX-sx;if(Math.abs(dx)>6){moved=true;rc.classList.add('is-dragging','was-used');}
 if(moved){ease=0.25;target=magnet(Math.max(-0.15,Math.min(max+0.15,spos-dx/(W+G))));animate();}});
function end(){if(!dragging)return;dragging=false;rc.classList.remove('is-dragging');
 if(mode==='scrub'||moved){go(settle(Math.max(0,Math.min(max,target))));}mode=null;}
addEventListener('pointerup',end);addEventListener('pointercancel',end);
vp.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;return;}const s=e.target.closest('.opus-rc-slide');if(s&&!s.classList.contains('is-active')){e.preventDefault();go(+s.dataset.i);}},true);
stops.forEach((b,i)=>b.addEventListener('click',()=>go(i)));
handle.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();go(Math.round(target)+1);}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();go(Math.round(target)-1);}if(e.key==='Home'){e.preventDefault();go(0);}if(e.key==='End'){e.preventDefault();go(max);}});
addEventListener('resize',measure);if(document.fonts)document.fonts.ready.then(measure);addEventListener('load',measure);measure();})();

// v21: home header turns solid after the hero
(()=>{const b=document.body;if(!b.classList.contains('opus-home'))return;const hero=document.querySelector('.opus-home-hero');
const f=()=>b.classList.toggle('is-scrolled',scrollY>(hero?hero.offsetHeight*0.55:300));addEventListener('scroll',f,{passive:true});f();})();
