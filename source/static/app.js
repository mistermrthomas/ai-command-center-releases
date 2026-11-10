'use strict';
const el = id => document.getElementById(id);
let conversations = [], selected = null, current = null, settings = null;
let toastTimer;
let loginRedirecting=false;
let work = {priorities:[],approvals:[],changes:[],review:{}};
let editingPriorityId = null;
let pendingOutbound=null;
let pollInFlight=false;
let lastThreadSnapshot='';
let newSubmissionId=null;
const POLL_INTERVAL_MS=5000;
function setTheme(mode){
  const choice=mode==='dark'?'dark':'light';
  document.documentElement.dataset.theme=choice;
  const button=el('themeToggle');
  if(button){button.textContent=choice==='dark'?'☀ Light mode':'☾ Dark mode';button.setAttribute('aria-pressed',String(choice==='dark'));}
  try{localStorage.setItem('acc-theme',choice);}catch(_){}
}
function initTheme(){
  let saved='light';
  try{saved=localStorage.getItem('acc-theme')||'light';}catch(_){}
  setTheme(saved);
}
function activityTime(value){
  if(!value)return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
function renderActivity(){
  const container=el('activityFeed');
  if(!container||!current)return;
  const entries=[];
  for(const a of (current.assignments||[])){
    const completed=a.status==='completed';
    entries.push({date:a.created_at,label:a.agent,kind:'Queued',detail:'Assignment created',tone:'queued'});
    if(a.dispatch){
      const d=a.dispatch;
      entries.push({date:d.updated_at||a.created_at,label:a.agent,kind:'Webhook '+(d.state||'sent'),detail:d.http_status?`HTTP ${d.http_status} · Acceptance is not completion`:'Dispatch recorded; awaiting result',tone:d.state==='rejected'?'error':'dispatched'});
    }
    if(completed){entries.push({date:a.completed_at||a.created_at,label:a.agent,kind:'Completed',detail:'Response saved to transcript',tone:'complete'});}
  }
  if(!current.workflow&&current.collaborative_run?.phase==='ready_for_overseer'){
    entries.push({date:current.collaborative_run.updated_at||new Date().toISOString(),label:'Roundtable',kind:'Ready for overseer',detail:'Both agent replies received; synthesis not automatic yet',tone:'complete'});
  }
  entries.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  container.replaceChildren();
  if(!entries.length){container.append(node('p','activity-empty','No agent activity yet. Start a Collaborative roundtable to see assignments and replies here.'));return;}
  for(const item of entries){
    const row=node('div','activity-entry '+item.tone);
    row.append(node('span','activity-dot','●'));
    const body=node('div','activity-entry-main');
    body.append(node('strong','',item.label+' · '+item.kind),node('small','',item.detail));
    row.append(body,node('time','activity-time',activityTime(item.date)));
    container.append(row);
  }
}
async function pollCurrent(){
  if(pollInFlight||!selected||document.visibilityState!=='visible')return;
  if(document.querySelector('.modal-backdrop:not([hidden])'))return;
  pollInFlight=true;
  const conversationId=selected;
  try{
    const updated=await api('/api/conversations/'+conversationId);
    if(selected!==conversationId)return;
    const signature=JSON.stringify({m:updated.messages?.map(x=>x.id),a:updated.assignments?.map(x=>[x.id,x.status,x.completed_at,x.dispatch?.state,x.dispatch?.updated_at]),phase:updated.collaborative_run?.phase,w:updated.workflow?{...updated.workflow,waiting_seconds:undefined}:null});
    el('activityConnection').textContent='● Watching · 5s';
    if(signature!==lastThreadSnapshot){
      const previous=current;
      current=updated;
      const newlyCompleted=(updated.assignments||[]).filter(a=>a.status==='completed'&&(previous?.assignments||[]).some(old=>old.id===a.id&&old.status!=='completed'));
      if(updated.workflow?.phase==='complete'&&previous?.workflow?.phase!=='complete')notify('Final recommendation is ready.');
      else if(newlyCompleted.length)notify(newlyCompleted.map(a=>a.agent).join(' and ')+' replied — response saved.');
      const oldFeed=el('messageFeed');
      const previousScrollTop=oldFeed.scrollTop;
      const previousScrollHeight=oldFeed.scrollHeight;
      const wasNearTop=previousScrollTop<100;
      renderThread();
      oldFeed.scrollTop=wasNearTop?0:previousScrollTop+Math.max(0,oldFeed.scrollHeight-previousScrollHeight);
      lastThreadSnapshot=signature;
    }
  }catch(_){if(el('activityConnection'))el('activityConnection').textContent='○ Connection interrupted';}
  finally{pollInFlight=false;}
}


const rosterEntries = [
  {name:'Grok Bot',kind:'Your existing bot',glyph:'✳',mode:'manual'},
  {name:'Muse',kind:'Your existing agent',glyph:'✦',mode:'manual'},
  {name:'Gemini',kind:'Optional Google API',glyph:'✧',mode:'gemini'},
  {name:'Claude',kind:'Independent critique',glyph:'⌁',mode:'claude'},
  {name:'OpenAI Overseer',kind:'Optional API or ChatGPT',glyph:'◇',mode:'openai'}
];

function notify(msg,error=false){
  if(loginRedirecting)return;
  const box=el('toast'); box.textContent=msg; box.className=error?'visible error':'visible';
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>box.className='',4700);
}
function discussionFromLocation(){
  try{
    const id=new URLSearchParams(location.search).get('discussion');
    return id&&/^[a-f0-9]{32}$/.test(id)?id:null;
  }catch(_){return null;}
}
function rememberDiscussion(id){
  const next=id?'/?discussion='+id:'/';
  if(location.pathname+location.search!==next)history.replaceState(null,'',next);
}
function redirectToLogin(){
  if(loginRedirecting)return;
  loginRedirecting=true;
  const id=selected&&/^[a-f0-9]{32}$/.test(selected)?selected:discussionFromLocation();
  if(id)rememberDiscussion(id);
  try{if(id)sessionStorage.setItem('acc-resume-discussion',id);}catch(_){}
  const next=location.pathname+location.search||'/';
  window.location.replace('/login?next='+encodeURIComponent(next));
}
async function api(path, options={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  if(response.status===401){
    redirectToLogin();
    throw new Error('Session expired. Redirecting to sign in…');
  }
  const data=await response.json();
  if (!response.ok) throw new Error(data.error||`Request failed (${response.status})`);
  return data;
}
function node(tag, cls, text){
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;return e;
}
async function refresh(){
  try{
    [settings,conversations,work]=await Promise.all([api('/api/status'),api('/api/conversations'),api('/api/work')]);
    if(!selected){
      const fromUrl=discussionFromLocation();
      let resume=null;
      try{resume=sessionStorage.getItem('acc-resume-discussion');sessionStorage.removeItem('acc-resume-discussion');}catch(_){}
      const candidate=fromUrl||(resume&&/^[a-f0-9]{32}$/.test(resume)?resume:null);
      if(candidate&&conversations.some(c=>c.id===candidate))selected=candidate;
    }
    if(selected)rememberDiscussion(selected);
    renderSidebar();renderStatus();
    if(selected){
      const c=await api('/api/conversations/'+selected);current=c;renderThread();
    }else{renderHome();}
  }catch(e){notify(e.message,true)}
}
function renderStatus(){
  el('local-mode').textContent='v'+settings.version;
  el('openGrokSettings').textContent=settings.grok_webhook_configured?'⚙ Grok settings · ready':'⚙ Connect Grok';
  const budget=settings.spending;
  const u=budget?.enabled?budget.api_used_or_reserved_usd:settings.usage.openai.estimated_usd;
  const limit=budget?.enabled?budget.api_limit_usd:settings.limits.openai_usd;
  el('spendLabel').textContent=budget?.enabled?'Total API usage + reservations':"This month's OpenAI estimate";
  el('grokBudgetInfo').textContent=budget?.enabled?`Grok ${budget.grok_used}/${budget.grok_limit}`:'Grok task approval';
  el('monthlySpend').textContent='$'+u.toFixed(4);
  el('budgetFill').style.width=Math.min(100,100*u/Math.max(.01,limit))+'%';
  el('budgetInfo').textContent=budget?.halted?'Spending paused: review required':`$${limit.toFixed(2)} ${budget?.enabled?'total API':'local estimate'} guard`;
  const root=el('roster');root.replaceChildren();
  rosterEntries.forEach(r=>{
    const row=node('div','agent-row');
    const avatar=node('div','agent-avatar '+r.mode,r.glyph);
    const info=node('div','agent-info'),name=node('strong','',r.name),sub=node('span','',r.kind);
    const connected=r.mode!=='manual'&&settings.providers[r.mode];
    const museGateway=r.name==='Muse' && settings.muse_gateway;
    const grokGateway=r.name==='Grok Bot' && settings.grok_gateway;
    const grokWebhook=r.name==='Grok Bot' && settings.grok_webhook_configured;
    const claudeMissing=r.mode==='claude'&&!settings.providers.claude;
    const state=node('span','roster-status'+(connected||museGateway||grokGateway?' connected':''),grokWebhook?'Webhook ready':(museGateway||grokGateway)?'Gateway ready':connected?'API ready':claudeMissing?'Unavailable':'Manual');
    info.append(name,sub);row.append(avatar,info,state);root.append(row);
  });
  el('geminiDraft').disabled=!settings.providers.gemini;
  el('geminiChallenge').disabled=!settings.providers.gemini;
  el('openaiReview').disabled=!settings.providers.openai;
  el('geminiDraft').title=settings.providers.gemini?'Explicit Gemini API call':'Add GEMINI_API_KEY in .env to enable';
  el('geminiChallenge').title=el('geminiDraft').title;
  el('openaiReview').title=settings.providers.openai?'Explicit paid API call':'Add OPENAI_API_KEY in .env to enable';
}
function renderSidebar(){
  const list=el('discussionList'); list.replaceChildren();
  el('discussionCount').textContent=conversations.length;
  for(const c of conversations){
    const b=node('button','convo'+(c.id===selected?' active':''));
    const icon=node('span','convo-icon','◇');
    const body=node('span','convo-body');
    body.append(node('strong','',c.title),node('small','',`${c.message_count} messages · ${new Date(c.created_at).toLocaleDateString()}`));
    b.append(icon,body);b.addEventListener('click',()=>select(c.id));list.append(b);
  }
}
function renderHome(){
  el('homeView').hidden=false;el('threadView').hidden=true;el('crumbTitle').textContent='Overview';
  renderWork();
}
function chatDisplayText(message){
  if(message.agent==='You')return message.body;
  try{
    let raw=message.body.trim();
    if(raw.startsWith('```'))raw=raw.replace(/^```(?:json)?\s*|\s*```$/g,'');
    const parsed=JSON.parse(raw);
    if(parsed&&typeof parsed.handoff==='string'){
      const issues=Array.isArray(parsed.open_issues)?parsed.open_issues.filter(x=>typeof x==='string'):[];
      return parsed.handoff+(issues.length?'\n\n### Unresolved issues\n'+issues.map(x=>'- '+x).join('\n'):'');
    }
  }catch(_){}
  return message.body;
}
function chatInline(parent,text){
  const pattern=/(\*\*[^*]+\*\*|`[^`]+`)/g;
  let start=0;
  for(const match of text.matchAll(pattern)){
    if(match.index>start)parent.append(document.createTextNode(text.slice(start,match.index)));
    const strong=match[0].startsWith('**');
    parent.append(node(strong?'strong':'code','',match[0].slice(strong?2:1,strong?-2:-1)));
    start=match.index+match[0].length;
  }
  if(start<text.length)parent.append(document.createTextNode(text.slice(start)));
}
function renderChatText(parent,text){
  const lines=String(text).split('\n');let paragraph=[],list=null,code=null;
  const flush=()=>{if(paragraph.length){const p=node('p');chatInline(p,paragraph.join('\n'));parent.append(p);paragraph=[];}};
  for(const line of lines){
    if(line.trim().startsWith('```')){flush();list=null;if(code){parent.append(node('pre','chat-code',code.join('\n')));code=null;}else code=[];continue;}
    if(code){code.push(line);continue;}
    if(!line.trim()){flush();list=null;continue;}
    const heading=line.match(/^#{1,6}\s+(.+)$/),bullet=line.match(/^\s*[-*]\s+(.+)$/),ordered=line.match(/^\s*\d+[.)]\s+(.+)$/);
    if(heading){flush();list=null;const h=node('h4');chatInline(h,heading[1]);parent.append(h);}
    else if(bullet||ordered){flush();const tag=ordered?'ol':'ul';if(!list||list.tagName.toLowerCase()!==tag){list=node(tag);parent.append(list);}const item=node('li');chatInline(item,(bullet||ordered)[1]);list.append(item);}
    else{list=null;paragraph.push(line);}
  }
  flush();if(code)parent.append(node('pre','chat-code',code.join('\n')));
}
function renderChatMessage(message,links={}){
  const names={'Grok Bot':'Grok','OpenAI Overseer':'Overseer'};
  const glyphs={'You':'●','Grok Bot':'✳','Muse':'✦','Claude':'⌁','Gemini':'✧','OpenAI Overseer':'◇'};
  const tones={'Muse':'muse','Grok Bot':'grok','OpenAI Overseer':'overseer','Gemini':'gemini','Claude':'claude','You':'you'};
  const card=node('article','message chat-bubble chat-bubble--'+(tones[message.agent]||'other')+(message.agent==='You'?' you':''));
  card.id='chat-message-'+message.id;
  const head=node('div','message-head chat-head');
  head.append(node('span','message-avatar',glyphs[message.agent]||'◈'),node('strong','message-agent',names[message.agent]||message.agent));
  const context=links[message.id];
  if(context)head.append(node('span','chat-role',context.label));
  head.append(node('time','message-time',new Date(message.created_at).toLocaleString()));
  const body=node('div','message-body chat-prose');renderChatText(body,chatDisplayText(message));
  card.append(head,body);
  if(message.agent==='Gemini'||message.agent==='Claude'){
    try{
      const grounding=JSON.parse(message.body).grounding;
      if(grounding?.sources?.length){
        const sources=node('div','chat-grounding');sources.append(node('strong','',message.agent==='Gemini'?'Google Search sources':'Cited sources'));
        for(const [i,source] of grounding.sources.entries()){
          let url;try{url=new URL(source.uri);}catch(_){continue;}
          if(url.protocol!=='https:'||url.username||url.password)continue;
          const a=node('a','chat-source-link','['+((source.chunk_index??i)+1)+'] '+source.title);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);
        }
        sources.append(node('small','','Search grounding is evidence to evaluate, not proof that every claim is correct.'));
        if(message.agent==='Gemini'&&typeof grounding.search_entry_point==='string'&&grounding.search_entry_point){
          const frame=node('iframe','gemini-search-attribution');frame.setAttribute('sandbox','allow-popups');frame.title='Google Search suggestions';frame.referrerPolicy='no-referrer';frame.srcdoc=grounding.search_entry_point;sources.append(frame);
        }
        card.append(sources);
      }
    }catch(_){}
  }
  if(context?.reply_to?.length){
    const connections=node('div','chat-connections');
    connections.append(node('span','', '↳ Built on '));
    context.reply_to.forEach((target,index)=>{
      if(index)connections.append(document.createTextNode(' + '));
      const button=node('button','chat-reply-link',(target.agent==='Grok Bot'?'Grok':target.agent)+(target.round?' · turn '+target.round:''));
      button.type='button';button.onclick=()=>el('chat-message-'+target.id)?.scrollIntoView({behavior:'smooth',block:'center'});
      connections.append(button);
    });card.append(connections);
  }
  const details=node('details','chat-original');details.append(node('summary','', 'Original response & source'));
  details.append(node('small','message-source',message.source),node('pre','chat-raw',message.body));card.append(details);
  return card;
}

function renderThread(){
  if(!current)return renderHome();
  el('homeView').hidden=true;el('threadView').hidden=false;
  el('crumbTitle').textContent=current.title;el('threadTitle').textContent=current.title;
  el('threadGoal').textContent=current.goal;
  const modeNames={'lean':'Lean','collaborative':'Collaborative','full-panel':'Full panel'};
  el('roundtableModeChip').textContent=`${modeNames[current.roundtable_mode]||'Collaborative'} mode`;
  el('messageCount').textContent=`${current.messages.length} message${current.messages.length===1?'':'s'}`;
  const feed=el('messageFeed');feed.replaceChildren();
  for(const m of [...current.messages].reverse())feed.append(renderChatMessage(m,current.chat_links||{}));
  renderActivity();
  renderWorkflow();
  const assignments=el('museAssignmentList');assignments.replaceChildren();
  for(const a of (current.assignments||[])){
    const line=node('div','muse-assignment-line');
    line.append(node('strong','',`${a.agent}: ${a.status==='pending'?'⏳ Pending':'✓ Completed'}`),
                node('span','',a.prompt.length>110?a.prompt.slice(0,110)+'…':a.prompt));
    if(a.agent==='Grok Bot' && a.dispatch){
      line.append(node('small','',`Webhook: ${a.dispatch.state} (${a.dispatch.http_status||'no HTTP status'})`));
    }
    if(a.agent==='Grok Bot' && a.status==='pending' && !a.dispatch){
      const trigger=node('button','outline small','Send webhook once');
      trigger.disabled=!(settings && settings.grok_webhook_configured);
      trigger.title=trigger.disabled?'Use Connect Grok to configure this agent':'One Grok routine consumes subscription usage';
      trigger.onclick=()=>dispatchGrok(a.id,trigger);
      line.append(trigger);
    }
    assignments.append(line);
  }
  const run=current.collaborative_run;
  el('collaborativeStatus').textContent=run
    ? (run.phase==='ready_for_overseer'
       ? 'Muse and Grok complete. Ready for a privacy-reviewed Overseer assessment.'
       : `Started · Muse: ${run.agents.muse} · Grok: ${run.agents.grok} · Webhook: ${run.webhook_state}`)
    : (settings?.grok_webhook_configured
       ? (collaborativeSeed(current).reuseMuse
          ? 'Muse already completed this discussion. Reuse that response and request only Grok.'
          : 'Ready for one approved Muse + Grok workflow.')
       : 'Grok setup needed. Choose “Connect Grok” above.');
  el('startCollaborative').disabled=!!current.workflow;
  el('startCollaborative').textContent='Start this discussion';
  el('startCollaborative').title='Start Muse → Grok → Overseer using this brief and bounded task handoffs';
  el('queueGrok').disabled=!(settings&&settings.grok_gateway);
  el('queueGrok').title=settings&&settings.grok_gateway?'Queue a Grok task (does not contact Grok until approved)':'Configure ACC_GROK_TOKEN to enable';
  el('queueMuse').disabled=!(settings&&settings.muse_gateway);
  el('queueMuse').title=settings&&settings.muse_gateway?'Queue a task for Muse through the agent gateway':'Configure ACC_MUSE_TOKEN to enable this feature';
  renderSidebar();
}
function prettyStatus(s){return s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function renderWork(){
  const r=work.review||{};
  const summary=el('workSummary');summary.replaceChildren();
  for(const [label,value] of [['Open priorities',r.open_count||0],['Blocked',r.blocked_count||0],['Awaiting approval',r.pending_approvals||0],['Logged changes',work.changes?.length||0]]){
    const item=node('div','work-stat');item.append(node('strong','',String(value)),node('span','',label));summary.append(item);
  }
  const list=el('priorityList');list.replaceChildren();
  if(!work.priorities.length)list.append(node('div','work-empty','No priorities recorded yet. Add one to establish your master list.'));
  for(const task of work.priorities){
    const row=node('article','work-item');
    const info=node('div','work-item-info');
    const top=node('div','work-item-top');top.append(node('span','work-rank',task.priority),node('strong','',task.title),node('span','work-status',prettyStatus(task.status)));
    info.append(top,node('small','',`${task.project} · ${prettyStatus(task.task_type)} · ${task.owner}`));
    if(task.next_action)info.append(node('p','',`Next: ${task.next_action}`));
    const actions=node('div','work-actions');
    const edit=node('button','outline small','Update');edit.onclick=()=>openPriority(task);actions.append(edit);
    const request=node('button','outline small','Request approval');request.onclick=()=>openApproval(task.id);actions.append(request);
    row.append(info,actions);list.append(row);
  }
  const approvals=el('approvalList');approvals.replaceChildren();
  if(!work.approvals.length)approvals.append(node('div','work-empty','No change requests. Major changes must be proposed here before execution.'));
  for(const a of work.approvals){
    const row=node('article','work-item');const info=node('div','work-item-info');
    const top=node('div','work-item-top');top.append(node('span','work-status',prettyStatus(a.status)),node('strong','',a.summary));info.append(top);
    info.append(node('small','',`Type: ${prettyStatus(a.change_type||'unspecified')} · Affected: ${a.affected_systems} · Cost: ${a.estimated_cost}`));
    info.append(node('p','',`Why: ${a.reason} | Risk: ${a.risk} | Rollback: ${a.rollback_plan}`));
    if(a.decision_note)info.append(node('small','',`Decision note: ${a.decision_note}`));
    row.append(info);
    if(a.status==='pending'){
      const actions=node('div','work-actions');
      for(const [decision,label] of [['approved','Approve plan'],['deferred','Defer'],['rejected','Reject']]){
        const b=node('button',decision==='approved'?'primary small':'outline small',label);b.onclick=()=>decideApproval(a,decision);actions.append(b);
      }
      row.append(actions);
    }
    approvals.append(row);
  }
  const log=el('changeList');log.replaceChildren();
  if(!work.changes?.length)log.append(node('div','work-empty','No completed changes logged yet. Record even small bug fixes here after they are verified.'));
  for(const c of (work.changes||[])){
    const row=node('article','work-item');const info=node('div','work-item-info');
    const top=node('div','work-item-top');
    top.append(node('span','work-status',prettyStatus(c.change_type)),node('strong','',c.summary));
    info.append(top,node('small','',`${c.project} · ${c.implemented_by} · ${new Date(c.created_at).toLocaleString()} · ${prettyStatus(c.impact)} impact`));
    info.append(node('p','',c.details),node('small','',`Checked: ${c.verification}`));
    if(c.version_ref)info.append(node('small','',`Version / reference: ${c.version_ref}`));
    if(c.approval_id)info.append(node('small','',`Approved request: ${c.approval_id.slice(0,8)}…`));
    row.append(info);log.append(row);
  }
}
function openPriority(task=null){
  editingPriorityId=task?.id||null;
  el('priorityForm').reset();
  el('priorityModalTitle').textContent=task?'Update priority':'Add priority';
  el('taskProject').value=task?.project||'Command Center';
  el('taskTitle').value=task?.title||'';
  el('taskType').value=task?.task_type||'roundtable';
  el('taskPriority').value=task?.priority||'P2';
  el('taskStatus').value=task?.status||'proposed';
  el('taskOwner').value=task?.owner||'Unassigned';
  el('taskNext').value=task?.next_action||'';
  el('taskDescription').value=task?.description||'';
  el('priorityModal').hidden=false;
  el('taskTitle').focus();
}
function closePriority(){el('priorityModal').hidden=true;editingPriorityId=null;}
async function savePriority(e){
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const payload={title:el('taskTitle').value,project:el('taskProject').value,
    task_type:el('taskType').value,priority:el('taskPriority').value,status:el('taskStatus').value,
    owner:el('taskOwner').value,next_action:el('taskNext').value,description:el('taskDescription').value};
  try{await api(editingPriorityId?`/api/priorities/${editingPriorityId}`:'/api/priorities',
        {method:'POST',body:JSON.stringify(payload)});
    closePriority();await refresh();notify('Priority saved locally; no external action taken');}
  catch(err){notify(err.message,true)}finally{b.disabled=false}
}
function openApproval(taskId=''){
  el('approvalForm').reset();
  const dropdown=el('approvalPriority');dropdown.replaceChildren();
  const noTask=node('option','','None / general');noTask.value='';dropdown.append(noTask);
  for(const t of work.priorities){const o=node('option','',`${t.priority} · ${t.title}`);o.value=t.id;dropdown.append(o)}
  dropdown.value=taskId;
  el('approvalModal').hidden=false;el('approvalSummary').focus();
}
function closeApproval(){el('approvalModal').hidden=true;}
async function saveApproval(e){
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const payload={priority_id:el('approvalPriority').value||null,summary:el('approvalSummary').value,
    change_type:el('approvalType').value,reason:el('approvalReason').value,affected_systems:el('approvalAffected').value,
    risk:el('approvalRisk').value,estimated_cost:el('approvalCost').value,rollback_plan:el('approvalRollback').value};
  try{await api('/api/approvals',{method:'POST',body:JSON.stringify(payload)});
    closeApproval();await refresh();notify('Change request added; no action taken');}
  catch(err){notify(err.message,true)}finally{b.disabled=false}
}
async function decideApproval(a,decision){
  const note=window.prompt(`Decision: ${prettyStatus(decision)}\n\n${a.summary}\nAffected: ${a.affected_systems}\nRisk: ${a.risk}\nEstimated cost: ${a.estimated_cost}\nRollback: ${a.rollback_plan}\n\nAdd a decision note (required for defer/reject):`,'');
  if(note===null)return;
  if(decision!=='approved'&&!note.trim()){notify('Decision note required for defer/reject',true);return}
  if(!window.confirm(`${prettyStatus(decision)} this exact proposal?\n\nThis records only your decision. It does not execute the change.`))return;
  try{await api(`/api/approvals/${a.id}/decision`,{method:'POST',body:JSON.stringify({decision,note})});
      await refresh();notify(`${prettyStatus(decision)} recorded. Nothing was executed.`)}
  catch(err){notify(err.message,true)}
}

const approvalRequiredTypes=new Set(['major_style','major_feature','security_privacy','data_permissions','deployment','spending']);
function updateChangePolicy(){
  const type=el('changeType').value, impact=el('changeImpact').value;
  const requires=approvalRequiredTypes.has(type)||impact==='significant';
  el('changeApprovalFields').hidden=!requires;
  el('changeApproval').required=requires;
  const approved=(work.approvals||[]).filter(a=>a.status==='approved'&&a.change_type===type);
  const select=el('changeApproval');const prev=select.value;select.replaceChildren();
  const base=node('option','','Choose an approved request');base.value='';select.append(base);
  for(const a of approved){const opt=node('option','',a.summary);opt.value=a.id;select.append(opt)}
  if(approved.some(a=>a.id===prev))select.value=prev;
  el('changePolicyHint').textContent=requires
    ? 'Approval required before this category/impact can be logged as implemented. Choose an approved, matching-scope request; if none exists, request approval first.'
    : 'Routine, low-risk fixes can proceed without prior approval, but must still be logged and verified. Any sensitive or significant impact must be classified accordingly.';
}
function openChange(){
  el('changeForm').reset();el('changeProject').value='AI Command Center';
  updateChangePolicy();el('changeModal').hidden=false;el('changeSummary').focus();
}
function closeChange(){el('changeModal').hidden=true;}
function selectApprovedScope(){
  const match=(work.approvals||[]).find(a=>a.id===el('changeApproval').value&&a.status==='approved');
  if(match)el('changeSummary').value=match.summary;
}
async function saveChange(e){
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const payload={project:el('changeProject').value, summary:el('changeSummary').value,
    change_type:el('changeType').value,impact:el('changeImpact').value,details:el('changeDetails').value,
    implemented_by:el('changeOwner').value,verification:el('changeVerification').value,
    version_ref:el('changeRef').value,approval_id:el('changeApprovalFields').hidden?null:el('changeApproval').value};
  try{await api('/api/changes',{method:'POST',body:JSON.stringify(payload)});
    closeChange();await refresh();notify('Change logged. This did not execute code or deploy anything.');}
  catch(err){notify(err.message,true)}finally{b.disabled=false}
}
async function select(cid){selected=cid;await refresh();}
function openModal(prefill=false){
  newSubmissionId=crypto.randomUUID().replaceAll('-','');
  el('modal').hidden=false;
  el('newRoundtableMode').value='collaborative';
  if(prefill){el('newTitle').value='Public holiday trip comparison';el('newGoal').value='Compare three coastal destinations for a short holiday trip. Assess walkability, public holiday events, weather risks, and approximate costs. Use independent proposals, targeted verification and one final recommendation. Do not include personal details or make purchases or reservations.';}
  el('newGoal').focus();
}
function closeModal(){el('modal').hidden=true;el('createForm').reset();}
async function createDiscussion(e){
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
    const geminiOn=el('newGeminiPublicSafe')?.checked===true;
    const claudeOn=el('newClaudePublicSafe')?.checked===true;
    const c=await api('/api/discussions/start',{method:'POST',body:JSON.stringify({request_id:newSubmissionId,owner_approved:true,share_task_replies:true,workflow_version:claudeOn?4:geminiOn?3:2,gemini_public_safe:geminiOn,claude_public_safe:claudeOn,title:el('newTitle').value,goal:el('newGoal').value,roundtable_mode:el('newRoundtableMode').value})});
    selected=c.id;closeModal();await refresh();notify('Task submitted. Follow progress and any connection blockers above.');
  }catch(err){notify(err.message,true)}finally{b.disabled=false}
}
function handoffText(target){
  const intro=target==='OpenAI Overseer'
    ? 'You are an independent overseer. Review the goal and any explicitly shared evidence, control unnecessary cost and disclosures, separate verified facts from assertions, and recommend one next action. Do not claim you verified facts you have not checked.'
    : `You are ${target}. Independently analyze only the provided task and approved context. Do not infer that omitted personal data was shared; identify assumptions and avoid external actions.`;
  // Default to the goal rather than exporting every past message automatically.
  return [intro,`TASK (please minimize or generalize personal details):\n${current.goal}`].join('\n\n');
}
function apiPrompt(provider,mode,goal=current.goal){
  const roles={draft:'Provide an independent, concise assessment. Label assumptions and risks; do not take external actions.',challenge:'Challenge the strongest assumptions, evidence gaps, and risks. Propose one targeted verification step; no external actions.',oversee:'You are the overseer. Minimize cost and external data disclosure, compare the supplied evidence and return a concise recommendation, strongest objection, remaining uncertainty and next action. No external actions.'};
  // Review starts with only the goal. Users may deliberately paste in selected snippets.
  return `${roles[mode]}\n\nTASK: ${goal}\n\nOnly consider what is included in this reviewed payload. Do not assume you saw the whole transcript.`;
}
function reviewOutbound({title,destination,prompt,buttonLabel,perform,taskPlan=false}){
  if(!current)return;
  pendingOutbound={perform,taskPlan};
  el('outboundTitle').textContent=title;
  el('outboundDestination').textContent=`Destination: ${destination}. This is an exact, editable preview; no transmission occurs until you approve.`;
  el('outboundPrompt').value=prompt.slice(0,12000);
  el('outboundApprove').checked=false;
  el('confirmOutbound').textContent=buttonLabel;
  el('outboundModal').hidden=false;
  el('taskApiPlan').hidden=!taskPlan;
  if(taskPlan)el('taskBudgetSummary').textContent=`$${settings.spending.api_limit_usd.toFixed(2)} combined API guard and ${settings.spending.grok_limit} Grok dispatches/month. Failed/uncertain calls retain their reservations. These are local guards, not provider billing limits.`;
  for(const [id,provider] of [['planOpenai','openai'],['planGeminiDraft','gemini'],['planGeminiChallenge','gemini']]){el(id).checked=false;el(id).disabled=!settings?.providers[provider]||!settings?.cost_rates?.[provider]?.known;}
  updateTaskApiPreview();
  el('outboundPrompt').focus();
}
function closeOutbound(){el('outboundModal').hidden=true;pendingOutbound=null;el('outboundApprove').checked=false;}
async function submitOutbound(e){
  e.preventDefault();
  if(!pendingOutbound||!el('outboundApprove').checked)return;
  const prompt=el('outboundPrompt').value.trim();
  if(!prompt){notify('Review prompt cannot be empty',true);return;}
  const action=pendingOutbound.perform;
  const api_payloads=pendingOutbound.taskPlan?taskApiPayloads(prompt):{};
  closeOutbound();
  try{await action(prompt,api_payloads);}catch(e){notify(e.message,true);}
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);notify('Copied to clipboard');}
  catch{notify('Clipboard unavailable — open the page on localhost',true)}
}
async function addReply(e){
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
    await api(`/api/conversations/${selected}/messages`,{method:'POST',body:JSON.stringify({agent:el('replyAgent').value,body:el('replyBody').value})});
    el('replyBody').value='';await refresh();notify('Reply recorded as manual paste');
  }catch(err){notify(err.message,true)}finally{b.disabled=false}
}
async function queueMuse(){
  if(!selected)return;
  let prompt=el('museAssignmentPrompt').value.trim();
  if(!prompt)prompt=`Independently analyze this task: ${current.goal}\n\nGive one recommendation, assumptions, and risks. Do not execute actions. Reply once.`;
  reviewOutbound({title:'Review Muse assignment', destination:'your existing Muse agent', prompt, buttonLabel:'Approve & queue Muse task',perform:async reviewed=>{
    const button=el('queueMuse');button.disabled=true;
    try{
      await api(`/api/conversations/${selected}/assignments`,{method:'POST',body:JSON.stringify({agent:'Muse',prompt:reviewed})});
      el('museAssignmentPrompt').value='';await refresh();notify('Muse assignment queued. Only the approved prompt and title will be shared.');
    }finally{button.disabled=false}
  }});
}
async function queueGrok(){
  if(!selected)return;
  let prompt=el('grokAssignmentPrompt').value.trim();
  if(!prompt)prompt=`Independently analyze this task: ${current.goal}\n\nGive your recommendation, strongest objection and next step. Do not execute actions. Reply once.`;
  reviewOutbound({title:'Review Grok assignment',destination:'your existing Grok Bot',prompt,buttonLabel:'Approve & queue Grok task',perform:async reviewed=>{
    const button=el('queueGrok');button.disabled=true;
    try{
      await api(`/api/conversations/${selected}/assignments`,{method:'POST',body:JSON.stringify({agent:'Grok Bot',prompt:reviewed})});
      el('grokAssignmentPrompt').value='';await refresh();notify('Grok task queued (no webhook sent). Only the approved prompt and title will be shared.');
    }finally{button.disabled=false}
  }});
}
async function dispatchGrok(assignmentId,button){
  const covered=current?.task_approval?.assignment_ids?.includes(assignmentId) && current.task_approval.grok_dispatches_remaining>0;
  if(!covered && !window.confirm('Send this assignment to your EXISTING Grok Bot now?\n\nA Grok routine will run and consume some of your shared or legacy subscription allowance. This will send an assignment ID, not your full transcript. No automatic retries.'))return;
  button.disabled=true;
  try{
    const res=await api(`/api/assignments/${assignmentId}/dispatch-grok`,{method:'POST',body:'{}'});
    await refresh();notify(res.state==='accepted'?'Webhook accepted — awaiting Grok callback':`Webhook ${res.state}; check Grok and the logs before any retry`,res.state!=='accepted');
  }catch(err){notify(err.message,true)}finally{button.disabled=false}
}
function collaborativeSeed(thread){
  // The short discussion goal is a title/summary, not the full task. Reuse the
  // last completed Muse assignment (which the owner already reviewed) first.
  const assignments=thread?.assignments||[];
  const completedMuse=[...assignments].reverse().find(a=>
    a.agent==='Muse' && a.status==='completed' && typeof a.prompt==='string' && a.prompt.trim());
  if(completedMuse){
    return {prompt:completedMuse.prompt.trim(),reuseMuse:true,source:'completed Muse assignment'};
  }
  const latestAssignment=[...assignments].reverse().find(a=>
    typeof a.prompt==='string' && a.prompt.trim());
  if(latestAssignment){
    return {prompt:latestAssignment.prompt.trim(),reuseMuse:false,source:'latest saved assignment'};
  }
  return {
    prompt:`Independently plan this approved trip or project. Explain tradeoffs, label uncertainty, and avoid bookings, spending or making changes.\n\nTASK:\n${thread?.goal||''}`,
    reuseMuse:false,
    source:'discussion summary (no detailed assignment saved)'
  };
}
async function startCollaborative(){
  if(!current)return;
  try{
    await api('/api/discussions/start',{method:'POST',body:JSON.stringify({request_id:current.id,owner_approved:true,share_task_replies:true,workflow_version:2,title:current.title,goal:current.goal,roundtable_mode:current.roundtable_mode})});
    await refresh();notify('Task started. Follow its progress above.');
  }catch(e){notify(e.message,true);}
}
function renderWorkflow(){
  const flow=current?.workflow;
  el('workflowPanel').hidden=!flow;
  el('startCollaborative').closest('.collaborator').hidden=!!flow;
  document.querySelector('.action-area').hidden=!!flow;
  if(!flow)return;
  const labels={gemini_prepared:'Preparing Gemini grounded check',running_gemini:'Gemini is researching with Google Search',awaiting_gemini:'Grounded Gemini reply saved',blocked_gemini_key:'Gemini API key needed',blocked_gemini:'Gemini check needs attention',claude_prepared:'Preparing Claude critique',running_claude:'Claude is reviewing with sources',awaiting_claude:'Claude critique saved',claude_unavailable:'Claude unavailable',blocked_claude:'Claude critique needs attention',muse_prepared:'Preparing a response to Grok',awaiting_muse:'Waiting for Muse',grok_prepared:'Preparing Muse → Grok',dispatching_grok:'Sending Muse handoff to Grok',awaiting_grok:'Grok is reviewing Muse’s proposal',overseer_prepared:'Preparing final assessment',blocked_overseer:'Overseer connection needed',synthesizing:'Overseer is preparing your recommendation',complete:'Final recommendation ready',awaiting_review:'Handoff needs your review',blocked_privacy:'Task held for privacy review',blocked_dispatch:'Grok dispatch needs attention',blocked_synthesis:'Synthesis needs attention',blocked_internal:'Workflow needs attention'};
  el('workflowStatus').textContent=([2,3,4].includes(flow.version)&&flow.active_round?'Turn '+flow.active_round+'/3 · ':'')+(labels[flow.phase]||flow.phase);
  const claudeState=flow.claude_status==='unavailable'?' Claude is unavailable (ANTHROPIC_API_KEY is not set); skipped critiques stay skipped.':'';
  el('workflowNote').textContent=(flow.note||'')+claudeState+([3,4].includes(flow.version)?' · Discussion API usage + reservations: $'+Number(flow.api_used_or_reserved_usd||0).toFixed(4)+' / $'+Number(flow.api_budget_usd).toFixed(2):'');
  el('workflowResume').hidden=!['blocked_overseer','grok_prepared','muse_prepared','blocked_gemini_key'].includes(flow.phase);
  el('workflowReview').hidden=flow.phase!=='awaiting_review';
  const events=el('workflowEvents');events.replaceChildren();
  for(const event of flow.events||[])events.append(node('div','activity-empty',activityTime(event.at)+' · '+(event.round?'Turn '+event.round+'/3 · ':'')+(labels[event.phase]||event.phase)));
}
async function resumeWorkflow(){
  try{await api(`/api/conversations/${selected}/workflow/resume`,{method:'POST',body:JSON.stringify({owner_approved:true})});await refresh();}
  catch(e){notify(e.message,true);}
}
function reviewWorkflow(){
  const flow=current?.workflow;if(!flow||flow.phase!=='awaiting_review')return;
  reviewOutbound({title:'Review task handoff',destination:flow.pending_step.startsWith('muse_')?'Muse':flow.pending_step.startsWith('grok')?'Grok Bot':flow.pending_step.startsWith('gemini')?'Gemini + Google Search':flow.pending_step.startsWith('claude')?'Claude':'OpenAI Overseer',prompt:flow.pending_prompt,buttonLabel:'Approve handoff & continue',perform:async approved_prompt=>{
    await api(`/api/conversations/${selected}/workflow/approve`,{method:'POST',body:JSON.stringify({owner_approved:true,step:flow.pending_step,approved_prompt})});await refresh();
  }});
}
function openGrokSettings(){
  el('grokSettingsModal').hidden=false;
  el('grokWebhookUrl').value=''; // never echo an existing secret URL
  el('grokSenderKey').value='';
  el('grokGatewayUrl').value=settings?.grok_settings?.gateway_url||'';
  el('grokCallbackToken').value='';
  el('grokCallbackBox').hidden=true;
  el('rotateGrokToken').checked=false;
  el('grokSetupNote').textContent=settings?.grok_webhook_configured
    ? 'Already configured. Enter only what you want to change; blank secret fields retain saved values.'
    : 'Enter the webhook URL and sender key; a separate callback token will be created automatically.';
}
function closeGrokSettings(){el('grokSettingsModal').hidden=true;el('grokCallbackToken').value='';el('grokCallbackBox').hidden=true;}
async function saveGrokSettings(e){
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  const rotate=el('rotateGrokToken').checked;
  if(rotate&&!window.confirm('Rotate Grok callback token? The previous token will stop working.')){btn.disabled=false;return;}
  try{
    const result=await api('/api/setup/grok',{method:'POST',body:JSON.stringify({
      webhook_url:el('grokWebhookUrl').value.trim(),sender_key:el('grokSenderKey').value.trim(),
      gateway_url:el('grokGatewayUrl').value.trim(),rotate_callback_token:rotate})});
    await refresh();
    el('grokSenderKey').value='';el('grokWebhookUrl').value='';
    if(result.callback_token_once){
      el('grokCallbackToken').value=result.callback_token_once;
      el('grokCallbackBox').hidden=false;
      el('grokSetupNote').textContent='Saved. Copy this new callback token now; it will not be shown again.';
    }else{
      el('grokSetupNote').textContent='Saved. Existing callback token was retained; nothing new to share.';
    }
    notify('Grok connection settings saved on this Mac. No webhook sent.');
  }catch(err){notify(err.message,true)}finally{btn.disabled=false}
}
function taskApiPayloads(brief){
  const payloads={};
  for(const [id,key,p,m] of [['planOpenai','openai/oversee','openai','oversee'],['planGeminiDraft','gemini/draft','gemini','draft'],['planGeminiChallenge','gemini/challenge','gemini','challenge']]){
    if(el(id).checked&&!el(id).disabled)payloads[key]=apiPrompt(p,m,brief);
  }
  return payloads;
}
function updateTaskApiPreview(){
  if(!el('taskApiPreview'))return;
  el('taskApiPreview').textContent=Object.entries(taskApiPayloads(el('outboundPrompt').value)).map(([key,text])=>{const rate=settings?.cost_rates?.[key.split('/')[0]];const estimate=rate?.known?((new TextEncoder().encode(text).length+512)*rate.input+settings.cost_rates.max_output_tokens*rate.output)/1000000:null;return `${key} · ${estimate===null?'unknown price: blocked':`estimated reservation $${estimate.toFixed(5)}`}\n${text}`;}).join('\n\n')||'No optional API calls included.';
}
async function generate(provider,mode){
  const scope=current?.task_approval,key=`${provider}/${mode}`;
  if(scope?.api_payload_hashes?.[key]){
    if(scope.api_steps_used?.includes(key)){notify('This approved step was already attempted. No automatic repeat.',true);return;}
    const brief=current.assignments?.find(a=>a.agent==='Grok Bot'&&scope.assignment_ids.includes(a.id))?.prompt||current.goal;
    const approved_prompt=apiPrompt(provider,mode,brief);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(approved_prompt));
    const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    if(hash===scope.api_payload_hashes[key]){
      const button=el(provider==='openai'?'openaiReview':mode==='draft'?'geminiDraft':'geminiChallenge');button.disabled=true;
      try{await api(`/api/conversations/${selected}/generate`,{method:'POST',body:JSON.stringify({provider,mode,approved_prompt,use_task_approval:true})});await refresh();notify('Approved task step recorded within the monthly guard.');}
      catch(error){notify(error.message,true)}finally{renderStatus()}
      return;
    }
  }

  const label=provider==='gemini'?'Google Gemini API':'OpenAI API';
  const destination=provider==='gemini'?'Google (free-tier data may be used for product improvement)':'OpenAI (API charges separate from ChatGPT Plus)';
  reviewOutbound({title:`Review ${label} prompt`, destination, prompt:apiPrompt(provider,mode),buttonLabel:'Approve & send one request',perform:async approved_prompt=>{
    const btn=el(provider==='openai'?'openaiReview':mode==='draft'?'geminiDraft':'geminiChallenge');
    btn.disabled=true;const previous=btn.textContent;btn.textContent='Working...';
    try{
      const result=await api(`/api/conversations/${selected}/generate`,{method:'POST',body:JSON.stringify({provider,mode,approved_prompt,outbound_approved:true})});
      await refresh();notify(`Saved ${label} response · estimated $${result.estimated_usd.toFixed(5)}`);
    }finally{btn.textContent=previous;renderStatus()}
  }});
}
function exportTranscript(){
  if(!current)return;
  const md=[`# ${current.title}`,`**Goal:** ${current.goal}`,`**Exported:** ${new Date().toISOString()}`];
  for(const m of current.messages)md.push(`\n## ${m.agent} (${m.source})\n_${m.created_at}_\n\n${m.body}`);
  const blob=new Blob([md.join('\n\n')],{type:'text/markdown'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`ai-command-center-${current.id.slice(0,8)}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function setup(){
  el('openOverseerSettings').onclick=()=>{el('overseerApiKey').value='';el('overseerSettingsNote').textContent=settings?.providers?.openai?'A key is already saved. Enter a replacement only if needed.':'No key is configured. Enter it here, never in a discussion or chat.';el('overseerSettingsModal').hidden=false;};
  el('closeOverseerSettings').onclick=()=>{el('overseerSettingsModal').hidden=true;el('overseerApiKey').value='';};
  el('overseerSettingsForm').onsubmit=async event=>{
    event.preventDefault();event.submitter.disabled=true;
    try{await api('/api/setup/overseer',{method:'POST',body:JSON.stringify({api_key:el('overseerApiKey').value})});el('overseerApiKey').value='';el('overseerSettingsModal').hidden=true;await refresh();notify('Overseer key saved locally. Approved waiting tasks can resume.');}
    catch(error){notify(error.message,true);}finally{event.submitter.disabled=false;}
  };
  el('workflowResume').onclick=resumeWorkflow;
  el('workflowReview').onclick=reviewWorkflow;
  initTheme();
  el('themeToggle').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
  setInterval(pollCurrent,POLL_INTERVAL_MS);
  el('goOverview').onclick=()=>{selected=null;current=null;rememberDiscussion(null);refresh()};
  el('addPriority').onclick=()=>openPriority();
  el('addApproval').onclick=()=>openApproval();
  el('addChange').onclick=openChange;
  el('changeType').onchange=updateChangePolicy;el('changeImpact').onchange=updateChangePolicy;
  el('changeApproval').onchange=selectApprovedScope;
  el('changeForm').addEventListener('submit',saveChange);
  el('closeChange').onclick=closeChange;el('cancelChange').onclick=closeChange;
  el('changeModal').addEventListener('click',e=>{if(e.target===el('changeModal'))closeChange()});
  el('priorityForm').addEventListener('submit',savePriority);
  el('approvalForm').addEventListener('submit',saveApproval);
  el('closePriority').onclick=closePriority;el('cancelPriority').onclick=closePriority;
  el('closeApproval').onclick=closeApproval;el('cancelApproval').onclick=closeApproval;
  el('priorityModal').addEventListener('click',e=>{if(e.target===el('priorityModal'))closePriority()});
  el('approvalModal').addEventListener('click',e=>{if(e.target===el('approvalModal'))closeApproval()});
  el('newDiscussion').onclick=()=>openModal();el('startBtn').onclick=()=>openModal();el('sampleBtn').onclick=()=>openModal(true);
  el('closeModal').onclick=closeModal;el('cancelModal').onclick=closeModal;
  el('modal').addEventListener('click',e=>{if(e.target===el('modal'))closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!el('grokSettingsModal').hidden)closeGrokSettings();else if(!el('outboundModal').hidden)closeOutbound();else if(!el('priorityModal').hidden)closePriority();else if(!el('approvalModal').hidden)closeApproval();else if(!el('changeModal').hidden)closeChange();else if(!el('modal').hidden)closeModal()}});
  el('createForm').addEventListener('submit',createDiscussion);
  el('replyForm').addEventListener('submit',addReply);
  el('queueMuse').onclick=queueMuse;
  el('queueGrok').onclick=queueGrok;
  el('startCollaborative').onclick=startCollaborative;
  el('openGrokSettings').onclick=openGrokSettings;
  el('closeGrokSettings').onclick=closeGrokSettings;
  el('cancelGrokSettings').onclick=closeGrokSettings;
  el('grokSettingsForm').addEventListener('submit',saveGrokSettings);
  el('copyGrokToken').onclick=()=>copyText(el('grokCallbackToken').value);
  el('grokSettingsModal').addEventListener('click',e=>{if(e.target===el('grokSettingsModal'))closeGrokSettings()});
  el('reloadBtn').onclick=refresh;el('exportBtn').onclick=exportTranscript;
  for(const [id,agent] of [['copyGrok','Grok Bot'],['copyMuse','Muse'],['copyOverseer','OpenAI Overseer']]){
    el(id).onclick=()=>reviewOutbound({title:`Review ${agent} handoff`,destination:`clipboard for ${agent}`,prompt:handoffText(agent),buttonLabel:'Approve & copy',perform:copyText});
  }
  el('outboundForm').addEventListener('submit',submitOutbound);
  el('outboundPrompt').addEventListener('input',updateTaskApiPreview);
  for(const id of ['planOpenai','planGeminiDraft','planGeminiChallenge'])el(id).addEventListener('change',updateTaskApiPreview);
  el('closeOutbound').onclick=closeOutbound;
  el('cancelOutbound').onclick=closeOutbound;
  el('outboundModal').addEventListener('click',e=>{if(e.target===el('outboundModal'))closeOutbound()});
  el('geminiDraft').onclick=()=>generate('gemini','draft');
  el('geminiChallenge').onclick=()=>generate('gemini','challenge');
  el('openaiReview').onclick=()=>generate('openai','oversee');
  refresh();
}
window.addEventListener('DOMContentLoaded',setup);
