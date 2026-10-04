const COLORS=['red','yellow','green','blue'];
const SYM={skip:'⊘',rev:'⇄','+2':'+2','+4':'+4',W:'★'};
const HEX={red:'#e63946',yellow:'#ffc233',green:'#2fae66',blue:'#2778e0'};
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let peer=null,isHost=false,hostConn=null,code='',myName='',lobby=[],S=null,view=null,namesShown=[];

function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on',s.id===id));
  $('topbar').style.display=id==='hub'?'none':'flex';
  $('chatbtn').hidden=!(id==='lobby'||id==='game');
  document.querySelector('.foot').style.display=id==='game'?'none':'';
  if($('chatbtn').hidden)$('chat').hidden=true;
}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),3500);}
function overlay(t,s,b,fn){$('overT').textContent=t;$('overS').textContent=s;$('overB').textContent=b;$('overB').onclick=fn;$('over').classList.add('on');}
function myname(){
  const n=$('name').value.trim().slice(0,12)||'Player';
  try{localStorage.setItem('uno-name',n);}catch(e){}
  return n;
}
try{const n=localStorage.getItem('uno-name');if(n)$('name').value=n;}catch(e){}
if(location.hash.length>=5){$('code').value=location.hash.slice(1,5).toUpperCase();show('home');}
$('playuno').onclick=()=>show('home');
$('brand').onclick=e=>{e.preventDefault();if(peer&&!confirm('Leave the current room and go back to all games?'))return;reset();show('hub');};

/* ---------- connection ---------- */
function reset(){
  if(peer){try{peer.destroy();}catch(e){}}
  peer=null;isHost=false;hostConn=null;lobby=[];S=null;view=null;
  $('over').classList.remove('on');$('colorModal').classList.remove('on');
  chatClear();unread=0;$('chatbadge').hidden=true;
  show('home');
}
function makeCode(){const L='ABCDEFGHJKLMNPQRSTUVWXYZ';return Array.from({length:4},()=>L[Math.random()*L.length|0]).join('');}
function createRoom(){
  myName=myname();isHost=true;code=makeCode();
  peer=new Peer('unoparty-'+code);
  peer.on('open',()=>{lobby=[{name:myName,bot:false,conn:null}];show('lobby');sendLobby();});
  peer.on('error',e=>{
    if(e.type==='unavailable-id'){peer.destroy();createRoom();}
    else{toast('Connection problem ('+e.type+'). Try again.');reset();}
  });
  peer.on('connection',c=>{
    c.on('data',m=>onHostData(c,m));
    c.on('close',()=>onGuestLeft(c));
  });
}
function joinRoom(){
  myName=myname();code=$('code').value.trim().toUpperCase();
  if(code.length!==4)return toast('Enter the 4-letter room code.');
  peer=new Peer();
  peer.on('open',()=>{
    hostConn=peer.connect('unoparty-'+code,{reliable:true});
    const t=setTimeout(()=>{toast('Could not reach that room. Check the code.');reset();},9000);
    hostConn.on('open',()=>{clearTimeout(t);hostConn.send({t:'join',name:myName});});
    hostConn.on('data',onGuestData);
    hostConn.on('close',()=>{if(view||$('lobby').classList.contains('on'))overlay('Host left','The game has ended.','Back to start',reset);});
  });
  peer.on('error',e=>{toast(e.type==='peer-unavailable'?'Room not found. Check the code.':'Connection problem ('+e.type+').');if(e.type!=='network')reset();});
}
function onGuestData(m){
  if(m.t==='lobby'){code=m.code;drawLobby(m.names);show('lobby');}
  else if(m.t==='state'){view=m.v;renderView(m.v);}
  else if(m.t==='chat')chatAdd(m.from,m.text,m.mine);
  else if(m.t==='full'){toast(m.why);reset();}
}
function uniq(n){let x=n.slice(0,12)||'Player',k=2;const all=lobby.map(p=>p.name);while(all.includes(x))x=n.slice(0,10)+k++;return x;}
function onHostData(c,m){
  if(m.t==='chat'){
    const p=(S?S.players:lobby).find(x=>x.conn===c);
    if(p&&typeof m.text==='string')chatRelay(p.name,m.text.slice(0,140),c);
    return;
  }
  if(m.t==='join'){
    if(S)return c.send({t:'full',why:'That game has already started.'});
    if(lobby.length>=6)return c.send({t:'full',why:'That room is full.'});
    lobby.push({name:uniq(String(m.name||'')),bot:false,conn:c});sendLobby();
  }else if(S){const i=S.players.findIndex(p=>p.conn===c);if(i>0)act(i,m);}
}
function onGuestLeft(c){
  if(S){
    const p=S.players.find(x=>x.conn===c);if(!p)return;
    p.conn=null;p.bot=true;p.name+=' 🤖';
    if(S.players[S.cur]===p&&!S.winner){S.busy=true;setTimeout(botMove,900);}
    S.msg=p.name+' left and a bot took over';broadcast();
  }else{lobby=lobby.filter(p=>p.conn!==c);sendLobby();}
}
function sendLobby(){
  const names=lobby.map(p=>p.name+(p.bot?' 🤖':''));
  lobby.forEach(p=>p.conn&&p.conn.open&&p.conn.send({t:'lobby',names,code}));
  drawLobby(names);
}
function hue(s){let h=0;for(const ch of s)h=(h*31+ch.charCodeAt(0))%4;return HEX[COLORS[h]];}
function drawLobby(names){
  $('roomcode').textContent=code;
  $('plist').innerHTML=names.map((n,i)=>`<li><span class="av" style="background:${hue(n)}">${esc(n[0]||'?').toUpperCase()}</span>${esc(n)}${i===0?' <span class="muted">(host)</span>':''}</li>`).join('');
  $('hostbtns').style.display=isHost?'flex':'none';
  $('wait').style.display=isHost?'none':'block';
}

/* ---------- host: game rules ---------- */
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function mkDeck(){
  const d=[];
  COLORS.forEach(c=>{d.push({c,v:'0'});for(let k=1;k<=9;k++)d.push({c,v:''+k},{c,v:''+k});['skip','rev','+2'].forEach(v=>d.push({c,v},{c,v}));});
  for(let i=0;i<4;i++)d.push({c:'wild',v:'W'},{c:'wild',v:'+4'});
  return shuffle(d);
}
const topCard=()=>S.discard[S.discard.length-1];
const isPlayable=(c,t,col)=>c.c==='wild'||c.c===col||c.v===t.v;
const playable=c=>isPlayable(c,topCard(),S.color);
const nextIdx=(from,steps=1)=>((from+S.dir*steps)%S.players.length+S.players.length)%S.players.length;
function newGame(){
  const players=(S?S.players:lobby).map(p=>({name:p.name,bot:p.bot,conn:p.conn,hand:[]}));
  const deck=mkDeck();
  players.forEach(p=>{p.hand=deck.splice(0,7);});
  let first=deck.pop();
  while(first.c==='wild'){deck.unshift(first);shuffle(deck);first=deck.pop();}
  S={players,deck,discard:[first],color:first.c,cur:0,dir:1,drew:false,drewIdx:-1,busy:false,winner:null,pc:0,lp:-1,fx:null,msg:'Game on! First card: '+first.c+' '+(SYM[first.v]||first.v)};
  const n=players.length;
  if(first.v==='skip')S.cur=1%n;
  else if(first.v==='rev'){if(n>2){S.dir=-1;S.cur=n-1;}else S.cur=1;}
  else if(first.v==='+2'){draw(0,2);S.cur=1%n;}
  $('over').classList.remove('on');
  startTurn();
}
function draw(pi,k){
  const got=[];
  for(let i=0;i<k;i++){
    if(!S.deck.length){if(S.discard.length<2)break;const t=S.discard.pop();S.deck=shuffle(S.discard);S.discard=[t];}
    const c=S.deck.pop();S.players[pi].hand.push(c);got.push(c);
  }
  return got;
}
function startTurn(){
  S.drew=false;S.drewIdx=-1;
  const p=S.players[S.cur];
  S.busy=p.bot;broadcast();
  if(p.bot)setTimeout(botMove,900);
}
function playCard(pi,idx,chosen){
  const p=S.players[pi];
  const card=p.hand.splice(idx,1)[0];
  S.discard.push(card);S.pc++;S.lp=pi;S.fx=card.v;
  S.color=card.c==='wild'?chosen:card.c;
  let text=`${p.name} played ${card.c==='wild'?'':card.c+' '}${SYM[card.v]||card.v}`;
  if(card.c==='wild')text+=` and chose ${S.color}`;
  let skip=0;
  if(card.v==='rev'){if(S.players.length===2)skip=1;else S.dir*=-1;}
  if(card.v==='skip')skip=1;
  if(card.v==='+2'||card.v==='+4'){const v=nextIdx(pi),k=card.v==='+2'?2:4;draw(v,k);skip=1;text+=`. ${S.players[v].name} draws ${k}`;}
  S.msg=text;
  if(p.hand.length===0){S.winner=p.name;S.busy=true;return broadcast();}
  if(p.hand.length===1)S.msg+=`. UNO! ${p.name} has one card left`;
  S.cur=nextIdx(pi,1+skip);
  startTurn();
}
function drawAndMaybe(pi){
  const got=draw(pi,1),p=S.players[pi];
  if(!got.length){S.msg='No cards left to draw.';S.cur=nextIdx(pi);return startTurn();}
  if(playable(got[0])){
    S.drew=true;S.drewIdx=p.hand.length-1;S.msg=`${p.name} drew a card and can play it or pass`;broadcast();
    if(p.bot)setTimeout(botMove,800);
  }else{S.msg=`${p.name} drew a card and passes`;S.cur=nextIdx(pi);startTurn();}
}
function botMove(){
  if(!S||S.winner||!S.players[S.cur].bot)return;
  const pi=S.cur,p=S.players[pi];
  const opts=p.hand.map((c,i)=>({c,i})).filter(o=>playable(o.c)&&(!S.drew||o.i===S.drewIdx));
  if(!opts.length){
    if(S.drew){S.msg=`${p.name} passes`;S.cur=nextIdx(pi);return startTurn();}
    return drawAndMaybe(pi);
  }
  const pick=opts.find(o=>isNaN(o.c.v)&&o.c.c!=='wild')||opts.find(o=>o.c.c!=='wild')||opts[0];
  let col=null;
  if(pick.c.c==='wild'){
    const cnt={red:0,yellow:0,green:0,blue:0};
    p.hand.forEach(c=>{if(cnt[c.c]!==undefined)cnt[c.c]++;});
    col=COLORS.slice().sort((a,b)=>cnt[b]-cnt[a])[0];
  }
  playCard(pi,pick.i,col);
}
function act(pi,m){
  if(!S||S.winner||pi!==S.cur||S.players[pi].bot)return;
  const p=S.players[pi];
  if(m.t==='draw'&&!S.drew)drawAndMaybe(pi);
  else if(m.t==='pass'&&S.drew){S.msg=`${p.name} passes`;S.cur=nextIdx(pi);startTurn();}
  else if(m.t==='play'){
    const c=p.hand[m.idx];
    if(!c||!playable(c)||(S.drew&&m.idx!==S.drewIdx))return;
    if(c.c==='wild'&&!COLORS.includes(m.color))return;
    playCard(pi,m.idx,c.c==='wild'?m.color:null);
  }
}
function viewFor(i){
  return {you:i,players:S.players.map(p=>({name:p.name,n:p.hand.length})),hand:S.players[i].hand,top:topCard(),color:S.color,cur:S.cur,dir:S.dir,drew:S.drew,drewIdx:S.drewIdx,msg:S.msg,winner:S.winner,pc:S.pc,lp:S.lp,fx:S.fx};
}
function broadcast(){
  S.players.forEach((p,i)=>{
    const v=viewFor(i);
    if(i===0){view=v;renderView(v);}
    else if(p.conn&&p.conn.open)p.conn.send({t:'state',v});
  });
}

/* ---------- rendering (host and guests) ---------- */
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
let prev={pc:-1,hand:0,ns:[],won:false},clickRect=null;
const rectOf=e=>e?e.getBoundingClientRect():null;
const POP={skip:'SKIP!',rev:'REVERSE!','+2':'+2!','+4':'+4!',W:'WILD!'};
function flyIn(target,from,o={}){
  if(RM||!target||!from||!target.animate)return;
  const to=target.getBoundingClientRect();
  if(!to.width)return;
  const dur=o.dur||520,delay=o.delay||0,rot=o.rot||0,endRot=o.endRot||0;
  const cl=target.cloneNode(true);
  cl.classList.remove('ok','no');cl.removeAttribute('data-i');cl.removeAttribute('aria-label');cl.tabIndex=-1;
  Object.assign(cl.style,{position:'fixed',left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px',margin:'0',zIndex:'40',transition:'none',pointerEvents:'none',transform:'none'});
  const dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2),sc=Math.min(from.width/to.width,1.6);
  $('fx').appendChild(cl);target.style.visibility='hidden';
  const an=cl.animate([
    {transform:`translate(${dx}px,${dy}px) scale(${sc}) rotate(${rot}deg)`},
    {transform:`translate(${dx*.25}px,${dy*.25-28}px) scale(1.12) rotate(${endRot/2}deg)`,offset:.6},
    {transform:`rotate(${endRot}deg)`}],
    {duration:dur,delay:delay,easing:'cubic-bezier(.25,.8,.3,1)',fill:'backwards'});
  const done=()=>{cl.remove();target.style.visibility='';};
  an.onfinish=done;an.oncancel=done;
}
function ghost(from,toEl,delay){
  if(RM||!from||!toEl)return;
  const to=toEl.getBoundingClientRect(),cl=document.querySelector('#draw .card').cloneNode(true);
  Object.assign(cl.style,{position:'fixed',left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',margin:'0',zIndex:'40',pointerEvents:'none',transform:'none',animation:'none'});
  const dx=to.left+to.width/2-(from.left+from.width/2),dy=to.top+to.height/2-(from.top+from.height/2);
  $('fx').appendChild(cl);
  cl.animate([{transform:'none',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.3) rotate(15deg)`,opacity:.2}],{duration:450,delay:delay||0,easing:'ease-in',fill:'both'}).onfinish=()=>cl.remove();
}
function pop(text,color){
  const e=$('pop');e.textContent=text;e.style.color=color;
  if(RM)return;
  e.animate([{opacity:0,transform:'scale(.3) rotate(-12deg)'},{opacity:1,transform:'scale(1.25) rotate(4deg)',offset:.35},{opacity:1,transform:'scale(1) rotate(0)',offset:.7},{opacity:0,transform:'scale(1.1) translateY(-14px)'}],{duration:1100,easing:'ease-out'});
}
function confetti(){
  if(RM)return;
  for(let i=0;i<80;i++){
    const d=document.createElement('div');d.className='conf';
    d.style.left=Math.random()*100+'%';d.style.background=HEX[COLORS[i%4]];
    $('fx').appendChild(d);
    d.animate([{transform:'translateY(0) rotate(0)'},{transform:`translate(${(Math.random()-.5)*160}px,${innerHeight+40}px) rotate(${Math.random()*900}deg)`}],{duration:2200+Math.random()*1800,delay:Math.random()*600,easing:'cubic-bezier(.3,.2,.6,1)',fill:'backwards'}).onfinish=()=>d.remove();
  }
}
function cardHTML(c,tag,cls,attr=''){
  const s=SYM[c.v]||c.v;
  return `<${tag} class="card ${c.c} ${cls}" ${attr} aria-label="${c.c==='wild'?'wild':c.c} ${c.v}"><small>${s}</small><span>${s}</span><small class="br">${s}</small></${tag}>`;
}
function fanHTML(n){
  const m=Math.min(n,10),step=m>1?Math.min(7,44/(m-1)):0;
  let h='';
  for(let i=0;i<m;i++)h+=`<i style="--r:${((i-(m-1)/2)*step).toFixed(1)}deg"></i>`;
  return h;
}
const wide=matchMedia('(min-width:820px) and (min-height:640px)');
function seat(v){
  if(!v)return;
  const n=v.players.length;
  document.querySelectorAll('#opps .opp').forEach(el=>{
    const fan=el.querySelector('.fan');
    if(wide.matches){
      const k=(+el.dataset.i-v.you+n)%n,t=k*2*Math.PI/n,d=58+22*Math.abs(Math.sin(t));
      el.style.left=(50-45*Math.sin(t))+'%';el.style.top=(50+44*Math.cos(t))+'%';
      fan.style.setProperty('--fr',(t*180/Math.PI).toFixed(1)+'deg');
      fan.style.setProperty('--fx',(d*Math.sin(t)).toFixed(1)+'px');
      fan.style.setProperty('--fy',(-d*Math.cos(t)).toFixed(1)+'px');
    }else{
      el.style.left=el.style.top='';
      ['--fr','--fx','--fy'].forEach(q=>fan.style.removeProperty(q));
    }
  });
}
wide.onchange=()=>seat(view);
function renderView(v){
  show('game');
  const mine=v.cur===v.you&&!v.winner;
  $('opps').innerHTML=v.players.map((p,i)=>i===v.you?'':`<div class="opp ${i===v.cur&&!v.winner?'turn':''}" data-i="${i}"><b><span class="av sm" style="background:${hue(p.name)}">${esc(p.name[0]||'?').toUpperCase()}</span><span class="nm">${esc(p.name)}</span></b><div class="fan">${fanHTML(p.n)}</div><span class="muted" style="font-size:.8rem">${p.n} card${p.n===1?'':'s'}</span>${p.n===1?'<span class="uno">UNO!</span>':''}</div>`).join('');
  seat(v);
  $('discard').innerHTML=cardHTML(v.top,'div','');
  const dcEl=$('discard').firstElementChild,tilt=((v.pc*47)%15)-7;
  dcEl.style.transform=`rotate(${tilt}deg)`;dcEl.style.filter=`drop-shadow(0 0 14px ${HEX[v.color]})`;
  $('colorline').innerHTML=`<span class="colorchip" style="background:${HEX[v.color]}"></span>${v.color} ${v.dir===1?'↻':'↺'}`;
  $('msg').textContent=v.msg;
  const b=$('banner');b.className='banner'+(mine?' me':'');
  b.textContent=v.winner?'':mine?(v.drew?'Play the card or pass':'Your turn'):`${v.players[v.cur].name}'s turn`;
  $('hand').innerHTML=v.hand.map((c,i)=>{
    const ok=mine&&isPlayable(c,v.top,v.color)&&(!v.drew||i===v.drewIdx);
    return cardHTML(c,'button',ok?'ok':'no',`data-i="${i}"`+(ok?'':' aria-disabled="true"'));
  }).join('');
  $('draw').classList.toggle('glow',mine&&!v.drew);
  $('pass').style.display=mine&&v.drew?'inline-block':'none';

  /* animations */
  const pile=rectOf($('draw')),handEls=[...$('hand').children];
  if(v.pc===0&&prev.pc!==0){
    flyIn(dcEl,pile,{dur:600,rot:-20,endRot:tilt});
    handEls.forEach((el,i)=>flyIn(el,pile,{delay:250+i*110,dur:520}));
  }else{
    if(v.pc>prev.pc&&prev.pc>=0){
      const src=v.lp===v.you?(clickRect||rectOf($('hand'))):rectOf(document.querySelector(`.opp[data-i="${v.lp}"]`));
      flyIn(dcEl,src,{dur:520,rot:v.lp===v.you?0:-25,endRot:tilt});
      if(POP[v.fx])pop(POP[v.fx],HEX[v.color]);
    }
    for(let i=prev.hand;i<v.hand.length;i++)flyIn(handEls[i],pile,{delay:(i-prev.hand)*130,dur:480});
    v.players.forEach((p,i)=>{
      if(i===v.you||prev.ns[i]===undefined||p.n<=prev.ns[i])return;
      const fan=document.querySelector(`.opp[data-i="${i}"] .fan`);
      for(let k=0;k<p.n-prev.ns[i];k++)ghost(pile,fan,k*130);
    });
  }
  clickRect=null;
  const wasWon=prev.won;
  prev={pc:v.pc,hand:v.hand.length,ns:v.players.map(p=>p.n),won:!!v.winner};

  if(v.winner){
    if(!wasWon)confetti();
    setTimeout(()=>{
      if(!view||!view.winner)return;
      const won=view.players[view.you].name===view.winner;
      overlay(won?'You win!':view.winner+' wins!',won?'You emptied your hand first.':'Better luck next round.',isHost?'Play again':'Waiting for host...',()=>{if(isHost)newGame();});
      $('overB').disabled=!isHost;
    },1000);
  }else $('over').classList.remove('on');
}
function send(m){if(isHost)act(0,m);else if(hostConn&&hostConn.open)hostConn.send(m);}
$('hand').onclick=e=>{
  const b=e.target.closest('button.card');
  if(!b||!view||b.classList.contains('no'))return;
  const i=+b.dataset.i,c=view.hand[i];clickRect=b.getBoundingClientRect();
  if(c.c==='wild'){
    $('pick').innerHTML=COLORS.map(k=>`<button data-c="${k}" style="background:${HEX[k]}">${k}</button>`).join('');
    $('colorModal').classList.add('on');
    $('pick').onclick=ev=>{const cb=ev.target.closest('button');if(!cb)return;$('colorModal').classList.remove('on');send({t:'play',idx:i,color:cb.dataset.c});};
  }else send({t:'play',idx:i});
};
$('draw').onclick=()=>{if(view&&view.cur===view.you&&!view.drew&&!view.winner)send({t:'draw'});};
$('pass').onclick=()=>send({t:'pass'});

/* ---------- chat ---------- */
let unread=0,lastFrom=null,lastAt=0,chatHook=null;
const EMO=/^(\p{Extended_Pictographic}|\uFE0F|\s){1,3}$/u;
function chatClear(){
  $('chatlog').innerHTML='<div id="chatempty">No messages yet.<br>Say hi to your table 👋</div>';
  lastFrom=null;
}
function chatAdd(from,text,mine){
  const log=$('chatlog'),now=new Date();
  const em=$('chatempty');if(em)em.remove();
  const follow=lastFrom===from&&now-lastAt<60000;
  lastFrom=from;lastAt=+now;
  const row=document.createElement('div');
  row.className='msgrow'+(mine?' mine':'')+(follow?' follow':' first');
  const av=document.createElement('span');av.className='av';av.style.background=hue(from);av.textContent=(from[0]||'?').toUpperCase();
  const bub=document.createElement('div');bub.className='bub'+(EMO.test(text)?' big':'');
  if(!mine&&!follow){const w=document.createElement('span');w.className='who';w.style.color=hue(from);w.textContent=from;bub.append(w);}
  bub.append(document.createTextNode(text));
  const t=document.createElement('time');t.textContent=now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});bub.append(t);
  row.append(av,bub);log.appendChild(row);
  while(log.children.length>60)log.firstChild.remove();
  log.scrollTop=log.scrollHeight;
  if($('chat').hidden){
    unread++;$('chatbadge').textContent=unread>9?'9+':unread;$('chatbadge').hidden=false;
    const b=$('chatbtn');b.classList.remove('ping');void b.offsetWidth;b.classList.add('ping');
  }
}
function chatRelay(from,text,srcConn){
  chatAdd(from,text,!srcConn);
  (S?S.players:lobby).forEach(p=>{if(p.conn&&p.conn.open)p.conn.send({t:'chat',from,text,mine:p.conn===srcConn});});
}
function chatSay(txt){
  const i=$('chatinput'),text=(typeof txt==='string'?txt:i.value).trim().slice(0,140);
  if(typeof txt!=='string')i.value='';
  if(!text)return;
  if(chatHook)return chatHook.say(text);
  if(isHost)chatRelay(myName,text,null);
  else if(hostConn&&hostConn.open)hostConn.send({t:'chat',text});
}
function chatToggle(open){
  $('chat').hidden=!open;
  if(open){
    unread=0;$('chatbadge').hidden=true;
    $('chatlog').scrollTop=$('chatlog').scrollHeight;
    if(matchMedia('(hover:hover)').matches)$('chatinput').focus();
    const n=chatHook?chatHook.count():(S?S.players:lobby.length?lobby:[]).length;
    $('chatcount').textContent=n?n+' players':'';
  }
}
$('chatbtn').onclick=()=>chatToggle($('chat').hidden);
$('chatclose').onclick=()=>chatToggle(false);
$('chips').onclick=e=>{const b=e.target.closest('button');if(b)chatSay(b.dataset.m);};
$('chatsend').onclick=()=>chatSay();
$('chatinput').onkeydown=e=>{if(e.key==='Enter')chatSay();if(e.key==='Escape')chatToggle(false);};

/* ---------- buttons ---------- */
$('create').onclick=createRoom;
$('join').onclick=joinRoom;
$('code').onkeydown=e=>{if(e.key==='Enter')joinRoom();};
$('leave1').onclick=reset;
$('bot').onclick=()=>{if(lobby.length>=6)return toast('Room is full.');lobby.push({name:uniq('Bot'),bot:true,conn:null});sendLobby();};
$('start').onclick=()=>{if(lobby.length<2)return toast('You need at least 2 players. Add a bot or wait for friends.');S=null;newGame();};
$('copy').onclick=async()=>{
  const link=location.href.split('#')[0].split('?')[0]+'#'+code;
  try{await navigator.clipboard.writeText(link);toast('Invite link copied.');}catch(e){toast(link);}
};

/* game carousel: arrows + mouse drag (touch scrolls natively) */
(()=>{
  const tr=$('games'),pv=$('prev'),nx=$('next');
  const upd=()=>{pv.disabled=tr.scrollLeft<4;nx.disabled=tr.scrollLeft+tr.clientWidth>=tr.scrollWidth-4;};
  tr.addEventListener('scroll',upd,{passive:true});addEventListener('resize',upd);addEventListener('load',upd);upd();
  const go=d=>tr.scrollBy({left:d*(tr.querySelector('.gcard').offsetWidth+18)*2,behavior:RM?'auto':'smooth'});
  pv.onclick=()=>go(-1);nx.onclick=()=>go(1);
  let down=false,sx=0,sl=0,moved=false;
  tr.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;down=true;moved=false;sx=e.clientX;sl=tr.scrollLeft;});
  addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-sx;if(Math.abs(dx)>5){moved=true;tr.classList.add('drag');}if(moved)tr.scrollLeft=sl-dx;});
  addEventListener('pointerup',()=>{down=false;tr.classList.remove('drag');});
  tr.addEventListener('click',e=>{if(moved){e.stopPropagation();e.preventDefault();moved=false;}},true);
})();

/* ---------- LUDO ---------- */
(()=>{
const LCOL=['red','green','blue','yellow'],START=[0,13,26,39],SAFE=new Set([0,8,13,21,26,34,39,47]);
const RING=[];
for(let c=1;c<=5;c++)RING.push([6,c]);
for(let r=5;r>=0;r--)RING.push([r,6]);
RING.push([0,7],[0,8]);
for(let r=1;r<=5;r++)RING.push([r,8]);
for(let c=9;c<=14;c++)RING.push([6,c]);
RING.push([7,14],[8,14]);
for(let c=13;c>=9;c--)RING.push([8,c]);
for(let r=9;r<=14;r++)RING.push([r,8]);
RING.push([14,7],[14,6]);
for(let r=13;r>=9;r--)RING.push([r,6]);
for(let c=5;c>=0;c--)RING.push([8,c]);
RING.push([7,0],[6,0]);
const COL=[[[7,1],[7,2],[7,3],[7,4],[7,5]],[[1,7],[2,7],[3,7],[4,7],[5,7]],[[7,13],[7,12],[7,11],[7,10],[7,9]],[[13,7],[12,7],[11,7],[10,7],[9,7]]];
const BASE=[[0,0],[9,0],[9,9],[0,9]],SL=[[2,2],[4,2],[2,4],[4,4]];
const HOMEP=[[6.45,7.5],[7.5,6.45],[8.55,7.5],[7.5,8.55]];
const PIPS=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
const seatCols=n=>n===2?[0,2]:[0,1,2,3].slice(0,n);
let lp=null,lHost=false,lConn=null,lCode='',lName='',lLobby=[],L=null,lview=null,lrn=-1,tks={};

/* keep the existing show(): hide footer on the ludo game screen */
const _show=show;
/* chat: same panel as Uno, routed through the Ludo room */
const LH={say:t=>{if(lHost)lChatRelay(lName,t,null);else if(lConn&&lConn.open)lConn.send({t:'chat',text:t});},count:()=>(L?L.players:lLobby).length};
function lChatRelay(from,text,src){
  chatAdd(from,text,!src);
  (L?L.players:lLobby).forEach(p=>{if(p.conn&&p.conn.open)p.conn.send({t:'chat',from,text,mine:p.conn===src});});
}
show=id=>{
  const ch=$('chat').hidden,l=id==='ludoLobby'||id==='ludoGame',isL=id.startsWith('ludo');
  _show(id);
  chatHook=isL?LH:null;
  document.querySelector('#chips .t').style.display=isL?'none':'';
  if(l){$('chatbtn').hidden=false;$('chat').hidden=ch;}
  if(id==='ludoGame')document.querySelector('.foot').style.display='none';
};

/* board (built once) */
(()=>{
  let h='';
  BASE.forEach((p,i)=>h+=`<div class="lb ${LCOL[i]}" style="grid-area:${p[1]+1}/${p[0]+1}/span 6/span 6"></div>`);
  const cell=(r,c,cls,t)=>h+=`<div class="lc ${cls}" style="grid-area:${r+1}/${c+1}">${t||''}</div>`;
  RING.forEach((p,i)=>{const s=START.indexOf(i);cell(p[0],p[1],s>=0?LCOL[s]:'',s<0&&SAFE.has(i)?'★':'');});
  COL.forEach((a,i)=>a.forEach(p=>cell(p[0],p[1],LCOL[i])));
  $('lboard').innerHTML=h+'<div class="lhome"></div>';
})();

function xy(col,g,i){
  if(g<0){const b=BASE[col],s=SL[i];return [b[0]+s[0],b[1]+s[1]];}
  if(g<=50){const c=RING[(START[col]+g)%52];return [c[1]+.5,c[0]+.5];}
  if(g<56){const c=COL[col][g-51];return [c[1]+.5,c[0]+.5];}
  return HOMEP[col];
}
/* which tokens can move with roll d (progress: -1 base, 0..50 ring, 51..55 home column, 56 home) */
const lmv=(tk,d)=>tk.map((g,i)=>g<0?(d===6?i:-1):(g+d<=56?i:-1)).filter(i=>i>=0);
const later=(fn,ms)=>{const G=L;setTimeout(()=>{if(L===G)fn();},ms);};

/* ---------- host: rules ---------- */
function lclear(){document.querySelectorAll('#lboard .lt').forEach(e=>e.remove());tks={};lrn=-1;}
function lNew(){
  const src=L?L.players:lLobby,cols=seatCols(src.length);
  lclear();
  L={players:src.map((p,i)=>({name:p.name,bot:p.bot,conn:p.conn,col:cols[i],tk:[-1,-1,-1,-1]})),cur:0,dice:0,phase:'roll',six:0,rn:0,winner:null,msg:'Game on! Roll a 6 to bring a token out.'};
  $('over').classList.remove('on');
  lcast();lbotq();
}
function lnext(){L.cur=(L.cur+1)%L.players.length;L.six=0;L.phase='roll';lcast();lbotq();}
function lbotq(){if(!L.winner&&L.players[L.cur].bot)later(lbotroll,900);}
function lroll(pi){
  if(!L||L.winner||L.phase!=='roll'||pi!==L.cur)return;
  const p=L.players[pi],d=1+Math.floor(Math.random()*6);
  L.dice=d;L.rn++;
  if(d===6){if(++L.six===3){L.msg=`${p.name} rolled three 6s in a row. Turn lost`;L.phase='wait';lcast();return later(lnext,1500);}}
  else L.six=0;
  if(!lmv(p.tk,d).length){L.msg=`${p.name} rolled ${d}. No move possible`;L.phase='wait';lcast();return later(lnext,1400);}
  L.msg=`${p.name} rolled ${d}`;L.phase='move';lcast();
  if(p.bot)later(lbotmove,900);
}
function lcapt(pi,g){
  if(g>50)return [];
  const a=(START[L.players[pi].col]+g)%52;
  if(SAFE.has(a))return [];
  const r=[];
  L.players.forEach((q,qi)=>{if(qi!==pi)q.tk.forEach((h,ti)=>{if(h>=0&&h<=50&&(START[q.col]+h)%52===a)r.push([qi,ti]);});});
  return r;
}
function lmove(pi,ti){
  if(!L||L.winner||L.phase!=='move'||pi!==L.cur)return;
  const p=L.players[pi],d=L.dice;
  if(!lmv(p.tk,d).includes(ti))return;
  const g=p.tk[ti]<0?0:p.tk[ti]+d,caps=lcapt(pi,g);
  caps.forEach(([q,t])=>{L.players[q].tk[t]=-1;});
  p.tk[ti]=g;
  let t=p.name+' moved a token';
  if(caps.length)t+=' and captured '+(caps.length>1?caps.length+' tokens':'a token')+'!';
  else if(g===56)t+=' and got it home!';
  if(p.tk.every(x=>x===56)){L.winner=p.name;L.msg=p.name+' got all four tokens home!';L.phase='wait';return lcast();}
  if(d===6||caps.length||g===56){L.msg=t+'. Roll again';L.phase='roll';lcast();lbotq();}
  else{L.msg=t;lnext();}
}
function lbotroll(){if(L&&!L.winner&&L.phase==='roll'&&L.players[L.cur].bot)lroll(L.cur);}
function lbotmove(){
  if(!L||L.winner||L.phase!=='move'||!L.players[L.cur].bot)return;
  const p=L.players[L.cur],d=L.dice;let best=-1,bs=-1;
  lmv(p.tk,d).forEach(i=>{const g=p.tk[i]<0?0:p.tk[i]+d,s=lcapt(L.cur,g).length*100+(g===56?60:0)+(p.tk[i]<0?40:0)+g;if(s>bs){bs=s;best=i;}});
  lmove(L.cur,best);
}
function lcast(){
  L.players.forEach((p,i)=>{
    const v={you:i,players:L.players.map(x=>({name:x.name,col:x.col,tk:x.tk})),cur:L.cur,dice:L.dice,phase:L.phase,msg:L.msg,winner:L.winner,rn:L.rn};
    if(i===0)lrender(v);else if(p.conn&&p.conn.open)p.conn.send({t:'state',v});
  });
}

/* ---------- rendering ---------- */
function lrender(v){
  lview=v;show('ludoGame');
  const me=v.players[v.you],cp=v.players[v.cur],mine=v.cur===v.you&&!v.winner;
  $('lps').innerHTML=v.players.map((p,i)=>`<div class="lchip ${i===v.cur&&!v.winner?'turn':''}"><span class="av sm" style="background:${HEX[LCOL[p.col]]}">${esc(p.name[0]||'?').toUpperCase()}</span><span class="nm">${esc(p.name)}</span><span class="muted">${p.tk.filter(g=>g===56).length}/4</span></div>`).join('');
  const mv=mine&&v.phase==='move'?lmv(me.tk,v.dice):[];
  /* tokens */
  const groups={};
  v.players.forEach((p,pi)=>p.tk.forEach((g,ti)=>{const [x,y]=xy(p.col,g,ti);(groups[x+','+y]=groups[x+','+y]||[]).push([pi,ti,x,y]);}));
  Object.values(groups).forEach(a=>a.forEach((o,k)=>{
    const [pi,ti,x,y]=o,n=a.length,off=n>1?(k-(n-1)/2)*.3:0,key=pi+'_'+ti;
    let el=tks[key];
    if(!el){el=tks[key]=document.createElement('button');el.className='lt '+LCOL[v.players[pi].col];el.dataset.t=ti;$('lboard').appendChild(el);}
    el.style.left=((x+off)/15*100)+'%';el.style.top=((y-off*.6)/15*100)+'%';
    const ok=pi===v.you&&mv.includes(ti);
    el.classList.toggle('ok',ok);el.setAttribute('aria-label',ok?'Move this token':'Token');
  }));
  /* dice */
  const die=$('ldie');
  die.innerHTML=Array.from({length:9},(_,i)=>`<i class="${PIPS[v.dice||0].includes(i)?'on':''}"></i>`).join('');
  die.style.borderColor=HEX[LCOL[cp.col]];
  if(v.rn!==lrn&&v.dice&&lrn!==-1&&!RM)die.animate([{transform:'rotate(0) scale(.6)'},{transform:'rotate(360deg) scale(1.2)'},{transform:'none'}],{duration:450,easing:'ease-out'});
  lrn=v.rn;
  $('lmsg').textContent=v.msg;
  const b=$('lbanner');b.className='banner'+(mine?' me':'');
  b.textContent=v.winner?'':mine?(v.phase==='roll'?'Your turn: roll the dice':v.phase==='move'?'Pick a token to move':''):cp.name+"'s turn";
  $('lroll').disabled=!(mine&&v.phase==='roll');
  if(v.winner){
    confetti();
    setTimeout(()=>{
      if(!lview||!lview.winner)return;
      const won=lview.players[lview.you].name===lview.winner;
      overlay(won?'You win!':lview.winner+' wins!',won?'All four tokens made it home.':'Better luck next round.',lHost?'Play again':'Waiting for host...',()=>{if(lHost)lNew();});
      $('overB').disabled=!lHost;
    },1000);
  }else $('over').classList.remove('on');
}
function lsend(m){
  if(lHost){if(m.t==='roll')lroll(0);else lmove(0,m.i);}
  else if(lConn&&lConn.open)lConn.send(m);
}
$('lroll').onclick=()=>lsend({t:'roll'});
$('lboard').onclick=e=>{const b=e.target.closest('.lt.ok');if(b)lsend({t:'move',i:+b.dataset.t});};

/* ---------- connection ---------- */
function lReset(){
  if(lp){try{lp.destroy();}catch(e){}}
  lp=null;lHost=false;lConn=null;lLobby=[];L=null;lview=null;lclear();
  $('over').classList.remove('on');$('overB').disabled=false;
  chatClear();unread=0;$('chatbadge').hidden=true;
  show('ludoHome');
}
function lname(){
  const n=$('lname').value.trim().slice(0,12)||'Player';
  try{localStorage.setItem('uno-name',n);}catch(e){}
  return n;
}
try{const n=localStorage.getItem('uno-name');if(n)$('lname').value=n;}catch(e){}
function lUniq(n){let x=n.slice(0,12)||'Player',k=2;const all=lLobby.map(p=>p.name);while(all.includes(x))x=n.slice(0,10)+k++;return x;}
function lCreate(){
  lName=lname();lHost=true;lCode=makeCode();
  lp=new Peer('ludoparty-'+lCode);
  lp.on('open',()=>{lLobby=[{name:lName,bot:false,conn:null}];show('ludoLobby');lSendLobby();});
  lp.on('error',e=>{
    if(e.type==='unavailable-id'){lp.destroy();lCreate();}
    else{toast('Connection problem ('+e.type+'). Try again.');lReset();}
  });
  lp.on('connection',c=>{c.on('data',m=>lHostData(c,m));c.on('close',()=>lLeft(c));});
}
function lJoin(){
  lName=lname();lCode=$('lcode').value.trim().toUpperCase();
  if(lCode.length!==4)return toast('Enter the 4-letter room code.');
  lp=new Peer();
  lp.on('open',()=>{
    const c=lConn=lp.connect('ludoparty-'+lCode,{reliable:true});
    const t=setTimeout(()=>{if(c.open||lConn!==c)return;toast('Could not reach that room. Check the code.');lReset();},9000);
    c.on('open',()=>{clearTimeout(t);c.send({t:'join',name:lName});});
    c.on('data',lGuestData);
    c.on('close',()=>{if(lview||$('ludoLobby').classList.contains('on'))overlay('Host left','The game has ended.','Back to start',lReset);});
  });
  lp.on('error',e=>{toast(e.type==='peer-unavailable'?'Room not found. Check the code.':'Connection problem ('+e.type+').');if(e.type!=='network')lReset();});
}
function lGuestData(m){
  if(m.t==='lobby'){lCode=m.code;lDrawLobby(m.names);show('ludoLobby');}
  else if(m.t==='state')lrender(m.v);
  else if(m.t==='chat')chatAdd(m.from,m.text,m.mine);
  else if(m.t==='full'){toast(m.why);lReset();}
}
function lHostData(c,m){
  if(m.t==='chat'){
    const p=(L?L.players:lLobby).find(x=>x.conn===c);
    if(p&&typeof m.text==='string')lChatRelay(p.name,m.text.slice(0,140),c);
    return;
  }
  if(m.t==='join'){
    if(L)return c.send({t:'full',why:'That game has already started.'});
    if(lLobby.length>=4)return c.send({t:'full',why:'That room is full (4 players max).'});
    lLobby.push({name:lUniq(String(m.name||'')),bot:false,conn:c});lSendLobby();
  }else if(L){
    const i=L.players.findIndex(p=>p.conn===c);
    if(i>0){if(m.t==='roll')lroll(i);else if(m.t==='move'&&Number.isInteger(m.i))lmove(i,m.i);}
  }
}
function lLeft(c){
  if(L){
    const p=L.players.find(x=>x.conn===c);if(!p)return;
    p.conn=null;p.bot=true;p.name+=' 🤖';
    L.msg=p.name+' left and a bot took over';
    if(L.players[L.cur]===p&&!L.winner){if(L.phase==='roll')later(lbotroll,900);else if(L.phase==='move')later(lbotmove,900);}
    lcast();
  }else{lLobby=lLobby.filter(p=>p.conn!==c);lSendLobby();}
}
function lSendLobby(){
  const names=lLobby.map(p=>p.name+(p.bot?' 🤖':''));
  lLobby.forEach(p=>p.conn&&p.conn.open&&p.conn.send({t:'lobby',names,code:lCode}));
  lDrawLobby(names);
}
function lDrawLobby(names){
  const cols=seatCols(names.length);
  $('lroomcode').textContent=lCode;
  $('lplist').innerHTML=names.map((n,i)=>`<li><span class="av" style="background:${HEX[LCOL[cols[i]]]}">${esc(n[0]||'?').toUpperCase()}</span>${esc(n)}${i===0?' <span class="muted">(host)</span>':''}</li>`).join('');
  $('lhostbtns').style.display=lHost?'flex':'none';
  $('lwait').style.display=lHost?'none':'block';
}

/* ---------- buttons ---------- */
$('playludo').onclick=()=>show('ludoHome');
$('lcreate').onclick=lCreate;
$('ljoin').onclick=lJoin;
$('lcode').onkeydown=e=>{if(e.key==='Enter')lJoin();};
$('lleave').onclick=lReset;
$('lbot').onclick=()=>{if(lLobby.length>=4)return toast('Room is full (4 players max).');lLobby.push({name:lUniq('Bot'),bot:true,conn:null});lSendLobby();};
$('lstart').onclick=()=>{if(lLobby.length<2)return toast('You need at least 2 players. Add a bot or wait for friends.');L=null;lNew();};
$('lcopy').onclick=async()=>{
  const link=location.href.split('#')[0].split('?')[0]+'?game=ludo#'+lCode;
  try{await navigator.clipboard.writeText(link);toast('Invite link copied.');}catch(e){toast(link);}
};

/* brand link: leave Ludo properly, otherwise use the existing Uno handler */
const oldBrand=$('brand').onclick;
$('brand').onclick=e=>{
  if(!document.querySelector('.screen.on').id.startsWith('ludo'))return oldBrand(e);
  e.preventDefault();
  if(lp&&!confirm('Leave the current room and go back to all games?'))return;
  lReset();show('hub');
};

/* invite links: ?game=ludo#ABCD */
if(new URLSearchParams(location.search).get('game')==='ludo'){
  $('lcode').value=location.hash.slice(1,5).toUpperCase();show('ludoHome');
}
})();

/* ---------- CHECKERS ---------- */
(()=>{
const CC=['black','white'];
HEX.black='#1c1c22';HEX.white='#f2f2f2';
let kprevB=null;
let kp=null,kHost=false,kConn=null,kCode='',kName='',kLobby=[],C=null,kview=null,ksel=null,kwon=false;

/* chat: same panel as Uno and Ludo, routed through the Checkers room */
const _show2=show;
const KH={say:t=>{if(kHost)kChatRelay(kName,t,null);else if(kConn&&kConn.open)kConn.send({t:'chat',text:t});},count:()=>(C?C.players:kLobby).length};
function kChatRelay(from,text,src){
  chatAdd(from,text,!src);
  (C?C.players:kLobby).forEach(p=>{if(p.conn&&p.conn.open)p.conn.send({t:'chat',from,text,mine:p.conn===src});});
}
show=id=>{
  const ch=$('chat').hidden,isK=id.startsWith('checkers'),l=id==='checkersLobby'||id==='checkersGame';
  _show2(id);
  if(isK){
    chatHook=KH;
    document.querySelector('#chips .t').style.display='none';
    if(l){$('chatbtn').hidden=false;$('chat').hidden=ch;}
    if(id==='checkersGame')document.querySelector('.foot').style.display='none';
  }
};

function kanim(o,v){
  if(RM)return;
  const bd=$('cboard'),cells=bd.children,at=i=>cells[v.you===1?63-i:i];
  if(!v.last){ // new game: pieces pop in
    bd.querySelectorAll('.cp').forEach((el,n)=>el.animate([{transform:'scale(0) rotate(-180deg)',opacity:0},{transform:'none',opacity:1}],{duration:450,delay:n*25,easing:'cubic-bezier(.3,1.5,.5,1)',fill:'backwards'}));
    return;
  }
  if(!o)return;
  const [f,t]=v.last;
  if(!o.b[f])return;
  o.b.forEach((pc,i)=>{ // captured pieces spin and shrink away
    if(!pc||v.b[i]||i===f)return;
    const g=document.createElement('span');
    g.className='cp '+CC[pc.p]+(pc.k?' k':'');g.textContent=pc.k?'♛':'';
    g.style.cssText='position:absolute;inset:0;margin:auto;pointer-events:none;z-index:6';
    at(i).appendChild(g);
    g.animate([{transform:'none',opacity:1},{transform:'scale(1.3)',opacity:1,offset:.25},{transform:'scale(0) rotate(200deg)',opacity:0}],{duration:500,easing:'ease-in'}).onfinish=()=>g.remove();
  });
  const el=at(t).querySelector('.cp');if(!el)return;
  const a=at(f).getBoundingClientRect(),b=at(t).getBoundingClientRect();
  el.style.zIndex=5; // slide the moved piece across the board
  const mv=el.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px) scale(1.15)`},{transform:'none'}],{duration:380,easing:'cubic-bezier(.3,1.2,.5,1)'});
  mv.onfinish=mv.oncancel=()=>{el.style.zIndex='';};
  if(v.b[t].k&&!o.b[f].k)el.animate([{transform:'scale(1)'},{transform:'scale(1.5) rotate(20deg)'},{transform:'scale(1)'}],{duration:500,delay:380,easing:'ease-out'});
}

/* ---------- host: rules (American checkers: forced captures, multi-jumps, kings) ---------- */
/* player 0 (black, host) starts at the bottom and moves up; player 1 (white) starts at the top */
const inb=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const kdirs=pc=>pc.k?[[-1,-1],[-1,1],[1,-1],[1,1]]:(pc.p===0?[[-1,-1],[-1,1]]:[[1,-1],[1,1]]);
function kOf(i,jump){
  const pc=C.b[i],r=i>>3,c=i&7,out=[];
  kdirs(pc).forEach(([dr,dc])=>{
    const r1=r+dr,c1=c+dc;if(!inb(r1,c1))return;
    const j1=r1*8+c1,t=C.b[j1];
    if(!jump){if(!t)out.push({from:i,to:j1});}
    else if(t&&t.p!==pc.p){
      const r2=r+2*dr,c2=c+2*dc;
      if(inb(r2,c2)&&!C.b[r2*8+c2])out.push({from:i,to:r2*8+c2,cap:j1});
    }
  });
  return out;
}
function kMoves(){
  if(!C||C.winner)return [];
  if(C.chain!=null)return kOf(C.chain,true);
  const j=[],s=[];
  C.b.forEach((pc,i)=>{if(pc&&pc.p===C.cur){j.push(...kOf(i,true));s.push(...kOf(i,false));}});
  return j.length?j:s;
}
function kNew(){
  const src=C?C.players:kLobby,b=Array(64).fill(null);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++)if((r+c)%2===1){
    if(r<3)b[r*8+c]={p:1,k:0};else if(r>4)b[r*8+c]={p:0,k:0};
  }
  C={players:src.map(p=>({name:p.name,bot:p.bot,conn:p.conn})),b,cur:0,chain:null,winner:null,last:null,msg:'Game on! Black moves first. Captures are compulsory.'};
  kwon=false;$('over').classList.remove('on');$('overB').disabled=false;
  kcast();kbotq();
}
function kMove(pi,from,to){
  if(!C||C.winner||pi!==C.cur)return;
  const m=kMoves().find(x=>x.from===from&&x.to===to);if(!m)return;
  const pc=C.b[from],p=C.players[pi],cap=m.cap!=null;
  C.b[to]=pc;C.b[from]=null;if(cap)C.b[m.cap]=null;
  C.last=[from,to];
  const promo=!pc.k&&(pc.p===0?to<8:to>=56);
  if(promo)pc.k=1;
  if(cap&&!promo&&kOf(to,true).length){
    C.chain=to;C.msg=p.name+' captured a piece and must jump again';
    kcast();return kbotq();
  }
  C.chain=null;C.cur=1-pi;
  C.msg=p.name+(cap?' captured a piece':' moved')+(promo?' and crowned a king!':'');
  if(!kMoves().length){C.winner=p.name;C.msg=p.name+' wins! '+C.players[1-pi].name+' has no moves left';}
  kcast();kbotq();
}
function kbotq(){
  if(C&&!C.winner&&C.players[C.cur].bot){const G=C;setTimeout(()=>{if(C===G)kbot();},900);}
}
function kbot(){
  if(!C||C.winner||!C.players[C.cur].bot)return;
  const ms=kMoves();if(!ms.length)return;
  let best=ms[0],bs=-1;
  ms.forEach(m=>{
    const pc=C.b[m.from],r=m.to>>3,col=m.to&7;
    const promo=!pc.k&&(pc.p===0?r===0:r===7);
    const s=(m.cap!=null?10:0)+(promo?6:0)+(col===0||col===7?1:0)+Math.random()*2;
    if(s>bs){bs=s;best=m;}
  });
  kMove(C.cur,best.from,best.to);
}
function kcast(){
  const moves=kMoves();
  C.players.forEach((p,i)=>{
    const v={you:i,names:C.players.map(x=>x.name),b:C.b.map(x=>x&&{p:x.p,k:x.k}),cur:C.cur,chain:C.chain,winner:C.winner,msg:C.msg,moves,last:C.last};
    if(i===0)krender(v);else if(p.conn&&p.conn.open)p.conn.send({t:'state',v});
  });
}

/* ---------- rendering ---------- */
function krender(v){
  kview=v;show('checkersGame');
  const mine=v.cur===v.you&&!v.winner;
  if(!mine)ksel=null;
  else if(v.chain!=null)ksel=v.chain;
  else if(ksel!=null&&!v.moves.some(m=>m.from===ksel))ksel=null;
  const o=kprevB;kdraw();kanim(o,v);kprevB=v;
  if(v.winner){
    if(!kwon){kwon=true;confetti();}
    setTimeout(()=>{
      if(!kview||!kview.winner)return;
      const won=kview.names[kview.you]===kview.winner;
      overlay(won?'You win!':kview.winner+' wins!',won?'You cleared the board.':'Better luck next round.',kHost?'Play again':'Waiting for host...',()=>{if(kHost)kNew();});
      $('overB').disabled=!kHost;
    },1000);
  }else{kwon=false;$('over').classList.remove('on');}
}
function kdraw(){
  const v=kview,mine=v.cur===v.you&&!v.winner;
  const from=new Set(mine?v.moves.map(m=>m.from):[]);
  const dst=new Set(mine&&ksel!=null?v.moves.filter(m=>m.from===ksel).map(m=>m.to):[]);
  const flip=v.you===1,cnt=[0,0];
  v.b.forEach(pc=>{if(pc)cnt[pc.p]++;});
  $('cps').innerHTML=v.names.map((n,i)=>`<div class="lchip ${i===v.cur&&!v.winner?'turn':''}"><span class="av sm" style="background:${HEX[CC[i]]};color:${i?'#241300':'#fff'}">${esc(n[0]||'?').toUpperCase()}</span><span class="nm">${esc(n)}</span><span class="muted">${cnt[i]} left</span></div>`).join('');
  let h='';
  for(let k=0;k<64;k++){
    const i=flip?63-k:k,r=i>>3,c=i&7,dark=(r+c)%2===1,pc=v.b[i];
    let cls='cs '+(dark?'dark':'light');
    if(v.last&&(v.last[0]===i||v.last[1]===i))cls+=' lastm';
    if(ksel===i)cls+=' sel';
    const d=dst.has(i);if(d)cls+=' dst';
    const ok=!!pc&&from.has(i);
    h+=`<div class="${cls}" data-i="${i}"${ok||d?' tabindex="0" role="button" aria-label="'+(d?'Move here':'Select piece')+'"':''}>`;
    if(pc)h+=`<span class="cp ${CC[pc.p]}${ok?' ok':''}${pc.k?' k':''}">${pc.k?'♛':''}</span>`;
    h+='</div>';
  }
  $('cboard').innerHTML=h;
  $('cmsg').textContent=v.msg;
  const b=$('cbanner');b.className='banner'+(mine?' me':'');
  b.textContent=v.winner?'':mine?(v.chain!=null?'Keep jumping!':ksel==null?'Your turn: pick a piece':'Pick where to move'):v.names[v.cur]+"'s turn";
}
function ksend(m){
  if(kHost)kMove(0,m.from,m.to);
  else if(kConn&&kConn.open)kConn.send(m);
}
$('cboard').onclick=e=>{
  const s=e.target.closest('.cs');if(!s||!kview)return;
  const i=+s.dataset.i,v=kview;
  if(v.cur!==v.you||v.winner)return;
  if(s.classList.contains('dst')){ksend({t:'move',from:ksel,to:i});return;}
  if(v.moves.some(m=>m.from===i)){
    if(v.chain!=null)return;
    ksel=ksel===i?null:i;kdraw();
  }else if(v.chain==null&&ksel!=null){ksel=null;kdraw();}
};
$('cboard').onkeydown=e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('cs')){e.preventDefault();e.target.click();}
};

/* ---------- connection ---------- */
function kReset(){
  if(kp){try{kp.destroy();}catch(e){}}
  kp=null;kHost=false;kConn=null;kLobby=[];C=null;kview=null;ksel=null;kprevB=null;kwon=false;
  $('over').classList.remove('on');$('overB').disabled=false;
  chatClear();unread=0;$('chatbadge').hidden=true;
  show('checkersHome');
}
function kname(){
  const n=$('cname').value.trim().slice(0,12)||'Player';
  try{localStorage.setItem('uno-name',n);}catch(e){}
  return n;
}
try{const n=localStorage.getItem('uno-name');if(n)$('cname').value=n;}catch(e){}
function kUniq(n){let x=n.slice(0,12)||'Player',q=2;const all=kLobby.map(p=>p.name);while(all.includes(x))x=n.slice(0,10)+q++;return x;}
function kCreate(){
  kName=kname();kHost=true;kCode=makeCode();
  kp=new Peer('checkersparty-'+kCode);
  kp.on('open',()=>{kLobby=[{name:kName,bot:false,conn:null}];show('checkersLobby');kSendLobby();});
  kp.on('error',e=>{
    if(e.type==='unavailable-id'){kp.destroy();kCreate();}
    else{toast('Connection problem ('+e.type+'). Try again.');kReset();}
  });
  kp.on('connection',c=>{c.on('data',m=>kHostData(c,m));c.on('close',()=>kLeft(c));});
}
function kJoin(){
  kName=kname();kCode=$('ccode').value.trim().toUpperCase();
  if(kCode.length!==4)return toast('Enter the 4-letter room code.');
  kp=new Peer();
  kp.on('open',()=>{
    const c=kConn=kp.connect('checkersparty-'+kCode,{reliable:true});
    const t=setTimeout(()=>{if(c.open||kConn!==c)return;toast('Could not reach that room. Check the code.');kReset();},9000);
    c.on('open',()=>{clearTimeout(t);c.send({t:'join',name:kName});});
    c.on('data',kGuestData);
    c.on('close',()=>{if(kview||$('checkersLobby').classList.contains('on'))overlay('Host left','The game has ended.','Back to start',kReset);});
  });
  kp.on('error',e=>{toast(e.type==='peer-unavailable'?'Room not found. Check the code.':'Connection problem ('+e.type+').');if(e.type!=='network')kReset();});
}
function kGuestData(m){
  if(m.t==='lobby'){kCode=m.code;kDrawLobby(m.names);show('checkersLobby');}
  else if(m.t==='state')krender(m.v);
  else if(m.t==='chat')chatAdd(m.from,m.text,m.mine);
  else if(m.t==='full'){toast(m.why);kReset();}
}
function kHostData(c,m){
  if(m.t==='chat'){
    const p=(C?C.players:kLobby).find(x=>x.conn===c);
    if(p&&typeof m.text==='string')kChatRelay(p.name,m.text.slice(0,140),c);
    return;
  }
  if(m.t==='join'){
    if(C)return c.send({t:'full',why:'That game has already started.'});
    if(kLobby.length>=2)return c.send({t:'full',why:'That room is full (2 players max).'});
    kLobby.push({name:kUniq(String(m.name||'')),bot:false,conn:c});kSendLobby();
  }else if(C&&m.t==='move'){
    const i=C.players.findIndex(p=>p.conn===c);
    if(i>0&&Number.isInteger(m.from)&&Number.isInteger(m.to))kMove(i,m.from,m.to);
  }
}
function kLeft(c){
  if(C){
    const p=C.players.find(x=>x.conn===c);if(!p)return;
    p.conn=null;p.bot=true;p.name+=' 🤖';
    C.msg=p.name+' left and a bot took over';
    kcast();kbotq();
  }else{kLobby=kLobby.filter(p=>p.conn!==c);kSendLobby();}
}
function kSendLobby(){
  const names=kLobby.map(p=>p.name+(p.bot?' 🤖':''));
  kLobby.forEach(p=>p.conn&&p.conn.open&&p.conn.send({t:'lobby',names,code:kCode}));
  kDrawLobby(names);
}
function kDrawLobby(names){
  $('croomcode').textContent=kCode;
  $('cplist').innerHTML=names.map((n,i)=>`<li><span class="av" style="background:${HEX[CC[i]]};color:${i?'#241300':'#fff'}">${esc(n[0]||'?').toUpperCase()}</span>${esc(n)}${i===0?' <span class="muted">(host)</span>':''}</li>`).join('');
  $('chostbtns').style.display=kHost?'flex':'none';
  $('cwait').style.display=kHost?'none':'block';
}

/* ---------- buttons ---------- */
$('playcheckers').onclick=()=>show('checkersHome');
$('ccreate').onclick=kCreate;
$('cjoin').onclick=kJoin;
$('ccode').onkeydown=e=>{if(e.key==='Enter')kJoin();};
$('cleave').onclick=kReset;
$('cbotbtn').onclick=()=>{if(kLobby.length>=2)return toast('Room is full (2 players max).');kLobby.push({name:kUniq('Bot'),bot:true,conn:null});kSendLobby();};
$('cstart').onclick=()=>{if(kLobby.length<2)return toast('You need 2 players. Add a bot or wait for a friend.');C=null;kNew();};
$('ccopy').onclick=async()=>{
  const link=location.href.split('#')[0].split('?')[0]+'?game=checkers#'+kCode;
  try{await navigator.clipboard.writeText(link);toast('Invite link copied.');}catch(e){toast(link);}
};

/* brand link: leave Checkers properly, otherwise use the existing handler */
const oldBrand2=$('brand').onclick;
$('brand').onclick=e=>{
  if(!document.querySelector('.screen.on').id.startsWith('checkers'))return oldBrand2(e);
  e.preventDefault();
  if(kp&&!confirm('Leave the current room and go back to all games?'))return;
  kReset();show('hub');
};

/* invite links: ?game=checkers#ABCD */
if(new URLSearchParams(location.search).get('game')==='checkers'){
  $('ccode').value=location.hash.slice(1,5).toUpperCase();show('checkersHome');
}
})();

/* ---------- SNAKES AND LADDERS ---------- */
(()=>{
const SC=['red','green','blue','yellow'];
const SNK={17:7,54:34,62:19,64:60,87:24,93:73,95:75,99:78},LAD={4:14,9:31,20:38,28:84,40:59,51:67,63:81,71:91};
const SCL=['#e63946','#2fae66','#a06cd5','#ff8a3d','#2778e0','#d94fa0','#18a5a7','#8a6d1d'];
const PIPS=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
const P=n=>{const i=n-1,r=Math.floor(i/10),c=r%2?9-i%10:i%10;return [c*10+5,(9-r)*10+5];};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const anim=mv=>400+(mv.land-mv.from)*172+(mv.end!==mv.land?1100:0);
let sp=null,sHost=false,sConn=null,sCode='',sName='',sLobby=[],G=null,sview=null,tk={},walking=new Set(),lastRn=-1,swon=false,rollIv=null;

/* chat: same panel, routed through the Snakes room */
const _show3=show;
const SH={say:t=>{if(sHost)sChatRelay(sName,t,null);else if(sConn&&sConn.open)sConn.send({t:'chat',text:t});},count:()=>(G?G.players:sLobby).length};
function sChatRelay(from,text,src){
  chatAdd(from,text,!src);
  (G?G.players:sLobby).forEach(p=>{if(p.conn&&p.conn.open)p.conn.send({t:'chat',from,text,mine:p.conn===src});});
}
show=id=>{
  const ch=$('chat').hidden,isS=id.startsWith('snakes'),l=id==='snakesLobby'||id==='snakesGame';
  _show3(id);
  if(isS){
    chatHook=SH;
    document.querySelector('#chips .t').style.display='none';
    if(l){$('chatbtn').hidden=false;$('chat').hidden=ch;}
    if(id==='snakesGame')document.querySelector('.foot').style.display='none';
  }
};

/* board, snakes and ladders (built once) */
(()=>{
  let c='',s='';
  for(let y=0;y<10;y++){const r=9-y;for(let x=0;x<10;x++){const n=r*10+(r%2?9-x:x)+1;c+=`<div class="sc ${(x+y)%2?'b':'a'}${n===100?' fin':''}">${n}</div>`;}}
  Object.entries(LAD).forEach(([a,b])=>{
    const [x1,y1]=P(+a),[x2,y2]=P(+b),dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),ox=-dy/L*1.5,oy=dx/L*1.5;
    s+=`<g stroke="#8a5a2b" stroke-linecap="round"><line x1="${x1+ox}" y1="${y1+oy}" x2="${x2+ox}" y2="${y2+oy}" stroke-width=".9"/><line x1="${x1-ox}" y1="${y1-oy}" x2="${x2-ox}" y2="${y2-oy}" stroke-width=".9"/>`;
    for(let d=3;d<L-1;d+=4){const u=d/L;s+=`<line x1="${x1+dx*u+ox}" y1="${y1+dy*u+oy}" x2="${x1+dx*u-ox}" y2="${y1+dy*u-oy}" stroke-width=".7"/>`;}
    s+='</g>';
  });
  Object.entries(SNK).forEach(([h,t],i)=>{
    const [x1,y1]=P(+h),[x2,y2]=P(+t),dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),px=-dy/L,py=dx/L,N=28,col=SCL[i%SCL.length];
    let d='';
    for(let k=0;k<=N;k++){const u=k/N,w=Math.sin(u*Math.PI*(2+L/30))*2.6*(1-.5*u);d+=(k?'L':'M')+(x1+dx*u+px*w).toFixed(1)+' '+(y1+dy*u+py*w).toFixed(1);}
    s+=`<g class="snk" style="animation-delay:${(-i*.7).toFixed(1)}s"><path d="${d}" stroke="${col}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="#fff" stroke-opacity=".45" stroke-width="1" stroke-dasharray="1 2.4" fill="none" stroke-linecap="round"/><circle cx="${x1}" cy="${y1}" r="2.4" fill="${col}"/><circle cx="${x1+px}" cy="${y1+py}" r=".7" fill="#fff"/><circle cx="${x1-px}" cy="${y1-py}" r=".7" fill="#fff"/><circle cx="${x1+px}" cy="${y1+py}" r=".3" fill="#111"/><circle cx="${x1-px}" cy="${y1-py}" r=".3" fill="#111"/></g>`;
  });
  $('sboard').innerHTML=c+`<svg id="sfx" viewBox="0 0 100 100" preserveAspectRatio="none">${s}</svg><div id="spop"></div>`;
})();

/* ---------- host: rules ---------- */
const sl=(fn,ms)=>{const g=G;setTimeout(()=>{if(G===g)fn();},ms);};
function tclear(){document.querySelectorAll('#sboard .stk').forEach(e=>e.remove());tk={};walking.clear();lastRn=-1;swon=false;}
function sNew(){
  const src=G?G.players:sLobby;
  tclear();
  G={players:src.map(p=>({name:p.name,bot:p.bot,conn:p.conn,pos:0})),cur:0,dice:0,phase:'roll',rn:0,mv:null,winner:null,msg:'Game on! Roll the dice. You need an exact roll to land on 100.'};
  $('over').classList.remove('on');$('overB').disabled=false;
  scast();sbotq();
}
function sbotq(){if(G&&!G.winner&&G.phase==='roll'&&G.players[G.cur].bot)sl(sbotroll,900);}
function sbotroll(){if(G&&!G.winner&&G.phase==='roll'&&G.players[G.cur].bot)sRoll(G.cur);}
function sRoll(pi){
  if(!G||G.winner||G.phase!=='roll'||pi!==G.cur)return;
  const p=G.players[pi],d=1+Math.floor(Math.random()*6),from=p.pos;
  let land=from+d,t=p.name+' rolled '+d;
  if(land>100){land=from;t+='. Needs an exact roll to finish';}
  const end=land===from?from:(SNK[land]||LAD[land]||land);
  p.pos=end;G.dice=d;G.rn++;G.mv={pi,from,land,end,rn:G.rn};
  const again=d===6&&end!==100;
  if(end===100){G.winner=p.name;t+=' and reached 100!';}
  else{
    if(end<land)t+=' and a snake sent them down to '+end+'!';
    else if(end>land)t+=' and climbed a ladder to '+end+'!';
    else if(land!==from)t+=' and moved to '+land;
    if(again)t+='. A six, roll again!';
  }
  G.msg=t;G.phase='wait';scast();
  if(G.winner)return;
  sl(()=>{if(!again)G.cur=(G.cur+1)%G.players.length;G.phase='roll';scast();sbotq();},anim(G.mv)+500);
}
function scast(){
  G.players.forEach((p,i)=>{
    const v={you:i,players:G.players.map(x=>({name:x.name,pos:x.pos})),cur:G.cur,dice:G.dice,phase:G.phase,msg:G.msg,winner:G.winner,mv:G.mv};
    if(i===0)srender(v);else if(p.conn&&p.conn.open)p.conn.send({t:'state',v});
  });
}

/* ---------- rendering and animation ---------- */
function showDie(n){$('sdie').innerHTML=Array.from({length:9},(_,i)=>`<i class="${PIPS[n||0].includes(i)?'on':''}"></i>`).join('');}
function rollDie(n){
  if(rollIv)clearInterval(rollIv);
  if(RM){showDie(n);return;}
  let k=0;
  rollIv=setInterval(()=>{showDie(1+Math.floor(Math.random()*6));if(++k>5){clearInterval(rollIv);rollIv=null;showDie(n);}},65);
  $('sdie').animate([{transform:'rotate(0) scale(.7)'},{transform:'rotate(360deg) scale(1.2)'},{transform:'none'}],{duration:420,easing:'ease-out'});
}
function spop(t,col){
  const e=$('spop');e.textContent=t;e.style.color=col;
  if(RM)return;
  e.animate([{opacity:0,transform:'scale(.3) rotate(-12deg)'},{opacity:1,transform:'scale(1.25) rotate(4deg)',offset:.35},{opacity:1,transform:'scale(1)',offset:.7},{opacity:0,transform:'scale(1.1) translateY(-14px)'}],{duration:1200,easing:'ease-out'});
}
function lay(v){
  v.players.forEach((p,i)=>{
    const el=tk[i];if(!el||walking.has(i))return;
    const same=v.players.map((q,j)=>j).filter(j=>p.pos>0&&v.players[j].pos===p.pos),k=same.indexOf(i),n=same.length;
    const o=n>1?(k-(n-1)/2)*2.6:0,[x,y]=p.pos>0?P(p.pos):[6+i*8,104];
    el.style.left=(x+o)+'%';el.style.top=y+'%';
  });
}
async function walk(mv){
  const pi=mv.pi,el=tk[pi];
  if(!el)return;
  walking.add(pi);
  try{
    await sleep(420);
    for(let s=mv.from+1;s<=mv.land;s++){
      if(tk[pi]!==el)return;
      const [x,y]=P(s);el.style.left=x+'%';el.style.top=y+'%';
      el.animate([{transform:'translate(-50%,-50%)'},{transform:'translate(-50%,-115%) scale(1.2)'},{transform:'translate(-50%,-50%)'}],{duration:170});
      await sleep(172);
    }
    if(tk[pi]!==el)return;
    if(mv.end!==mv.land){
      const snake=mv.end<mv.land;
      await sleep(200);
      spop(snake?'SSSSS! 🐍':'LADDER! 🪜',snake?'#e63946':'#2fae66');
      if(!RM&&snake)$('sboard').animate([{transform:'none'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(-4px)'},{transform:'none'}],{duration:400});
      el.classList.add('slide');
      const [x,y]=P(mv.end);el.style.left=x+'%';el.style.top=y+'%';
      await sleep(800);
      el.classList.remove('slide');
    }
  }finally{walking.delete(pi);if(sview)lay(sview);}
}
function srender(v){
  sview=v;show('snakesGame');
  if(!v.mv){lastRn=-1;swon=false;}
  v.players.forEach((p,i)=>{
    if(!tk[i]){const el=document.createElement('div');el.className='stk';el.style.background=HEX[SC[i]];$('sboard').appendChild(el);tk[i]=el;}
  });
  Object.keys(tk).forEach(i=>{if(+i>=v.players.length){tk[i].remove();delete tk[i];}});
  Object.entries(tk).forEach(([i,el])=>el.classList.toggle('turn',+i===v.cur&&!v.winner));
  const mine=v.cur===v.you&&!v.winner;
  $('sps').innerHTML=v.players.map((p,i)=>`<div class="lchip ${i===v.cur&&!v.winner?'turn':''}"><span class="av sm" style="background:${HEX[SC[i]]}">${esc(p.name[0]||'?').toUpperCase()}</span><span class="nm">${esc(p.name)}</span><span class="muted">${p.pos||'start'}</span></div>`).join('');
  const fresh=v.mv&&v.mv.rn>lastRn;
  if(fresh){lastRn=v.mv.rn;rollDie(v.dice);if(RM)lay(v);else walk(v.mv);}
  else if(!rollIv)showDie(v.dice);
  lay(v);
  $('sdie').style.borderColor=HEX[SC[v.cur]];
  $('smsg').textContent=v.msg;
  const b=$('sbanner');b.className='banner'+(mine?' me':'');
  b.textContent=v.winner?'':mine?(v.phase==='roll'?'Your turn: roll the dice':''):v.players[v.cur].name+"'s turn";
  $('sroll').disabled=!(mine&&v.phase==='roll');
  if(v.winner){
    setTimeout(()=>{
      if(!sview||!sview.winner||swon)return;
      swon=true;confetti();
      const won=sview.players[sview.you].name===sview.winner;
      overlay(won?'You win!':sview.winner+' wins!',won?'You reached square 100.':'Better luck next round.',sHost?'Play again':'Waiting for host...',()=>{if(sHost)sNew();});
      $('overB').disabled=!sHost;
    },anim(v.mv)+600);
  }else $('over').classList.remove('on');
}
function ssend(m){if(sHost)sRoll(0);else if(sConn&&sConn.open)sConn.send(m);}
$('sroll').onclick=()=>ssend({t:'roll'});

/* ---------- connection ---------- */
function sReset(){
  if(sp){try{sp.destroy();}catch(e){}}
  sp=null;sHost=false;sConn=null;sLobby=[];G=null;sview=null;tclear();
  $('over').classList.remove('on');$('overB').disabled=false;
  chatClear();unread=0;$('chatbadge').hidden=true;
  show('snakesHome');
}
function sname(){
  const n=$('sname').value.trim().slice(0,12)||'Player';
  try{localStorage.setItem('uno-name',n);}catch(e){}
  return n;
}
try{const n=localStorage.getItem('uno-name');if(n)$('sname').value=n;}catch(e){}
function sUniq(n){let x=n.slice(0,12)||'Player',q=2;const all=sLobby.map(p=>p.name);while(all.includes(x))x=n.slice(0,10)+q++;return x;}
function sCreate(){
  sName=sname();sHost=true;sCode=makeCode();
  sp=new Peer('snakesparty-'+sCode);
  sp.on('open',()=>{sLobby=[{name:sName,bot:false,conn:null}];show('snakesLobby');sSendLobby();});
  sp.on('error',e=>{
    if(e.type==='unavailable-id'){sp.destroy();sCreate();}
    else{toast('Connection problem ('+e.type+'). Try again.');sReset();}
  });
  sp.on('connection',c=>{c.on('data',m=>sHostData(c,m));c.on('close',()=>sLeft(c));});
}
function sJoin(){
  sName=sname();sCode=$('scode').value.trim().toUpperCase();
  if(sCode.length!==4)return toast('Enter the 4-letter room code.');
  sp=new Peer();
  sp.on('open',()=>{
    const c=sConn=sp.connect('snakesparty-'+sCode,{reliable:true});
    const t=setTimeout(()=>{if(c.open||sConn!==c)return;toast('Could not reach that room. Check the code.');sReset();},9000);
    c.on('open',()=>{clearTimeout(t);c.send({t:'join',name:sName});});
    c.on('data',sGuestData);
    c.on('close',()=>{if(sview||$('snakesLobby').classList.contains('on'))overlay('Host left','The game has ended.','Back to start',sReset);});
  });
  sp.on('error',e=>{toast(e.type==='peer-unavailable'?'Room not found. Check the code.':'Connection problem ('+e.type+').');if(e.type!=='network')sReset();});
}
function sGuestData(m){
  if(m.t==='lobby'){sCode=m.code;sDrawLobby(m.names);show('snakesLobby');}
  else if(m.t==='state')srender(m.v);
  else if(m.t==='chat')chatAdd(m.from,m.text,m.mine);
  else if(m.t==='full'){toast(m.why);sReset();}
}
function sHostData(c,m){
  if(m.t==='chat'){
    const p=(G?G.players:sLobby).find(x=>x.conn===c);
    if(p&&typeof m.text==='string')sChatRelay(p.name,m.text.slice(0,140),c);
    return;
  }
  if(m.t==='join'){
    if(G)return c.send({t:'full',why:'That game has already started.'});
    if(sLobby.length>=4)return c.send({t:'full',why:'That room is full (4 players max).'});
    sLobby.push({name:sUniq(String(m.name||'')),bot:false,conn:c});sSendLobby();
  }else if(G&&m.t==='roll'){
    const i=G.players.findIndex(p=>p.conn===c);
    if(i>0)sRoll(i);
  }
}
function sLeft(c){
  if(G){
    const p=G.players.find(x=>x.conn===c);if(!p)return;
    p.conn=null;p.bot=true;p.name+=' 🤖';
    G.msg=p.name+' left and a bot took over';
    scast();sbotq();
  }else{sLobby=sLobby.filter(p=>p.conn!==c);sSendLobby();}
}
function sSendLobby(){
  const names=sLobby.map(p=>p.name+(p.bot?' 🤖':''));
  sLobby.forEach(p=>p.conn&&p.conn.open&&p.conn.send({t:'lobby',names,code:sCode}));
  sDrawLobby(names);
}
function sDrawLobby(names){
  $('sroomcode').textContent=sCode;
  $('splist').innerHTML=names.map((n,i)=>`<li><span class="av" style="background:${HEX[SC[i]]};color:${i===3?'#241300':'#fff'}">${esc(n[0]||'?').toUpperCase()}</span>${esc(n)}${i===0?' <span class="muted">(host)</span>':''}</li>`).join('');
  $('shostbtns').style.display=sHost?'flex':'none';
  $('swait').style.display=sHost?'none':'block';
}

/* ---------- buttons ---------- */
$('playsnakes').onclick=()=>show('snakesHome');
$('screate').onclick=sCreate;
$('sjoin').onclick=sJoin;
$('scode').onkeydown=e=>{if(e.key==='Enter')sJoin();};
$('sleave').onclick=sReset;
$('sbotbtn').onclick=()=>{if(sLobby.length>=4)return toast('Room is full (4 players max).');sLobby.push({name:sUniq('Bot'),bot:true,conn:null});sSendLobby();};
$('sstart').onclick=()=>{if(sLobby.length<2)return toast('You need at least 2 players. Add a bot or wait for friends.');G=null;sNew();};
$('scopy').onclick=async()=>{
  const link=location.href.split('#')[0].split('?')[0]+'?game=snakes#'+sCode;
  try{await navigator.clipboard.writeText(link);toast('Invite link copied.');}catch(e){toast(link);}
};

/* brand link: leave Snakes properly, otherwise use the existing handler */
const oldBrand3=$('brand').onclick;
$('brand').onclick=e=>{
  if(!document.querySelector('.screen.on').id.startsWith('snakes'))return oldBrand3(e);
  e.preventDefault();
  if(sp&&!confirm('Leave the current room and go back to all games?'))return;
  sReset();show('hub');
};

/* invite links: ?game=snakes#ABCD */
if(new URLSearchParams(location.search).get('game')==='snakes'){
  $('scode').value=location.hash.slice(1,5).toUpperCase();show('snakesHome');
}
})();
