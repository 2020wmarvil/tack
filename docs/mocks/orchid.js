/* Interactive UI study. State is deliberately in memory and resets on reload. */
(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={pin:'<path d="m16 3 5 5-4 2-3 6-2-2-6 6-1-1 6-6-2-2 6-3z"/>',chevrons:'<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>',card:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8m-8 4h6"/>',plus:'<path d="M12 5v14M5 12h14"/>',x:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',checklist:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m6 12 2 2 3-4m3 1h4m-4 5h4"/>',bold:'<path d="M7 4h6a4 4 0 0 1 0 8H7m0-8v16h7a4 4 0 0 0 0-8H7"/>',italic:'<path d="M10 4h9M5 20h9M15 4 9 20"/>',strike:'<path d="M17 6c-1-3-10-3-10 2 0 2 3 3 5 4m-5 5c1 4 10 4 10-1M3 12h18"/>',bullets:'<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r=".7"/><circle cx="4" cy="12" r=".7"/><circle cx="4" cy="18" r=".7"/>',numbers:'<path d="M10 6h11M10 12h11M10 18h11M3 4h1v5M2 9h4M2 14c0-3 5-3 4 0l-4 5h4"/>',quote:'<path d="M4 6h6v7H5c0 3 1 4 3 5M14 6h6v7h-5c0 3 1 4 3 5"/>',code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',codeblock:'<rect x="2" y="3" width="20" height="18" rx="3"/><path d="m9 8-4 4 4 4m6-8 4 4-4 4"/>',link:'<path d="m10 13 4-4m-7 6-1 1a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6m1-3 1-1a4 4 0 0 0-6-6L8 6a4 4 0 0 0 0 6" transform="translate(1 -1) scale(.9)"/>',minus:'<path d="M4 12h16"/>',edit:'<path d="m15 4 5 5-10 10-6 1 1-6zM13 6l5 5"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'};
function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.card}</svg>`;}
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon);});}
icons();
const columns=Object.freeze(['Backlog','Ready','In Progress','In Review','Finished']);let serial=0,boardSerial=0,projectSerial=0;
const card=(title,items=[],description='')=>({id:++serial,title,description,items:items.map((text,i)=>({text,done:i===0}))});
const newBoard=name=>({id:++boardSerial,name,columns:columns.map(name=>({name,cards:[]}))});
let projects=[{id:++projectSerial,name:'Atlas Engine',path:'~/Projects/atlas-engine.md',boards:['Rendering','Physics','Editor'].map(newBoard)},{id:++projectSerial,name:'Weekend project',path:'~/Projects/weekend-project.md',boards:[newBoard('Ideas')]}];
const rendering=projects[0].boards[0];rendering.columns.forEach((col,i)=>col.cards=[
 [card('Explore a deferred lighting pass'),card('Shadows flicker at shallow angles'),card('Remember the viewport background')],
 [card('Add a wireframe view',['Draw triangle edges','Add viewport toggle','Check dense meshes']),card('Texture thumbnails look washed out')],
 [card('Build the material inspector',['Lay out the material fields','Preview changes in the viewport','Handle missing textures'],'Edit a material without leaving the scene. Keep the first pass focused on **base color**, roughness and metallic.\n\nUse the [material reference](https://example.com/materials) for the field layout.')],
 [],[card('Clear the viewport on resize'),card('Draw the world grid')]
][i]);
projects[0].boards[1].columns[0].cards=[card('Add capsule colliders'),card('Bodies jitter when stacked')];projects[0].boards[1].columns[2].cards=[card('Draw collision shapes')];projects[0].boards[2].columns[0].cards=[card('Keep the last open scene')];projects[1].boards[0].columns[0].cards=[card('Build a little garden planner')];
const scenario=new URLSearchParams(location.search).get('state');
if(scenario==='empty')projects[1].boards=[];
if(scenario==='long'){projects[0].name='Atlas Engine: tools, rendering and interactive worlds';projects[0].boards[0].name='Rendering engine, material tools and viewport improvements';rendering.columns[0].cards[0].title='Fix shader compilation errors when reloading materials in the experimental rendering pipeline';rendering.columns[0].cards[1].title='HandleVeryLongUnbrokenIdentifiersWithoutClippingTheCardOrColumnAtNarrowWindowSizes';}
let project=scenario==='welcome'?null:scenario==='empty'?projects[1]:projects[0],board=scenario==='welcome'||scenario==='empty'?null:rendering,editing=null,draft=null,mode='visual',creatingCol=null,previousFocus=null,linkRange=null;
const initials=name=>name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
const history=[],future=[],draftHistory=[],draftFuture=[];
const addStyle=new URLSearchParams(location.search).get('add')||'inline';
document.documentElement.dataset.add=addStyle;
function snapshot(){return structuredClone({projects,projectId:project?.id,boardId:board?.id,serial,boardSerial,projectSerial});}
function restore(s){projects=s.projects;project=projects.find(p=>p.id===s.projectId)||null;board=project?.boards.find(b=>b.id===s.boardId)||project?.boards[0]||null;serial=s.serial;boardSerial=s.boardSerial;projectSerial=s.projectSerial;closeProjects();$('#new-board').hidden=true;render();}
function record(label){history.push({label,state:snapshot()});future.length=0;$('.toast').hidden=true;}
function notify(message){$('#toast-message').textContent=message;$('#undo').hidden=false;$('.toast').hidden=false;}
function travel(redo=false){const from=redo?future:history,to=redo?history:future;if(!from.length)return;const entry=from.pop();to.push({label:entry.label,state:snapshot()});restore(entry.state);$('#toast-message').textContent=(redo?'Redid: ':'Undid: ')+entry.label;$('#undo').hidden=history.length===0;$('.toast').hidden=false;}
function draftSnapshot(){return {draft:structuredClone(draft),title:$('#card-title').value,html:$('#description').innerHTML,md:$('#markdown').value,mode};}
function recordDraft(){draftHistory.push(draftSnapshot());draftFuture.length=0;}
function travelDraft(redo=false){const from=redo?draftFuture:draftHistory,to=redo?draftHistory:draftFuture;if(!from.length)return;const entry=from.pop();to.push(draftSnapshot());draft=entry.draft;$('#card-title').value=entry.title;$('#description').innerHTML=entry.html;$('#markdown').value=entry.md;mode=entry.mode;$('#visual-panel').hidden=mode!=='visual';$('#markdown-panel').hidden=mode!=='markdown';$('#visual-mode').setAttribute('aria-selected',String(mode==='visual'));$('#markdown-mode').setAttribute('aria-selected',String(mode==='markdown'));renderChecks();}
document.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const key=e.key.toLowerCase(),redo=(key==='z'&&e.shiftKey)||key==='y';if(key!=='z'&&key!=='y')return;if($('dialog[open]')&&!$('#editor').open)return;const el=e.target,isText=el.isContentEditable||el.closest('[contenteditable=true]')||el.matches('textarea,input:not([type=checkbox]):not([type=radio])');if(isText&&($('#editor').open||el.value))return;e.preventDefault();if($('#editor').open)travelDraft(redo);else travel(redo);});
function addControl(i){if(addStyle==='popup')return '';if(addStyle==='quick')return `<form class="quick-form" data-quick="${i}"><input placeholder="Add a card…" aria-label="New card title for ${columns[i]}"><button aria-label="Create card in ${columns[i]}" type="submit">${icon('plus')}</button></form>`;return `<button class="add-card" data-add="${i}">${icon('plus')}Add card</button>`;}

const filename=path=>path.replaceAll('\\','/').split('/').pop();
function render(){
 $('.main').classList.toggle('welcome',!project);$('.add-board').disabled=!project;$('.rename-board').hidden=!board;
 $('#project-name').textContent=project?.name||'Open a project';$('#project-initials').textContent=project?initials(project.name):'+';
 $('.project-trigger').title=project?.name||'Open a project';
 $('.board-nav').innerHTML=(project?.boards||[]).map(b=>`<div class="board-row ${b===board?'active':''}"><button class="board-link" data-board="${b.id}" title="${esc(b.name)}" ${b===board?'aria-current="page"':''}>${icon('card')}<span>${esc(b.name)}</span></button><button class="board-delete" data-delete-board="${b.id}" aria-label="Delete ${esc(b.name)} board">${icon('x')}</button></div>`).join('');
 $('#board-title').textContent=board?.name||project?.name||'Tack';$('#board-file').textContent=project?filename(project.path):'';$('#board-file').title=project?.path||'';
 if(!project){$('#board').innerHTML='<div class="empty-project"><img class="welcome-logo" src="../branding/tack.svg" alt=""><h2>A little room for your next idea.</h2><p>Open a project or start a new one.<br>Each project lives in a single Markdown file.</p><div class="empty-actions"><button class="primary" data-start="new">New project</button><button class="secondary" data-start="open">Open project</button></div></div>';return;}
 if(!board){$('#board').innerHTML=`<div class="empty-project">${icon('card').replace('<svg ','<svg class="empty-icon" ')}<h2>Your first board starts here.</h2><p>A board can hold one area of your project.<br>Give it a name and start adding cards.</p><button class="primary" data-first-board>Add board</button></div>`;return;}
 $('#board').innerHTML=board.columns.map((col,i)=>`<section class="column" data-col="${i}" aria-label="${col.name}"><header class="column-head"><span>${col.name}</span>${addStyle==='popup'?`<button class="header-add icon-button" data-add="${i}" aria-label="Add card to ${col.name}">${icon('plus')}</button>`:''}</header><div class="cards">${col.cards.map(c=>`<button class="ticket" data-id="${c.id}"><span class="ticket-title">${esc(c.title)}</span>${c.items.length?`<span class="ticket-meta">${icon('checklist')} ${c.items.filter(x=>x.done).length} / ${c.items.length}</span>`:''}</button>`).join('')}</div>${addControl(i)}</section>`).join('');
}
function renderProjects(){
 $('#project-menu').innerHTML='<div class="menu-heading">Your projects</div>'+projects.map(p=>`<button class="project-option" role="menuitemradio" aria-checked="${p===project}" data-project="${p.id}"><span class="project-avatar">${initials(p.name)}</span><span class="project-caption"><span class="project-name">${esc(p.name)}</span><span class="project-path" title="${esc(p.path)}">${esc(filename(p.path))}</span></span>${p===project?icon('check'):''}</button>`).join('')+`<hr class="menu-divider"><button class="menu-create" role="menuitem" id="open-project">${icon('card')}Open project...</button><button class="menu-create" role="menuitem" id="new-project">${icon('plus')}New project...</button>${project?`<hr class="menu-divider"><button class="menu-create" role="menuitem" id="rename-project">${icon('edit')}Rename project...</button>`:''}`;
}
function closeProjects(focus=false){$('#project-menu').hidden=true;$('.project-trigger').setAttribute('aria-expanded','false');if(focus)$('.project-trigger').focus();}
$('.project-trigger').onclick=()=>{const open=$('#project-menu').hidden;if(open)renderProjects();$('#project-menu').hidden=!open;$('.project-trigger').setAttribute('aria-expanded',String(open));};
$('#project-menu').onclick=e=>{
 const option=e.target.closest('[data-project]');if(option){project=projects.find(p=>p.id===Number(option.dataset.project));board=project.boards[0]||null;closeProjects(true);render();return;}
 if(e.target.closest('#new-project'))showNewProject();
 if(e.target.closest('#open-project'))showOpenProject();
 if(e.target.closest('#rename-project'))showRename('project');
};
let renameKind='board';
const slug=name=>name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'my-project';
function showNewProject(){closeProjects();$('#project-form').reset();$('#project-path').value='~/Projects/my-project.md';$('#project-path').dataset.edited='';$('#project-dialog').showModal();$('#new-project-name').focus();}
$('#new-project-name').oninput=e=>{if(!$('#project-path').dataset.edited)$('#project-path').value='~/Projects/'+slug(e.target.value)+'.md';};
$('#project-path').oninput=e=>{e.target.dataset.edited='yes';e.target.setCustomValidity('');};
function validatePath(input){input.setCustomValidity(/\.md$/i.test(input.value.trim())?'':'Choose a Markdown file ending in .md.');return input.reportValidity();}
$('#project-form').onsubmit=e=>{e.preventDefault();if(!validatePath($('#project-path')))return;const name=$('#new-project-name').value.trim(),path=$('#project-path').value.trim();if(!name)return;record('Create project');project={id:++projectSerial,name,path,boards:[]};projects.push(project);board=null;$('#project-dialog').close();render();};
function showOpenProject(){closeProjects();$('#open-form').reset();$('#open-path').setCustomValidity('');$('#recent-files').innerHTML='<div class="recent-label">Recent projects</div>'+projects.map(p=>`<button class="file-choice" type="button" data-recent="${p.id}">${icon('card')}<span><b>${esc(p.name)}</b><small>${esc(p.path)}</small></span></button>`).join('');$('#open-dialog').showModal();$('#open-path').focus();}
$('#recent-files').onclick=e=>{const b=e.target.closest('[data-recent]');if(b){project=projects.find(p=>p.id===Number(b.dataset.recent));board=project.boards[0]||null;$('#open-dialog').close();render();}};
$('#open-path').oninput=e=>e.target.setCustomValidity('');
$('#browse-project').onclick=()=>$('#project-file-input').click();
$('#project-file-input').onchange=e=>{const f=e.target.files[0];if(f){$('#open-path').value=f.name;$('#open-path').setCustomValidity('');}e.target.value='';};
$('#open-form').onsubmit=e=>{e.preventDefault();if(!validatePath($('#open-path')))return;const path=$('#open-path').value.trim(),found=projects.find(p=>p.path===path||filename(p.path)===filename(path));if(found){project=found;board=project.boards[0]||null;}else{record('Open project preview');project={id:++projectSerial,name:filename(path).replace(/\.md$/i,'').replaceAll('-',' '),path,boards:[]};projects.push(project);board=null;notify('File opening preview. File contents were not imported.');}$('#open-dialog').close();render();};
function showRename(kind){if(kind==='board'&&!board||kind==='project'&&!project)return;closeProjects();renameKind=kind;const title=kind==='board'?'Board':'Project';$('#rename-dialog-title').textContent='Rename '+kind;$('#rename-label').textContent=title+' name';$('#rename-value').value=kind==='board'?board.name:project.name;$('#rename-help').textContent=kind==='board'?'The board stays in the same project file.':'This changes the display name. Your project file stays at '+project.path;$('#rename-dialog').showModal();$('#rename-value').focus();$('#rename-value').select();}
$('.rename-board').onclick=()=>showRename('board');$('#board-title').ondblclick=()=>showRename('board');
$('#rename-form').onsubmit=e=>{e.preventDefault();const name=$('#rename-value').value.trim(),target=renameKind==='board'?board:project;if(!name)return;if(name!==target.name){record('Rename '+renameKind);target.name=name;}$('#rename-dialog').close();render();};
$$('[data-close-dialog]').forEach(b=>b.onclick=()=>$('#'+b.dataset.closeDialog).close());
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.project-picker'))closeProjects();});
$('#project-menu').onkeydown=e=>{const items=[...$('#project-menu').querySelectorAll('button')];if(e.key==='Escape'){e.preventDefault();closeProjects(true);}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const i=items.indexOf(document.activeElement),next=(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}};
$('.project-trigger').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();renderProjects();$('#project-menu').hidden=false;$('.project-trigger').setAttribute('aria-expanded','true');$('#project-menu button').focus();}};
$('.board-nav').onclick=e=>{
 const del=e.target.closest('[data-delete-board]');if(del){const owner=project,index=owner.boards.findIndex(b=>b.id===Number(del.dataset.deleteBoard)),removed=owner.boards[index];record('Delete board');owner.boards.splice(index,1);if(board===removed)board=owner.boards[index]||owner.boards[index-1]||null;render();notify('Board deleted');return;}
 const link=e.target.closest('[data-board]');if(link){board=project.boards.find(b=>b.id===Number(link.dataset.board));render();}
};
$('.add-board').onclick=()=>{if(!project)return;$('#new-board').hidden=false;$('#new-board').focus();};
$('#new-board').onkeydown=e=>{if(e.key==='Enter'&&e.target.value.trim()){record('Create board');board=newBoard(e.target.value.trim());project.boards.push(board);e.target.value='';e.target.hidden=true;render();}if(e.key==='Escape'){e.target.hidden=true;e.target.value='';$('.add-board').focus();}};
function find(id){for(const col of board.columns){const c=col.cards.find(c=>c.id===id);if(c)return {col,c};}}
function createCard(col,title){record('Create card');col.cards.push(card(title));render();}
$('#board').onsubmit=e=>{const form=e.target.closest('[data-quick]');if(!form)return;e.preventDefault();const title=form.querySelector('input').value.trim();if(!title)return;const i=Number(form.dataset.quick);createCard(board.columns[i],title);$('#board').querySelector(`[data-quick="${i}"] input`).focus();};
$('#board').onclick=e=>{
 if(e.target.closest('[data-first-board]')){$('.add-board').click();return;}const start=e.target.closest('[data-start]');if(start){start.dataset.start==='new'?showNewProject():showOpenProject();return;}
 const ticket=e.target.closest('[data-id]');if(ticket){open(Number(ticket.dataset.id));return;}
 const add=e.target.closest('button[data-add]');if(!add)return;const i=Number(add.dataset.add),col=board.columns[i];
 if(addStyle==='popup'){openCreate(i);return;}
 if($('.creation-form')){const prior=$('.creation-form');prior.previousButton.hidden=false;prior.remove();}
 const form=document.createElement('form');form.className='creation-form '+(addStyle==='inline'?'inline-composer':'footer-composer');form.previousButton=add;
 form.innerHTML=`<textarea placeholder="What needs doing?" aria-label="New card title" rows="${addStyle==='inline'?3:2}" required></textarea><div class="composer-actions"><button class="primary" type="submit">Add card</button><button type="button" class="icon-button" data-cancel-add aria-label="Cancel new card">${icon('x')}</button><span>Enter to add</span></div>`;
 add.hidden=true;if(addStyle==='inline')add.closest('.column').querySelector('.cards').append(form);else add.after(form);const input=form.querySelector('textarea');input.focus();
 const cancel=()=>{form.remove();add.hidden=false;add.focus();};form.onsubmit=ev=>{ev.preventDefault();const title=input.value.trim();if(!title)return;createCard(col,title);};form.querySelector('[data-cancel-add]').onclick=cancel;
 input.onkeydown=ev=>{if(ev.key==='Escape')cancel();if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();form.requestSubmit();}};
};

function inline(text){return esc(text).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/~~(.+?)~~/g,'<s>$1</s>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');}
function toHtml(md){
 const lines=md.replace(/\r\n/g,'\n').split('\n'),out=[];let i=0;
 while(i<lines.length){let line=lines[i];if(!line.trim()){i++;continue;}
 if(/^```/.test(line)){const code=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);i++;out.push('<pre>'+esc(code.join('\n'))+'</pre>');continue;}
 if(/^#{1,6} /.test(line)){out.push('<h2>'+inline(line.replace(/^#{1,6} /,''))+'</h2>');i++;continue;}
 if(/^---+$/.test(line.trim())){out.push('<hr>');i++;continue;}
 if(/^> ?/.test(line)){const quote=[];while(i<lines.length&&/^> ?/.test(lines[i]))quote.push(inline(lines[i++].replace(/^> ?/,'')));out.push('<blockquote>'+quote.join('<br>')+'</blockquote>');continue;}
 if(/^(?:[-*] |\d+\. )/.test(line)){const ordered=/^\d+\. /.test(line),rx=ordered?/^\d+\. /:/^[-*] /,items=[];while(i<lines.length&&rx.test(lines[i]))items.push('<li>'+inline(lines[i++].replace(rx,''))+'</li>');out.push(ordered?'<ol>'+items.join('')+'</ol>':'<ul>'+items.join('')+'</ul>');continue;}
 const para=[];while(i<lines.length&&lines[i].trim()&&!/^(?:```|#{1,6} |>|[-*] |\d+\. |---+$)/.test(lines[i]))para.push(inline(lines[i++]));if(para.length)out.push('<p>'+para.join('<br>')+'</p>');else i++;
 }return out.join('');
}
function toMd(){
 function node(n){if(n.nodeType===3)return n.textContent;if(n.nodeType!==1)return '';const tag=n.tagName,children=()=>[...n.childNodes].map(node).join('');
 if(tag==='PRE')return '\n\n```\n'+n.textContent.replace(/\n$/,'')+'\n```\n\n';
 if(tag==='OL'||tag==='UL')return '\n\n'+[...n.children].filter(c=>c.tagName==='LI').map((li,i)=>(tag==='OL'?(i+1)+'. ':'- ')+[...li.childNodes].map(node).join('').trim()).join('\n')+'\n\n';
 if(['STRONG','B'].includes(tag))return '**'+children()+'**';if(['EM','I'].includes(tag))return '*'+children()+'*';if(['S','STRIKE','DEL'].includes(tag))return '~~'+children()+'~~';if(tag==='CODE')return '`'+children()+'`';if(tag==='A')return '['+children()+']('+n.getAttribute('href')+')';if(tag==='BR')return '\n';if(tag==='HR')return '\n\n---\n\n';if(tag==='BLOCKQUOTE')return '\n\n'+children().trim().split('\n').map(l=>'> '+l).join('\n')+'\n\n';if(/^H[1-6]$/.test(tag))return '\n\n## '+children().trim()+'\n\n';if(['P','DIV'].includes(tag))return children()+'\n\n';return children();
 }return [...$('#description').childNodes].map(node).join('').replace(/\n{3,}/g,'\n\n').trim();
}
function renderChecks(){
 $('#checklist').innerHTML=draft.items.map((it,i)=>`<div class="check-row ${it.done?'done':''}"><input type="checkbox" data-check="${i}" aria-label="Complete checklist item ${i+1}" ${it.done?'checked':''}><input class="item-text" data-item="${i}" value="${esc(it.text)}" aria-label="Checklist item ${i+1}"><button class="icon-button item-remove" data-remove-item="${i}" aria-label="Remove checklist item ${i+1}">${icon('x')}</button></div>`).join('');$('#check-progress').textContent=draft.items.length?`${draft.items.filter(x=>x.done).length} of ${draft.items.length}`:'';
}
function sizeTitle(){const t=$('#card-title');t.style.height='auto';t.style.height=Math.min(t.scrollHeight,170)+'px';t.style.overflowY=t.scrollHeight>170?'auto':'hidden';}
$('#card-title').oninput=sizeTitle;$('#card-title').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$(mode==='visual'?'#description':'#markdown').focus();}};
function showDraft(){previousFocus=document.activeElement;$('#card-title').value=draft.title;$('#card-board').textContent=board.name;$('#card-column').textContent=creatingCol!==null?columns[creatingCol]:find(editing).col.name;mode='visual';$('#description').innerHTML=toHtml(draft.description);$('#visual-panel').hidden=false;$('#markdown-panel').hidden=true;$('#visual-mode').setAttribute('aria-selected','true');$('#markdown-mode').setAttribute('aria-selected','false');$('.link-popup').hidden=true;$('#delete-card').hidden=creatingCol!==null;$('#save').textContent=creatingCol!==null?'Create card':'Save';draftHistory.length=0;draftFuture.length=0;renderChecks();$('#editor').showModal();sizeTitle();$('#card-title').focus();}
function open(id){creatingCol=null;editing=id;draft=structuredClone(find(id).c);showDraft();}
function openCreate(col){creatingCol=col;editing=null;draft={id:null,title:'',description:'',items:[]};showDraft();}

function close(){$('#editor').close();draft=null;editing=null;creatingCol=null;previousFocus?.focus();}
$('#close').onclick=$('#cancel').onclick=close;$('#editor').addEventListener('cancel',e=>{e.preventDefault();if(!$('.link-popup').hidden){$('.link-popup').hidden=true;$('#description').focus();}else close();});
function switchMode(next){if(next===mode)return;if(next==='markdown')$('#markdown').value=toMd();else $('#description').innerHTML=toHtml($('#markdown').value);mode=next;$('#visual-panel').hidden=mode!=='visual';$('#markdown-panel').hidden=mode!=='markdown';$('#visual-mode').setAttribute('aria-selected',String(mode==='visual'));$('#markdown-mode').setAttribute('aria-selected',String(mode==='markdown'));$('.link-popup').hidden=true;}
$('#visual-mode').onclick=()=>switchMode('visual');$('#markdown-mode').onclick=()=>switchMode('markdown');
$('.mode-switch').onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();switchMode(mode==='visual'?'markdown':'visual');$(mode==='visual'?'#visual-mode':'#markdown-mode').focus();}};
$('#save').onclick=()=>{const title=$('#card-title').value.trim();if(!title){$('#card-title').focus();return;}const desc=mode==='visual'?toMd():$('#markdown').value;
 if(creatingCol!==null){record('Create card');draft.id=++serial;draft.title=title;draft.description=desc;board.columns[creatingCol].cards.push(draft);}
 else{const f=find(editing),next={...draft,title,description:desc};if(JSON.stringify(f.c)!==JSON.stringify(next)){record('Edit card');f.col.cards[f.col.cards.indexOf(f.c)]=next;}}
 close();render();};
$('#delete-card').onclick=()=>{const f=find(editing);record('Delete card');f.col.cards.splice(f.col.cards.indexOf(f.c),1);close();render();notify('Card deleted');};
$('#undo').onclick=()=>travel();$('.dismiss-toast').onclick=()=>{$('.toast').hidden=true;};

$('#checklist').oninput=e=>{if(e.target.dataset.item!==undefined)draft.items[Number(e.target.dataset.item)].text=e.target.value;};
$('#checklist').onchange=e=>{if(e.target.dataset.check!==undefined){recordDraft();draft.items[Number(e.target.dataset.check)].done=e.target.checked;renderChecks();}};
$('#checklist').onclick=e=>{const b=e.target.closest('[data-remove-item]');if(b){recordDraft();draft.items.splice(Number(b.dataset.removeItem),1);renderChecks();}};
$('#add-item').onclick=()=>{recordDraft();draft.items.push({text:'',done:false});renderChecks();$('#checklist').lastElementChild.querySelector('.item-text').focus();};
function updateTools(){const sel=getSelection();if(!sel.rangeCount||!$('#description').contains(sel.anchorNode))return;$$('[data-command][aria-pressed]').forEach(b=>b.setAttribute('aria-pressed',String(document.queryCommandState(b.dataset.command))));let n=sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentElement;$('.text-style').value=n.closest('h2')?'h2':'p';}
document.addEventListener('selectionchange',updateTools);
$('.toolbar').addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault();});
$('.toolbar').onclick=e=>{const b=e.target.closest('button');if(!b)return;const el=$('#description');if(b.id==='insert-link'){showLink();return;}el.focus();if(b.dataset.command){document.execCommand(b.dataset.command);updateTools();}else if(b.dataset.action==='quote'){document.execCommand('formatBlock',false,'blockquote');}else if(b.dataset.action==='code'){const selection=getSelection(),text=selection.toString();document.execCommand('insertHTML',false,'<pre>'+esc(text||'// Your code here')+'</pre><p><br></p>');}};
$('.text-style').onchange=e=>{$('#description').focus();document.execCommand('formatBlock',false,e.target.value);};
function showLink(){const selection=getSelection();linkRange=selection.rangeCount&&$('#description').contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null;$('.link-popup').hidden=false;$('#link-url').value='';$('#link-url').focus();}
$('#apply-link').onclick=()=>{let url=$('#link-url').value.trim();if(!/^https?:\/\//i.test(url)){$('#link-url').setCustomValidity('Use an http or https link.');$('#link-url').reportValidity();return;}$('#link-url').setCustomValidity('');$('#description').focus();const sel=getSelection();if(linkRange){sel.removeAllRanges();sel.addRange(linkRange);}if(sel.toString())document.execCommand('createLink',false,url);else document.execCommand('insertHTML',false,'<a href="'+esc(url)+'">'+esc(url)+'</a>');$('.link-popup').hidden=true;};
$('#link-url').oninput=e=>e.target.setCustomValidity('');$('#link-url').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#apply-link').click();}};$('#cancel-link').onclick=()=>{$('.link-popup').hidden=true;$('#description').focus();};
$('#description').onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showLink();}if(e.key==='Tab'&&getSelection().anchorNode?.parentElement?.closest('pre')){e.preventDefault();document.execCommand('insertText',false,'  ');}};
$('#description').onpaste=e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));};
window.mockDrop=(id,dest,index,commit)=>{if(commit){const f=find(id);const source=f.col.cards.indexOf(f.c);if(f.col!==board.columns[dest]||source!==index)record('Move card');f.col.cards.splice(f.col.cards.indexOf(f.c),1);board.columns[dest].cards.splice(index,0,f.c);}render();};
render();
})();
