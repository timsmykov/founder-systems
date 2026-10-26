import {GraphCamera, bindGraphCamera} from './graph-camera.mjs';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normal = value => String(value ?? '').toLocaleLowerCase().normalize('NFKC').replace(/ё/g,'е').replace(/\s+/g,' ');
const TYPES = {same_mechanism:'Same mechanism',partial_overlap:'Partial overlap',same_goal_different_methods:'Same goal, different methods',complement:'Complement',insufficient_evidence:'Insufficient evidence',qualified_tension:'Qualified tension'};
const VOICES = {nik:'Nik Storonsky',nik_context_inferred:'Nik Storonsky · caption attribution',institutional_quantumlight:'QuantumLight · institutional',musk_via_book:'Elon Musk · via the book',editor:'Book editor',naval:'Naval Ravikant',naval_foreword:'Naval Ravikant · foreword',interviewer:'Interviewer',unknown:'Uncertain speaker'};
const RU = {'найм':['hiring','recruit','talent'],'наним':['hiring','recruit'],'люд':['people','team','talent'],'команд':['team'],'культур':['culture','values'],'ценност':['values'],'цел':['goals','objectives'],'метрик':['metrics'],'результат':['performance','results'],'мотивац':['incentive','motivation'],'обратн':['feedback'],'продукт':['product'],'рост':['growth','scaling'],'масштаб':['scaling','scale'],'стратег':['strategy'],'деньг':['money','capital'],'капитал':['capital'],'рис':['risk'],'решени':['decision'],'мышлен':['reasoning','thinking'],'обучен':['learning'],'ошиб':['failure','mistake'],'инженер':['engineer'],'скорост':['speed'],'процесс':['process'],'управл':['management','leadership'],'делег':['delegation'],'ответствен':['accountability','ownership']};
const PAGE = 24;
let index, cards, relations, topics, cardById, relationById, topicById, quoteSearchReady = false, legacyIds = [];
const emptyReader = $('reader').innerHTML;
const cache = new Map();
const graphCamera = new GraphCamera();
let graphController = null;
let s = {view:'meanings',topic:'all',author:'all',filter:'all',q:'',selected:null,kind:null,page:0};
let renderToken = 0, searchTimer, focusGraph = false, currentItems = [], lastFocused;
const phoneMedia = matchMedia('(max-width:760px), (max-width:1100px) and (max-height:500px)');
const filterHome = document.createComment('Desktop filter position');
$('filter-row').before(filterHome);
let listScroll = 0, readerOrigin = null, readerOriginRecord = null;
function phone(){return phoneMedia.matches;}
function placeFilters(){
  if(phone())$('mobile-filter-content').append($('filter-row'));
  else {filterHome.after($('filter-row'));$('filters-dialog').close();}
}
placeFilters();phoneMedia.addEventListener('change',()=>{placeFilters();if(index){syncControls();if(s.view==='graph')renderList();}});

async function json(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then(r => {if(!r.ok)throw new Error(`Unable to load ${path} (${r.status})`);return r.json();}).catch(e=>{cache.delete(path);throw e;}));
  return cache.get(path);
}
function label(card) {
  if(card.side==='nik') return card.voices.includes('institutional_quantumlight') ? (card.voices.includes('nik')?'Nik + QuantumLight':'QuantumLight') : 'Nik Storonsky';
  return card.voices.includes('musk_via_book') ? 'Elon · via the book' : 'Book collection · context';
}
function pill(type){return `<span class="comparison-type ${esc(type)}">${esc(TYPES[type]||type)}</span>`;}
function sourceMark(side){return `<span class="source-letter ${side==='elon'?'elon':''}" aria-hidden="true">${side==='elon'?'E':'N'}</span>`;}
function mobile(){return matchMedia('(max-width:1100px)').matches;}
function notify(message){$('load-status').textContent=message;}
function route(push=false){
  const p=new URLSearchParams();if(s.view!=='meanings')p.set('v',s.view);if(s.topic!=='all')p.set('t',s.topic);if(s.author!=='all')p.set('a',s.author);if(s.filter!=='all')p.set('f',s.filter);if(s.q)p.set('q',s.q);if(s.page)p.set('p',String(s.page));if(s.selected)p.set(s.kind==='relation'?'r':'m',s.selected);
  if(s.view==='graph'&&s.selected&&s.reading)p.set('read','1');
  const hash=p.toString()?'#'+p:'';if(location.hash!==hash)history[push?'pushState':'replaceState'](push?{atlasRecord:s.selected}:history.state,'',location.pathname+location.search+hash);
}
function parseRoute(){
  if(/^#M\d{2}$/.test(location.hash)){
    const n=Number(location.hash.slice(2)), rel=relationById.get(legacyIds[n-1]);
    s={...s,view:'comparisons',filter:'same_mechanism',selected:rel?.id||null,kind:rel?'relation':null,page:0};return;
  }
  const p=new URLSearchParams(location.hash.slice(1));
  const requested=p.get('r')||p.get('m');
  s={view:['meanings','comparisons','graph'].includes(p.get('v'))?p.get('v'):'meanings',topic:topicById.has(p.get('t'))?p.get('t'):'all',author:['nik','elon'].includes(p.get('a'))?p.get('a'):'all',filter:p.get('f')||'all',q:p.get('q')||'',selected:requested&&(cardById.has(requested)||relationById.has(requested))?requested:null,kind:p.has('r')?'relation':'meaning',reading:p.get('read')==='1',page:Math.max(0,Math.min(999,Number.parseInt(p.get('p'),10)||0))};
  if(!s.selected)s.kind=null;
}
function searchGroups(){return normal(s.q).trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(token=>[token,...Object.entries(RU).filter(([k])=>token.startsWith(k)).flatMap(([,v])=>v)]);}
function match(text,groups){return groups.every(group=>group.some(token=>text.includes(token)));}
function ranked(items,groups){
  if(!groups.length)return items;
  const phrase=normal(s.q).replace(/^"|"$/g,'').trim();
  const score=item=>{const title=normal(item.title),statement=normal(item.statement||item.decisions?.[0]?.mechanism||'');return groups.reduce((n,g)=>n+(g.some(t=>title.includes(t))?20:0)+(g.some(t=>statement.includes(t))?5:0),0)+(title.includes(phrase)?80:0)+(statement.includes(phrase)?30:0)+(item._search.includes(phrase)?15:0);};
  return items.map((item,i)=>({item,i,score:score(item)})).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.item);
}
function filtered(){
  const groups=searchGroups();
  if(s.view==='comparisons')return ranked(relations.filter(r=>(s.topic==='all'||r.topic_ids.includes(s.topic))&&(s.filter==='all'||!TYPES[s.filter]||r.relation===s.filter)&&match(r._search,groups)),groups);
  return ranked(cards.filter(c=>(s.topic==='all'||c.topics.includes(s.topic))&&(s.author==='all'||c.side===s.author)&&(s.filter==='all'||!['linked','unlinked','unresolved'].includes(s.filter)||s.filter==='linked'&&c.coverage==='linked'||s.filter==='unlinked'&&c.coverage==='checked_no_established_link'||s.filter==='unresolved'&&c.coverage==='unresolved')&&match(c._search,groups)),groups);
}
function navMarkup(){
  let html=`<button class="topic-button all-topics ${s.topic==='all'?'active':''}" data-topic="all" ${s.topic==='all'?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">▦</span>All topics<span class="topic-count">${s.view==='comparisons'?relations.length:cards.length}</span></button>`;
  let group='';for(const t of topics){if(t.group!==group){group=t.group;html+=`<div class="nav-group">${esc(group)}</div>`;}const count=s.view==='comparisons'?t.relations:t.meanings;html+=`<button class="topic-button ${s.topic===t.id?'active':''}" data-topic="${t.id}" ${s.topic===t.id?'aria-current="page"':''}><span>${esc(t.name)}</span><span class="topic-count">${count}</span></button>`;}return html;
}
function syncControls(){
  $('topics').innerHTML=$('mobile-topics').innerHTML=navMarkup();
  const t=topicById.get(s.topic);$('page-title').textContent=t?t.name:'Company-building ideas.';
  $('page-description').textContent=t?t.title:`${cards.length} meanings across two source collections.`;
  if($('search').value!==s.q)$('search').value=s.q;
  document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===s.view;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.setAttribute('aria-controls','explorer');b.tabIndex=on?0:-1;});
  $('explorer').setAttribute('aria-labelledby',s.view+'-tab');
  document.querySelectorAll('[data-author]').forEach(b=>{const on=b.dataset.author===s.author;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  const options=s.view==='comparisons'?['<option value="all">All comparison types</option>',...Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${esc(v)} (${index.relation_counts[k]||0})</option>`)]:['<option value="all">All meanings</option>','<option value="linked">With a comparison</option>','<option value="unlinked">No established comparison</option>','<option value="unresolved">Unresolved</option>'];
  $('status-filter').innerHTML=options.join('');$('status-filter').value=[...$('status-filter').options].some(o=>o.value===s.filter)?s.filter:'all';
  document.querySelector('.author-filter').hidden=s.view==='comparisons';
  $('content').classList.toggle('graph-mode',s.view==='graph');$('content').classList.toggle('has-selection',!!s.selected);
  ['graph-intro','graph-tools','graph-legend'].forEach(id=>$(id).hidden=s.view!=='graph');
  document.querySelector('#graph-intro p').textContent=phone()?'Pinch to zoom. Tap a point to preview.':'Pinch to zoom; drag or scroll to pan.';
  $('graph-focus').disabled=!s.selected||s.kind!=='meaning';$('graph-focus').textContent=focusGraph?'Show full view':'Focus selected idea';
  const active=Number(s.author!=='all')+Number(s.filter!=='all');
  $('filter-badge').hidden=!active;$('filter-badge').textContent=active;
  $('filters-open').setAttribute('aria-label',active?`Filters, ${active} active`:'Filters');
  $('mobile-reset').hidden=!(active||s.topic!=='all'||s.q);
  $('search-clear').hidden=!s.q;
  $('status-label').classList.toggle('sr-only',!phone());
  renderGraphSelection();
}
function renderGraphSelection(){
  const card=cardById?.get(s.selected),rel=relationById?.get(s.selected),item=card||rel;
  const node=$('graph-selection');node.hidden=!(phone()&&s.view==='graph'&&item);
  node.innerHTML=node.hidden?'':`<button class="graph-selection-close" data-action="clear-graph-selection" aria-label="Dismiss graph selection">×</button><span class="eyebrow">${card?esc(label(card)):esc(TYPES[rel.relation])}</span><strong>${esc(item.title)}</strong><div><button class="secondary-button" data-action="read-graph-selection">Read ${card?'idea':'comparison'} ↗</button>${card?'<button class="text-button" data-action="focus-graph-selection">Show connections</button>':''}</div>`;
}
function renderList(){
  currentItems=filtered();const total=currentItems.length,isRel=s.view==='comparisons';
  $('result-count').textContent=`${total.toLocaleString()} ${isRel?'comparisons':'meanings'}${s.topic==='all'?'':' in this topic'}`;
  $('sort-note').textContent=s.view==='graph'?'All matching records':s.q?'Matching your search':'Reading order';
  $('results').setAttribute('aria-busy','false');
  $('filters-done').textContent=`Show ${total.toLocaleString()} ${isRel?'comparisons':'meanings'}`;
  $('search-clear').hidden=!s.q;
  if(s.view==='graph'){renderGraph(currentItems);$('pagination').innerHTML='';return;}
  const pages=Math.max(1,Math.ceil(total/PAGE));s.page=Math.min(s.page,pages-1);
  const visible=currentItems.slice(s.page*PAGE,(s.page+1)*PAGE);
  $('results').innerHTML=visible.length?visible.map(item=>{
    if(isRel){return `<button class="result-card ${s.selected===item.id?'active':''}" data-select-relation="${item.id}" aria-pressed="${s.selected===item.id}"><div class="card-topline">${pill(item.relation)}<span class="mini-arrow" aria-hidden="true">↗</span></div><h3>${esc(item.title)}</h3><p>${esc(item.decisions[0].mechanism)}</p><div class="card-meta"><span>${esc(topicById.get(item.topic_ids[0])?.name||'Comparison')}</span><span>·</span><span>Both source collections</span></div></button>`;}
    return `<button class="result-card ${s.selected===item.id?'active':''}" data-select-meaning="${esc(item.id)}" aria-pressed="${s.selected===item.id}"><div class="card-topline">${sourceMark(item.side)}${esc(label(item))}<span class="mini-arrow" aria-hidden="true">↗</span></div><h3>${esc(item.title)}</h3><p>${esc(item.statement)}</p><div class="card-meta"><span>${item.facet_count} details</span><span>·</span><span>${item.evidence_keys.length} quotations</span>${item.links.length?`<span class="link-count">↔ ${item.links.length} comparisons</span>`:''}</div></button>`;
  }).join(''):`<div class="empty-results"><h3>No matches in this view.</h3><p>Try fewer words, another source, or all topics. Search includes original quotations in both languages.</p><button class="secondary-button" data-action="reset">Clear filters</button></div>`;
  $('pagination').innerHTML=total?`<span>${s.page*PAGE+1}–${Math.min((s.page+1)*PAGE,total)} of ${total}</span><div><button data-page="prev" ${s.page===0?'disabled':''}>← Previous</button><button data-page="next" ${s.page>=pages-1?'disabled':''}>Next →</button></div>`:'';
}
function render(){syncControls();renderList();route();}
function isolateReading(on){document.querySelectorAll('.topbar,.sidebar,.library-heading,.mobile-actions,.search-wrap,.search-label,.toolbar,.filter-row,.result-pane,.load-status,.skip-link').forEach(node=>node.inert=on);}
function closeReader(){
  const reader=$('reader'),wasOpen=reader.classList.contains('mobile-open');reader.classList.remove('mobile-open');reader.removeAttribute('role');reader.removeAttribute('aria-modal');document.body.classList.remove('mobile-reading');isolateReading(false);
  if(wasOpen){window.scrollTo(0,listScroll);const origin=readerOriginRecord&&document.querySelector(`[data-select-${readerOriginRecord.kind}="${CSS.escape(readerOriginRecord.id)}"]`);const target=origin||(lastFocused?.isConnected?lastFocused:$('results'));target.focus({preventScroll:true});readerOrigin=null;readerOriginRecord=null;}
}
function openReader(){if(mobile()){
  const reader=$('reader');if(!reader.classList.contains('mobile-open')){listScroll=scrollY;readerOrigin=lastFocused;}
  reader.classList.add('mobile-open');reader.setAttribute('role','dialog');reader.setAttribute('aria-modal','true');document.body.classList.add('mobile-reading');isolateReading(true);reader.querySelector('.back-button')?.focus({preventScroll:true});
}}
function leaveReader(){
  if(!mobile())return;
  if(history.state?.atlasRecord===s.selected){history.back();return;}
  if(s.view==='graph'){s.reading=false;}else{s.selected=null;s.kind=null;}renderToken++;closeReader();render();
}
function readerBar(caption,mark=''){return `<div class="reader-bar"><button class="back-button" data-action="back" aria-label="Back to previous view">← Back</button><div class="source-label">${mark}<span>${esc(caption)}</span></div><div class="reader-tools"><button class="copy-button" data-action="copy">Copy link ↗</button></div></div>`;}
async function select(id,kind,{push=true,open=true}={}){
  if(!(kind==='meaning'?cardById:relationById).has(id))return;
  if(mobile()&&open&&!$('reader').classList.contains('mobile-open'))readerOriginRecord={id,kind};
  lastFocused=readerOrigin||document.activeElement;s.selected=id;s.kind=kind;s.reading=phone()&&s.view==='graph'&&open;route(push);syncControls();renderList();const token=++renderToken;
  if(tooltip)tooltip.hidden=true;
  $('reader').innerHTML=readerBar('Opening source-backed record')+'<div class="loading-state"><span class="loader"></span><p>Opening the idea and its evidence</p></div>';
  if(open)openReader();
  try{if(kind==='meaning')await renderMeaning(id,token);else await renderRelation(id,token);if(token===renderToken){$('reader').scrollTop=0;if(open)openReader();}}
  catch(error){if(token===renderToken)$('reader').innerHTML=readerBar('Unable to open record')+`<div class="reader-error">${esc(error.message)}<p>Your source data has not changed.</p><button class="secondary-button" data-action="retry">Try again</button></div>`;}
}
async function detail(id){const card=cardById.get(id);return (await json(`data/cards/${card.chunk}.json`))[id];}
async function evidence(keys){
  const chunks=[...new Set(keys.map(k=>k.split('/').slice(0,2).join('-')))];
  const loaded=await Promise.all(chunks.map(k=>json(`data/evidence/${k}.json`)));const lookup=Object.assign({},...loaded);
  return keys.map(key=>{if(!lookup[key])throw new Error('Missing original source record');return {key,original:lookup[key]};});
}
function quoteMarkup(row){
  const e=row.original,side=row.key.split('/')[0],source=index.sources[side+'/'+e.source_id]||{};
  let url=e.url||source.url;const at=e.start_ms==null?'':`${Math.floor(e.start_ms/60000)}:${String(Math.floor(e.start_ms/1000)%60).padStart(2,'0')}`;
  if(url&&url.includes('youtube.com/watch?')&&e.start_ms!=null)url+='&t='+Math.floor(e.start_ms/1000)+'s';
  const path=e.source_path||source.path;
  const remote='https://github.com/timsmykov/founder-systems/blob/main/data/evidence/'+encodeURI(row.key.split('/').slice(0,2).join('-'))+'.json';
  const usable=url&&/^https?:\/\//.test(url);
  return `<article class="quote" data-evidence="${esc(row.key)}"><div class="quote-header"><span>${esc(source.title||e.source_id)}</span><span>${esc(VOICES[e.speaker]||String(e.speaker||'Uncertain speaker').replaceAll('_',' '))}</span></div>${typeof e.text==='string'?`<blockquote>${esc(e.text)}</blockquote>`:'<p class="nested-note">Quotation text is not redistributed in this edition. Consult the cited publication.</p>'}${e.context_note?`<p class="nested-note">${esc(e.context_note)} <a href="${esc((e.url||source.url)+'&t='+Math.floor(e.context_start_ms/1000)+'s')}" target="_blank" rel="noopener">Watch full context ↗</a></p>`:''}<div class="quote-links">${usable?`<a href="${esc(url)}" target="_blank" rel="noopener">${at?'Watch at '+at+' ↗':'Original publication ↗'}</a>`:''}${remote?`<a href="${esc(remote)}" target="_blank" rel="noopener">Quotation record ↗</a>`:''}</div><details class="quote-more"><summary>Exact source address</summary><div class="quote-address">${esc(e.source_id)}${e.json_locator?` · ${esc(e.json_locator)} (offsets within chapter text)`:""} · characters [${e.char_start}, ${e.char_end})${e.start_unit==null?'':` · units [${e.start_unit}, ${e.end_unit})`}${e.start_ms==null?'':` · ${e.start_ms} ms`}<br>${esc(row.key)}<br>Text SHA256: ${esc(e.text_sha256||'')}</div></details></article>`;
}
async function showQuotes(keys,container,{limit=3,reset=false,heading='Original quotations'}={}){
  const node=$(container);if(!node)return;const owner=renderToken;
  node.innerHTML='<p class="nested-note">Opening original quotations…</p>';
  try{const unique=[...new Set(keys)];const rows=await evidence(unique.slice(0,limit));if(owner!==renderToken||!$(container))return;
    node.innerHTML=`<h3 class="section-title">${esc(heading)} <span>${unique.length}</span>${reset?'<button class="text-button" data-action="all-card-quotes">Show all sources</button>':''}</h3>`+rows.map(quoteMarkup).join('')+(unique.length>limit?`<button class="expand-button" data-more-quotes="${esc(container)}">Read all ${unique.length} quotations ↓</button>`:'');
    node._quoteKeys=unique;
  }catch(error){if(owner===renderToken&&$(container))node.innerHTML=`<p class="reader-error">${esc(error.message)}</p><button class="secondary-button" data-action="retry">Retry evidence</button>`;}
}
async function renderMeaning(id,token){
  const card=cardById.get(id),d=await detail(id);if(token!==renderToken)return;const o=d.original;
  const contextual=card.usage.class!=='source_bound_reference';
  const supplements=d.supplements||[],allFacets=[...o.facets,...supplements.flatMap(x=>x.facets)];
  const additions=supplements.map(x=>`<div class="context-note"><strong>${esc(x.source_label)}</strong><p>${esc(x.title)}. ${esc(x.statement)}</p>${x.limitations.map(t=>`<p>${esc(t)}</p>`).join('')}<p>Original-English automatic captions; inferred speaker attribution. Read the complete video context for the detailed claims.</p></div>`).join('');
  const facets=allFacets.map((f,i)=>`<div class="facet" ${i>=5?'data-extra-facet hidden':''} data-facet-id="${esc(f.id)}"><span class="facet-kind">${esc(f.kind.replaceAll('_',' '))}</span><p>${esc(f.text)}</p><button class="facet-source-button" data-facet-evidence="${esc(f.id)}">Read evidence (${(d.facet_evidence[f.id]||[]).length}) ↗</button></div>`).join('');
  $('reader').innerHTML=readerBar(label(card),sourceMark(card.side))+`<h2 class="detail-title">${esc(o.title)}</h2><div class="reader-jumps"><button data-jump="meaning-details">Details <span>${allFacets.length}</span></button><button data-jump="card-quotes">Quotations <span>${card.evidence_keys.length}</span></button><button data-jump="card-connections">Connections <span>${card.links.length}</span></button></div><p class="detail-statement">${esc(o.statement)}</p><div class="detail-topics">${card.topics.map(t=>`<button class="topic-chip" data-topic="${t}">${esc(topicById.get(t).name)}</button>`).join('')}</div>${contextual?`<div class="context-note"><strong>${card.usage.class==='source_context_only'?'Supporting context':'Read with its qualifications'}.</strong> ${esc(card.usage.reason)}</div>`:''}${additions}<section class="detail-section" id="meaning-details"><h3 class="section-title">The details <span>${allFacets.length}</span></h3>${facets}${allFacets.length>5?`<button class="expand-button" data-action="facets">Read all ${allFacets.length} details ↓</button>`:''}</section><section class="detail-section" id="card-quotes"></section><section class="detail-section" id="card-connections"><h3 class="section-title">Connections to the other collection <span>${card.links.length}</span></h3>${card.links.length?card.links.map(rid=>{const r=relationById.get(rid);const others=[...new Set(r.decisions.flatMap(d=>d[card.side==='nik'?'elon':'nik'].map(e=>e.idea_id)))];return `<button class="relation-mini" data-select-relation="${rid}">${pill(r.relation)}<h4>${esc(r.title)} ↗</h4><div class="other-title">${others.map(i=>esc(cardById.get(i)?.title||i)).join(' · ')}</div></button>`;}).join(''):`<div class="context-note"><strong>${card.coverage==='unresolved'?'Comparison unresolved.':'No established comparison.'}</strong> ${esc(d.coverage.independent_review?.reason||d.coverage.reason)} This is a recorded search outcome, not proof that the idea is unique.</div>`}</section><details class="detail-disclosure"><summary>Attribution, scope & original variants</summary><p>${esc(card.usage.reason)}</p><p><strong>Why this was retained.</strong> ${esc(o.relevance)}</p><p><strong>Original categories.</strong> ${esc(o.topics.join(' · '))}</p><p><strong>Record.</strong> ${esc(id)}</p>${o.members.map(m=>`<details class="detail-disclosure"><summary>${esc(m.title)} · original meaning variant</summary><p>${esc(m.statement)}</p>${m.facets.map(f=>`<p><strong>${esc(f.kind)}.</strong> ${esc(f.text)}</p>`).join('')}</details>`).join('')}${d.source_review_paths.length?`<p><strong>Review source.</strong> ${d.source_review_paths.map(p=>`<a href="https://github.com/timsmykov/founder-systems-research/blob/main/${encodeURI(p)}" target="_blank" rel="noopener">${esc(p.split('/').slice(-2).join('/'))}</a>`).join(' · ')}</p>`:''}</details>`;
  await showQuotes(card.evidence_keys,'card-quotes');
}
function bullets(items){return items?.length?`<ul class="bullet-list">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p class="nested-note">No additional item recorded.</p>';}
async function renderRelation(id,token){
  const r=relationById.get(id),d=r.decisions[0];if(token!==renderToken)return;
  const endpoints=side=>[...new Set(r.decisions.flatMap(x=>x[side].map(e=>e.idea_id)))];
  $('reader').innerHTML=readerBar(r.increment?'Interview comparison · single reader':'A reviewed comparison')+pill(r.relation)+`<h2 class="detail-title" style="margin-top:14px">${esc(r.title)}</h2><p class="detail-statement">${esc(d.mechanism)}</p><div class="detail-topics">${r.topic_ids.map(t=>`<button class="topic-chip" data-topic="${t}">${esc(topicById.get(t).name)}</button>`).join('')}</div><div class="relation-action"><span class="eyebrow">THE COMPARED ACTION</span><p>${esc(d.action)}</p></div><div class="two-sides">${['nik','elon'].map(side=>`<section class="side-evidence"><h3 class="section-title">${sourceMark(side)}${side==='nik'?'Nik / QuantumLight':'Elon · via the book'}</h3>${endpoints(side).map(i=>`<button class="endpoint-button" data-select-meaning="${esc(i)}">${esc(cardById.get(i).title)} ↗</button>`).join('')}<div id="relation-${side}-quotes"></div></section>`).join('')}</div><section class="detail-section"><h3 class="section-title">Conditions & limits</h3>${bullets(d.conditions)}</section><section class="detail-section"><h3 class="section-title">Where the approaches differ</h3>${bullets(d.differences)}</section>${d.counterevidence?.length?`<section class="detail-section"><h3 class="section-title">Counterevidence & qualifications</h3>${bullets(d.counterevidence)}</section>`:''}<details class="detail-disclosure"><summary>Attribution & review status</summary><p>${esc(d.attribution_notes||d.attribution||'Source voices remain attached to each original quotation.')}</p><p>${esc(d.independence_notes||d.independence||'Different publications do not establish independent corroboration.')}</p><p>${esc(typeof d.independent_review?.reason==='string'?d.independent_review.reason:JSON.stringify(d.independent_review||{}))}</p><p>Record: ${esc(r.id)}</p><p>${esc(r.interpretation)}</p></details>${r.decisions.length>1?`<details class="detail-disclosure"><summary>All ${r.decisions.length} retained review variants</summary>${r.decisions.map(x=>`<h3 class="section-title">${esc(x.title)}</h3><p>${esc(x.action)}</p><p>${esc(x.mechanism)}</p>${bullets(x.conditions)}${bullets(x.differences)}${bullets(x.counterevidence)}`).join('')}</details>`:''}`;
  await Promise.all(['nik','elon'].map(side=>showQuotes(r.decisions.flatMap(x=>x[side].flatMap(e=>e.evidence_keys)),`relation-${side}-quotes`,{limit:2})));
}
function renderGraph(items){
  let nodes=items;let ids=new Set(nodes.map(c=>c.id));let rs=relations.filter(r=>r.endpoint_ids.every(id=>ids.has(id)));
  if(focusGraph&&s.kind==='meaning'&&s.selected){rs=relations.filter(r=>r.endpoint_ids.includes(s.selected));ids=new Set([s.selected,...rs.flatMap(r=>r.endpoint_ids)]);nodes=cards.filter(c=>ids.has(c.id));}
  const W=1000,H=760,positions=new Map();
  for(const side of ['nik','elon']){const group=nodes.filter(c=>c.side===side);const cols=side==='nik'?17:13;group.forEach((c,i)=>{const rows=Math.max(1,Math.ceil(group.length/cols));positions.set(c.id,{x:(side==='nik'?35:710)+(i%cols)*(side==='nik'?16:20),y:80+Math.floor(i/cols)*Math.min(27,610/rows)});});}
  const hubs=new Map(rs.map((r,i)=>[r.id,{x:425+(i%8)*20,y:80+Math.floor(i/8)*Math.min(25,610/Math.max(1,Math.ceil(rs.length/8)))}]));
  let lines='';for(const r of rs){const h=hubs.get(r.id);for(const id of r.endpoint_ids){const p=positions.get(id);if(p)lines+=`<line x1="${p.x}" y1="${p.y}" x2="${h.x}" y2="${h.y}" data-edge-for="${r.id}"/>`;}}
  let circles=nodes.map(c=>{const p=positions.get(c.id);return `<a href="#" data-node="${esc(c.id)}" aria-label="${esc(c.title)}"><circle class="node ${c.links.length?'':'isolated'} ${s.selected===c.id?'selected':''}" data-graph-node="${esc(c.id)}" cx="${p.x}" cy="${p.y}" r="${focusGraph?6:4}" fill="${c.side==='nik'?'var(--nik)':'var(--elon)'}"/></a>`;}).join('');
  let hubNodes=rs.map(r=>{const p=hubs.get(r.id);return `<a href="#" data-hub="${r.id}" aria-label="${esc(r.title)}"><circle class="hub" data-graph-hub="${r.id}" cx="${p.x}" cy="${p.y}" r="3"/></a>`;}).join('');
  $('results').innerHTML=nodes.length?`<svg class="network" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${phone()?'xMidYMin meet':'xMidYMid meet'}" role="group" aria-label="${nodes.length} meanings and ${rs.length} reviewed comparison groups. Left: Nik and QuantumLight. Right: the Elon book collection. Central points represent comparisons."><text class="network-label" x="35" y="40">Nik / QuantumLight · ${nodes.filter(c=>c.side==='nik').length}</text><text class="network-label" x="425" y="40">${rs.length} comparisons</text><text class="network-label" x="710" y="40">Elon collection · ${nodes.filter(c=>c.side==='elon').length}</text><g id="graph-layer">${lines}${hubNodes}${circles}</g></svg>`:'<div class="graph-empty">No ideas match these filters. Clear filters to see the complete graph.</div>';
  graphController?.destroy();const svg=$('results').querySelector('.network');if(svg){
    graphController=bindGraphCamera(svg,$('graph-layer'),graphCamera,{onChange:c=>{$('graph-zoom-value').textContent=Math.round(c.scale*100)+'%';},onMove:hideGraphTooltip});
    // Pick the nearest point in screen pixels: small SVG dots are not finger-sized targets.
    svg.addEventListener('click',e=>{if(!phone())return;e.preventDefault();e.stopPropagation();
      let node=e.detail===0?e.target.closest('a')?.querySelector('[data-graph-node],[data-graph-hub]'):null;
      if(!node){let distance=20;for(const candidate of svg.querySelectorAll('[data-graph-node],[data-graph-hub]')){const r=candidate.getBoundingClientRect(),d=Math.hypot(r.x+r.width/2-e.clientX,r.y+r.height/2-e.clientY);if(d<distance){distance=d;node=candidate;}}}
      if(node)select(node.dataset.graphNode||node.dataset.graphHub,node.dataset.graphNode?'meaning':'relation',{open:false,push:false});
    });
  }
  $('result-count').textContent=`${nodes.length} meanings · ${rs.length} comparisons`;
}
function filterChanged(){s.page=0;focusGraph=false;graphCamera.fit();closeReader();s.selected=null;s.kind=null;renderToken++;$('reader').innerHTML=emptyReader;render();$('results').scrollTop=0;}
function setTopic(topic){s.topic=topic;s.selected=null;s.kind=null;filterChanged();$('topic-dialog').close();}
function reset(){s={view:'meanings',topic:'all',author:'all',filter:'all',q:'',selected:null,kind:null,page:0};filterChanged();}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button,a');if(!b)return;
  if(b.dataset.jump){$(b.dataset.jump)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
  if(b.dataset.topic){setTopic(b.dataset.topic);return;}
  if(b.dataset.start){setTopic(b.dataset.start);return;}
  if(b.dataset.selectMeaning){select(b.dataset.selectMeaning,'meaning');return;}
  if(b.dataset.selectRelation){select(b.dataset.selectRelation,'relation');return;}
  if(b.dataset.node){e.preventDefault();select(b.dataset.node,'meaning',{open:!phone(),push:!phone()});return;}
  if(b.dataset.hub){e.preventDefault();select(b.dataset.hub,'relation',{open:!phone(),push:!phone()});return;}
  if(b.dataset.view){if(phone()&&s.view===b.dataset.view){window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}s.view=b.dataset.view;s.filter='all';s.author='all';filterChanged();if(phone())window.scrollTo(0,0);return;}
  if(b.dataset.author){if(b.classList.contains('portrait-choice'))s.view='meanings';s.author=b.dataset.author;filterChanged();return;}
  if(b.dataset.page){s.page+=b.dataset.page==='next'?1:-1;renderList();route();$('results').scrollTop=0;return;}
  if(b.dataset.close){$(b.dataset.close).close();return;}
  if(b.dataset.action==='back'){leaveReader();return;}
  if(b.dataset.action==='read-graph-selection'){select(s.selected,s.kind);return;}
  if(b.dataset.action==='clear-graph-selection'){s.selected=null;s.kind=null;renderToken++;render();return;}
  if(b.dataset.action==='focus-graph-selection'){focusGraph=true;graphCamera.fit();syncControls();renderList();return;}
  if(b.dataset.action==='reset'){reset();return;}
  if(b.id==='start-shared'){s.view='comparisons';s.filter='same_mechanism';s.topic='all';s.q='';filterChanged();return;}
  if(b.dataset.action==='copy'){try{await navigator.clipboard.writeText(location.href);b.textContent='Link copied ✓';setTimeout(()=>{if(b.isConnected)b.textContent='Copy link ↗';},1800);}catch{b.textContent='Link is in the address bar';}return;}
  if(b.dataset.action==='retry'){select(s.selected,s.kind,{push:false});return;}
  if(b.dataset.action==='facets'){document.querySelectorAll('[data-extra-facet]').forEach(n=>n.hidden=false);b.remove();return;}
  if(b.dataset.facetEvidence){const owner=renderToken,d=await detail(s.selected);if(owner!==renderToken)return;await showQuotes(d.facet_evidence[b.dataset.facetEvidence]||[],'card-quotes',{reset:true,heading:'Evidence for this detail'});$('card-quotes')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
  if(b.dataset.action==='all-card-quotes'){showQuotes(cardById.get(s.selected).evidence_keys,'card-quotes');return;}
  if(b.dataset.moreQuotes){const node=$(b.dataset.moreQuotes);if(node?._quoteKeys)showQuotes(node._quoteKeys,node.id,{limit:node._quoteKeys.length});}
});
function applySearch(){clearTimeout(searchTimer);s.q=$('search').value;s.page=0;renderList();route();}
$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(applySearch,140);});
$('search').addEventListener('keydown',e=>{if(e.key==='Enter'&&phone()){e.preventDefault();applySearch();$('search').blur();window.scrollTo(0,0);}});
$('status-filter').addEventListener('change',()=>{s.filter=$('status-filter').value;filterChanged();});
$('reset').addEventListener('click',reset);
$('mobile-reset').addEventListener('click',()=>{const view=s.view;reset();s.view=view;render();window.scrollTo(0,0);});
$('search-clear').addEventListener('click',()=>{$('search').value='';$('search').dispatchEvent(new Event('input'));$('search').focus();});
$('filters-open').addEventListener('click',()=>$('filters-dialog').showModal());
$('filters-done').addEventListener('click',()=>$('filters-dialog').close());
$('mobile-about').addEventListener('click',()=>{$('filters-dialog').close();$('about-dialog').showModal();});
$('topic-open').addEventListener('click',()=>$('topic-dialog').showModal());
$('about-open').addEventListener('click',()=>$('about-dialog').showModal());
$('graph-zoom-in').addEventListener('click',()=>graphController?.zoom(1.25));
$('graph-zoom-out').addEventListener('click',()=>graphController?.zoom(0.8));
$('graph-fit').addEventListener('click',()=>graphController?.fit());
$('graph-expand').addEventListener('click',async()=>{const pane=document.querySelector('.result-pane');if(document.fullscreenElement){await document.exitFullscreen();}else if(pane.requestFullscreen){await pane.requestFullscreen();}else{pane.classList.toggle('graph-expanded');}});
$('results').addEventListener('keydown',e=>{if(s.view!=='graph'||e.target.closest('a'))return;if(e.key==='+'||e.key==='='){e.preventDefault();graphController?.zoom(1.25);}if(e.key==='-'){e.preventDefault();graphController?.zoom(0.8);}if(e.key.toLowerCase()==='f'){e.preventDefault();graphController?.fit();}});
$('graph-focus').addEventListener('click',()=>{focusGraph=!focusGraph;graphCamera.fit();syncControls();renderList();});
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();reset();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('reader').classList.contains('mobile-open'))leaveReader();if((e.key==='/'||e.key.toLowerCase()==='k'&&(e.metaKey||e.ctrlKey))&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
window.addEventListener('hashchange',()=>{if(!index)return;const keepScroll=$('reader').classList.contains('mobile-open');parseRoute();render();if(s.selected){const open=!(phone()&&s.view==='graph'&&!s.reading);if(!open)closeReader();select(s.selected,s.kind,{push:false,open});}else{closeReader();if(keepScroll)window.scrollTo(0,listScroll);}});
matchMedia('(max-width:1100px)').addEventListener('change',e=>{if(!index)return;if(e.matches&&s.selected&&!(phone()&&s.view==='graph'&&!s.reading))openReader();else if(!e.matches)closeReader();});
let tooltip;
function hideGraphTooltip(){if(tooltip)tooltip.hidden=true;document.querySelectorAll('[aria-describedby="graph-tooltip"]').forEach(n=>n.removeAttribute('aria-describedby'));}
function showGraphTooltip(node,x,y){
  const item=cardById.get(node.dataset.graphNode)||relationById.get(node.dataset.graphHub);if(!item)return;
  tooltip??=document.body.appendChild(Object.assign(document.createElement('div'),{className:'graph-tooltip',id:'graph-tooltip'}));
  tooltip.setAttribute('role','tooltip');tooltip.textContent=(item.relation?TYPES[item.relation]+': ':'')+item.title;tooltip.hidden=false;
  const rect=tooltip.getBoundingClientRect();tooltip.style.left=Math.max(12,Math.min(innerWidth-rect.width-12,x+16))+'px';tooltip.style.top=Math.max(12,y+rect.height+26>innerHeight?y-rect.height-14:y+18)+'px';
  node.closest('a')?.setAttribute('aria-describedby','graph-tooltip');
}
$('results').addEventListener('pointerover',e=>{const node=e.target.closest('[data-graph-node],[data-graph-hub]');if(node)showGraphTooltip(node,e.clientX,e.clientY);});
$('results').addEventListener('pointerout',hideGraphTooltip);
$('results').addEventListener('focusin',e=>{const node=e.target.closest('a')?.querySelector('[data-graph-node],[data-graph-hub]');if(node){const r=node.getBoundingClientRect();showGraphTooltip(node,r.x+r.width/2,r.y+r.height);}});
$('results').addEventListener('focusout',hideGraphTooltip);
$('results').addEventListener('scroll',hideGraphTooltip);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideGraphTooltip();});


async function loadQuoteSearch(){
  try{const quotes=await json('data/quote-search.json');for(const c of cards)c._search+=' '+normal(c.evidence_keys.map(k=>quotes[k]||'').join(' '));for(const r of relations)r._search+=' '+r.endpoint_ids.map(id=>cardById.get(id)._search).join(' ');quoteSearchReady=true;notify('Search covers titles, details and original quotations in both languages.');if(s.q)renderList();}
  catch{notify('Idea search is ready. Quotation search could not load; reload to retry.');}
}
async function init(){
  try{
    const [i,r]=await Promise.all([json('data/index.json'),json('data/relations.json')]);index=i;cards=i.cards;topics=i.topics;relations=r.relations;legacyIds=relations.filter(x=>x.relation==='same_mechanism'&&!x.increment).map(x=>x.id);for(const rel of relations)if(rel.supplemental_decisions)rel.decisions=[...rel.decisions,...rel.supplemental_decisions];cardById=new Map(cards.map(c=>[c.id,c]));relationById=new Map(relations.map(x=>[x.id,x]));topicById=new Map(topics.map(t=>[t.id,t]));
    for(const c of cards)c._search=normal([c.title,c.statement,c.relevance,c.search,c.source_topics.join(' '),c.voices.join(' '),label(c)].join(' '));
    for(const rel of relations){const rt=r.routes[rel.id];rel.topic_ids=[rt.primary_topic,...rt.secondary_topics];rel.endpoint_ids=[...new Set(rel.decisions.flatMap(d=>['nik','elon'].flatMap(side=>d[side].map(e=>e.idea_id))))];rel._search=normal(JSON.stringify(rel.decisions)+' '+rel.endpoint_ids.map(id=>cardById.get(id).title).join(' '));}
    for(const t of topics){t.meanings=cards.filter(c=>c.topics.includes(t.id)).length;t.relations=relations.filter(r=>r.topic_ids.includes(t.id)).length;}
    cards.sort((a,b)=>topicById.get(a.topics[0]).order-topicById.get(b.topics[0]).order||a.title.localeCompare(b.title));
    relations.sort((a,b)=>topicById.get(a.topic_ids[0]).order-topicById.get(b.topic_ids[0]).order||a.title.localeCompare(b.title));
    // Keep the previous 23-card links tied to the original sealed order.
    window.atlas={counts:i.counts,cards:cardById,relations:relationById,detail,evidence,select,filtered,get state(){return {...s};},get quoteSearchReady(){return quoteSearchReady;}};
    const legacy=/^#M\d{2}$/.test(location.hash)?Number(location.hash.slice(2)):null;
    if(legacy){const rel=relationById.get(legacyIds[legacy-1]);s={...s,view:'comparisons',filter:'same_mechanism',selected:rel?.id,kind:'relation'};}else parseRoute();
    render();if(s.selected)await select(s.selected,s.kind,{push:false,open:!(phone()&&s.view==='graph'&&!s.reading)});
    notify('Meanings and comparisons are ready. Preparing quotation search…');loadQuoteSearch();
  }catch(error){$('results').innerHTML=`<div class="empty-results"><h3>The library could not load.</h3><p>${esc(error.message)}</p><button class="secondary-button" onclick="location.reload()">Reload the library</button></div>`;notify('Loading failed. Source records remain unchanged.');}
}
init();

document.querySelector('.tabs').addEventListener('keydown',e=>{const buttons=[...document.querySelectorAll('[data-view]')];let i=buttons.indexOf(e.target);if(i<0)return;if(e.key==='ArrowRight')i=(i+1)%buttons.length;else if(e.key==='ArrowLeft')i=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=buttons.length-1;else return;e.preventDefault();buttons[i].click();buttons[i].focus();});
