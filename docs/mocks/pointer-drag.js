/* Pointer-based mock drag. Ghost follows the pointer; live slot gives precise ordering. */
(()=>{
const board=document.querySelector('#board'),area=document.querySelector('.board-area');
let pending=null,active=null,suppress=0,raf=0;
board.addEventListener('dragstart',e=>e.preventDefault());
board.addEventListener('click',e=>{if(performance.now()<suppress){e.preventDefault();e.stopImmediatePropagation();}},true);
board.addEventListener('pointerdown',e=>{
 if(!active)suppress=0;
 const node=e.target.closest('.ticket');if(!node||e.button!==0)return;
 suppress=0;pending={node,id:Number(node.dataset.id),x:e.clientX,y:e.clientY,pointer:e.pointerId};
});
function begin(e){
 const p=pending,r=p.node.getBoundingClientRect(),slot=document.createElement('div');
 slot.className='drag-slot';slot.style.height=r.height+'px';slot.setAttribute('aria-label','Drop position');
 const ghost=p.node.cloneNode(true);ghost.removeAttribute('data-id');ghost.removeAttribute('draggable');ghost.setAttribute('aria-hidden','true');ghost.classList.add('drag-ghost');ghost.style.width=r.width+'px';ghost.style.height=r.height+'px';
 p.node.replaceWith(slot);document.body.append(ghost);document.body.classList.add('drag-active');
 active={...p,slot,ghost,dx:p.x-r.left,dy:p.y-r.top,cx:e.clientX,cy:e.clientY};pending=null;
 place(e);raf=requestAnimationFrame(scroll);
}
function place(e){
 const a=active;if(!a)return;a.cx=e.clientX;a.cy=e.clientY;
 a.ghost.style.left=(a.cx-a.dx)+'px';a.ghost.style.top=(a.cy-a.dy)+'px';
 const hit=document.elementFromPoint(a.cx,a.cy);let col=hit?.closest('.column');if(!col&&area.contains(hit))col=[...board.querySelectorAll('.column')].find(c=>{const r=c.getBoundingClientRect();return a.cx>=r.left&&a.cx<=r.right&&a.cy>=r.top;});if(!col)return;
 const list=col.querySelector('.cards'),cards=[...list.querySelectorAll('.ticket')];
 let next=cards.find(n=>a.cy<n.getBoundingClientRect().top+n.getBoundingClientRect().height/2)||null;
 if(a.slot.parentNode===list&&a.slot.nextElementSibling===next)return;
 const nodes=[...board.querySelectorAll('.ticket')];nodes.forEach(n=>n.getAnimations().forEach(x=>x.cancel()));
 const before=new Map(nodes.map(n=>[n,n.getBoundingClientRect()]));list.insertBefore(a.slot,next);
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const n of nodes){const b=before.get(n),r=n.getBoundingClientRect(),x=b.left-r.left,y=b.top-r.top;if(x||y)n.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});}
}
function scroll(){if(!active)return;const r=area.getBoundingClientRect(),a=active;let dx=0,dy=0;if(a.cx>r.right-65)dx=14;else if(a.cx<r.left+65)dx=-14;if(a.cy>r.bottom-55)dy=12;else if(a.cy<r.top+45)dy=-12;if(dx||dy){area.scrollBy(dx,dy);place({clientX:a.cx,clientY:a.cy});}raf=requestAnimationFrame(scroll);}
document.addEventListener('pointermove',e=>{if(pending&&e.pointerId===pending.pointer&&Math.hypot(e.clientX-pending.x,e.clientY-pending.y)>5)begin(e);else if(active)place(e);if(active)e.preventDefault();},{passive:false});
function end(commit){
 pending=null;if(!active)return;const a=active;active=null;cancelAnimationFrame(raf);suppress=performance.now()+450;
 const dest=Number(a.slot.closest('[data-col]').dataset.col),index=[...a.slot.parentNode.children].filter(n=>n.classList.contains('ticket')&&Boolean(n.compareDocumentPosition(a.slot)&Node.DOCUMENT_POSITION_FOLLOWING)).length;
 const finish=()=>{a.ghost.remove();document.body.classList.remove('drag-active');window.mockDrop(a.id,dest,index,commit);};
 if(commit&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const r=a.slot.getBoundingClientRect();a.ghost.animate([{left:a.ghost.style.left,top:a.ghost.style.top,transform:'rotate(1.5deg) scale(1.025)'},{left:r.left+'px',top:r.top+'px',transform:'rotate(0) scale(1)'}],{duration:120,easing:'ease-out',fill:'forwards'}).finished.then(finish);}else finish();
}
document.addEventListener('pointerup',()=>end(true));document.addEventListener('pointercancel',()=>end(false));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();end(false);}});window.addEventListener('blur',()=>end(false));
})();
