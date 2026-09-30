(() => {
  'use strict';

  const STORAGE_KEY = 'plan_space_state_v1';
  const ALLOWED_RICH = new Set(['B','I','U','S','STRONG','EM','H2','H3','P','BR','UL','OL','LI','BLOCKQUOTE','A']);
  const CHART_COLORS = ['#F4B8C4','#F6C6A8','#F3DFA2','#B8D8C0','#B9DDD5','#C9B8E8','#D5C7EA','#E8AFAF','#C5D6B7','#BFD7EA'];
  const DEFAULT_BOX = { x: 120, y: 120, width: 320, height: 220, z: 1 };
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'ps-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
  const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validURL = value => { try { const u = new URL(String(value).trim()); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };

  const dom = {
    tabs: $('#spaceTabs'),
    canvas: $('#canvasSurface'),
    layer: $('#boxLayer'),
    connections: $('#connections'),
    empty: $('#emptyState'),
    modal: $('#modalRoot'),
    toast: $('#toastRoot'),
    search: $('#searchInput'),
    file: $('#importFile'),
    header: $('#appHeader')
  };

  if (document.body.classList.contains('not-found-page')) {
    init404();
    return;
  }

  let state = loadState();
  let activeDrag = null;
  let activeResize = null;
  let dragRAF = 0;
  let saveTimer = 0;
  let searchTimer = 0;
  let modalCleanup = null;
  let importPayload = null;
  let chartDraft = null;

  function init404(){
    const path=document.getElementById('path');
    const home=document.getElementById('homeBtn');
    const back=document.getElementById('backBtn');
    if(path) path.textContent=location.pathname||'/unknown-space';
    home?.addEventListener('click',()=>{location.href='index.html';});
    back?.addEventListener('click',()=>{if(history.length>1)history.back();else location.href='index.html';});
  }

  function defaultState() {
    const id = uid();
    return { version: 1, theme: 'dark', spaces: [{ id, name: 'My Space', boxes: [] }], activeSpaceId: id };
  }

  function normalizeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const out = { version: 1, theme: raw.theme === 'light' ? 'light' : 'dark', spaces: [], activeSpaceId: typeof raw.activeSpaceId === 'string' ? raw.activeSpaceId : '' };
    const sourceSpaces = Array.isArray(raw.spaces) ? raw.spaces : [];
    for (const s of sourceSpaces) {
      if (!s || typeof s !== 'object') continue;
      const sid = typeof s.id === 'string' && s.id ? s.id : uid();
      const boxes = Array.isArray(s.boxes) ? s.boxes.map(normalizeBox).filter(Boolean) : [];
      out.spaces.push({ id: sid, name: cleanName(s.name, 'Untitled Space'), boxes });
    }
    if (!out.spaces.length) out.spaces = base.spaces;
    if (!out.spaces.some(s => s.id === out.activeSpaceId)) out.activeSpaceId = out.spaces[0].id;
    out.spaces.forEach(s => {
      const ids = new Set(s.boxes.map(b => b.id));
      s.boxes.forEach(b => { if (!ids.has(b.parentId)) b.parentId = null; });
      // Remove invalid parent cycles conservatively.
      s.boxes.forEach(b => { if (wouldCycle(s.boxes, b.id, b.parentId)) b.parentId = null; });
    });
    return out;
  }

  function normalizeBox(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const types = new Set(['text','folder','task','link','chart']);
    const type = types.has(raw.type) ? raw.type : 'text';
    const box = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      type,
      title: cleanName(raw.title, typeLabel(type)),
      content: sanitizeRichText(typeof raw.content === 'string' ? raw.content : ''),
      url: validURL(raw.url) ? raw.url : '',
      tasks: Array.isArray(raw.tasks) ? raw.tasks.map(t => ({ id: typeof t?.id === 'string' ? t.id : uid(), text: String(t?.text ?? '').slice(0,500), done: !!t?.done })).filter(t => t.text) : [],
      chart: normalizeChart(raw.chart),
      parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
      x: finite(raw.x, DEFAULT_BOX.x), y: finite(raw.y, DEFAULT_BOX.y),
      width: clamp(finite(raw.width, DEFAULT_BOX.width), 230, 900),
      height: clamp(finite(raw.height, DEFAULT_BOX.height), 150, 700),
      z: clamp(finite(raw.z, 1), 1, 999)
    };
    if (type === 'link' && !box.url) box.url = '';
    return box;
  }

  function normalizeChart(c) {
    const kinds = new Set(['bar','line','pie']);
    const labels = Array.isArray(c?.labels) ? c.labels.map(v => String(v ?? '').slice(0, 80)).filter(Boolean).slice(0, 20) : [];
    const values = Array.isArray(c?.values) ? c.values.map(v => Number(v)).map(v => Number.isFinite(v) ? Math.max(0,v) : 0).slice(0,20) : [];
    while (values.length < labels.length) values.push(0);
    while (labels.length < values.length) labels.push(`Item ${labels.length + 1}`);
    return { kind: kinds.has(c?.kind) ? c.kind : 'bar', description: String(c?.description ?? '').slice(0, 300), labels, values };
  }

  function finite(v, fallback) { return Number.isFinite(Number(v)) ? Number(v) : fallback; }
  function cleanName(v, fallback) { const s = String(v ?? '').trim().replace(/\s+/g,' '); return (s || fallback).slice(0, 100); }
  function typeLabel(type) { return ({text:'Text',folder:'Folder',task:'Tasks',link:'Link',chart:'Chart'})[type] || 'Box'; }

  function loadState() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return normalizeState(raw ? JSON.parse(raw) : null); }
    catch { return defaultState(); }
  }
  function persistNow() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { showToast('Could not save locally. Your browser may block storage.', 'error'); }
  }
  function persistDebounced() { clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 220); }

  function activeSpace() { return state.spaces.find(s => s.id === state.activeSpaceId) || state.spaces[0]; }
  function boxById(id) { return activeSpace().boxes.find(b => b.id === id); }

  function renderAll() {
    document.documentElement.dataset.theme = state.theme;
    renderTabs();
    renderBoxes();
    renderConnections();
    updateEmptyState();
    updateThemeButtons();
    dom.canvas.scrollLeft = 0; dom.canvas.scrollTop = 0;
  }

  function renderTabs() {
    dom.tabs.innerHTML = state.spaces.map(s => `
      <div class="space-tab ${s.id === state.activeSpaceId ? 'active' : ''}" data-space-id="${escapeHTML(s.id)}" tabindex="0" role="tab" aria-selected="${s.id === state.activeSpaceId}">
        <span>${escapeHTML(s.name)}</span>
        <button class="tab-menu" data-action="space-menu" data-space-id="${escapeHTML(s.id)}" aria-label="Space actions"><i class="fa-solid fa-ellipsis"></i></button>
      </div>`).join('');
  }

  function renderBoxes() {
    const space = activeSpace();
    dom.layer.innerHTML = space.boxes.map(renderBoxHTML).join('');
    space.boxes.forEach(b => {
      const el = dom.layer.querySelector(`[data-box-id="${CSS.escape(b.id)}"]`);
      if (el) { el.style.left = `${b.x}px`; el.style.top = `${b.y}px`; el.style.width = `${b.width}px`; el.style.height = `${b.height}px`; el.style.zIndex = String(Math.min(999, b.z)); }
    });
    requestAnimationFrame(renderConnections);
  }

  function renderBoxHTML(b) {
    const icon = ({text:'fa-align-left',folder:'fa-folder',task:'fa-list-check',link:'fa-link',chart:'fa-chart-simple'})[b.type];
    let body = '';
    if (b.type === 'text') body = textBody(b);
    if (b.type === 'folder') body = folderBody(b);
    if (b.type === 'task') body = taskBody(b);
    if (b.type === 'link') body = linkBody(b);
    if (b.type === 'chart') body = chartBody(b);
    return `<article class="box ${b.type}-box" data-box-id="${escapeHTML(b.id)}" tabindex="0" aria-label="${escapeHTML(b.title)}">
      <header class="box-header" data-drag-handle>
        <i class="fa-solid ${icon}" aria-hidden="true"></i>
        <span class="box-title">${escapeHTML(b.title)}</span>
        <span class="box-type">${typeLabel(b.type)}</span>
        <div class="box-actions">
          ${b.type === 'link' ? `<button data-action="edit-box" aria-label="Edit link" title="Edit"><i class="fa-solid fa-pen"></i></button>` : ''}
          ${b.type === 'chart' ? `<button data-action="edit-chart" aria-label="Edit chart" title="Edit chart"><i class="fa-solid fa-pen"></i></button>` : ''}
          <button data-action="parent-box" aria-label="Set parent" title="Set parent"><i class="fa-solid fa-diagram-project"></i></button>
          <button data-action="delete-box" aria-label="Delete box" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </header>
      <div class="box-body">${body}</div>
      <div class="resize-handle" data-resize-handle aria-label="Resize"></div>
    </article>`;
  }

  function textBody(b) {
    return `<input class="text-title-input" data-field="title" value="${escapeHTML(b.title)}" aria-label="Text title">
      <div class="rich-toolbar" data-rich-toolbar>
        <button data-rich="bold" title="Bold" aria-label="Bold"><i class="fa-solid fa-bold"></i></button>
        <button data-rich="italic" title="Italic" aria-label="Italic"><i class="fa-solid fa-italic"></i></button>
        <button data-rich="underline" title="Underline" aria-label="Underline"><i class="fa-solid fa-underline"></i></button>
        <button data-rich="strikeThrough" title="Strike" aria-label="Strike"><i class="fa-solid fa-strikethrough"></i></button>
        <button data-rich="formatBlock" data-value="H2" title="Heading 2" aria-label="Heading 2"><i class="fa-solid fa-heading"></i></button>
        <button data-rich="formatBlock" data-value="H3" title="Heading 3" aria-label="Heading 3"><i class="fa-solid fa-heading"></i><sup>3</sup></button>
        <button data-rich="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list"><i class="fa-solid fa-list-ul"></i></button>
        <button data-rich="insertOrderedList" title="Numbered list" aria-label="Numbered list"><i class="fa-solid fa-list-ol"></i></button>
        <button data-rich="formatBlock" data-value="BLOCKQUOTE" title="Quote" aria-label="Quote"><i class="fa-solid fa-quote-left"></i></button>
        <button data-rich="createLink" title="Link" aria-label="Add link"><i class="fa-solid fa-link"></i></button>
      </div>
      <div class="rich-editor" data-field="content" contenteditable="true" spellcheck="true">${b.content || '<p>Start writing…</p>'}</div>`;
  }

  function folderBody(b) {
    const children = activeSpace().boxes.filter(x => x.parentId === b.id).length;
    const options = [`<option value="">No parent</option>`].concat(activeSpace().boxes.filter(x => x.id !== b.id && !wouldCycle(activeSpace().boxes, x.id, b.id)).map(x => `<option value="${escapeHTML(x.id)}" ${b.parentId===x.id?'selected':''}>${escapeHTML(x.title)}</option>`)).join('');
    return `<div class="folder-copy">Use this box as a visual parent. Children can be assigned from their own Parent action.</div>
      <select class="parent-select" data-field="parentId" aria-label="Folder parent">${options}</select>
      <div class="child-count">${children} direct child${children === 1 ? '' : 'ren'} · descendants follow movement</div>`;
  }

  function taskBody(b) {
    const done = b.tasks.filter(t => t.done).length;
    const total = b.tasks.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    return `<div class="task-add-row"><input data-task-input placeholder="Add a task…" aria-label="New task"><button class="small-btn" data-action="add-task" aria-label="Add task"><i class="fa-solid fa-plus"></i></button></div>
      <div class="progress-row"><span>${done} / ${total} complete</span><span>${pct}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="task-list">${b.tasks.map(t => `<div class="task-item ${t.done?'done':''}" data-task-id="${escapeHTML(t.id)}"><input type="checkbox" data-action="toggle-task" ${t.done?'checked':''} aria-label="Complete task"><span class="task-item-text" contenteditable="true" data-task-edit>${escapeHTML(t.text)}</span><button class="task-delete" data-action="delete-task" aria-label="Delete task"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}</div>`;
  }

  function linkBody(b) {
    if (!b.url) return `<div class="modal-note">No URL yet. Use Edit to add an HTTP or HTTPS link.</div>`;
    return `<a class="link-card" href="${escapeHTML(b.url)}" target="_blank" rel="noopener noreferrer"><div class="link-card-title">${escapeHTML(b.title)}</div><div class="link-card-url">${escapeHTML(b.url)}</div></a>`;
  }

  function chartBody(b) {
    return `<div class="chart-meta"><h3>${escapeHTML(b.title)}</h3><p>${escapeHTML(b.chart.description || '')}</p></div><div class="chart-wrap" data-chart-wrap></div><div class="chart-legend" data-chart-legend></div>`;
  }

  function updateEmptyState() { dom.empty.hidden = activeSpace().boxes.length > 0; }
  function updateThemeButtons() { $$('[data-action="theme"]').forEach(b => b.innerHTML = state.theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>'); }

  function renderConnections() {
    const space = activeSpace();
    const rect = dom.canvas.getBoundingClientRect();
    dom.connections.setAttribute('viewBox', `0 0 ${Math.max(dom.canvas.scrollWidth, 2400)} ${Math.max(dom.canvas.scrollHeight, 1800)}`);
    const paths = [];
    for (const child of space.boxes) {
      if (!child.parentId) continue;
      const parent = space.boxes.find(b => b.id === child.parentId);
      if (!parent) continue;
      const p = boxCenter(parent), c = boxCenter(child);
      const dx = Math.max(40, Math.abs(c.x - p.x) * .45);
      const dir = c.x >= p.x ? 1 : -1;
      const d = `M ${p.x} ${p.y} C ${p.x + dx*dir} ${p.y}, ${c.x - dx*dir} ${c.y}, ${c.x} ${c.y}`;
      paths.push(`<path d="${d}" fill="none" stroke="${getComputedStyle(document.documentElement).getPropertyValue('--border-strong').trim()}" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>`);
    }
    dom.connections.innerHTML = paths.join('');
  }

  function boxCenter(b) { return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  function descendants(space, id) {
    const out = new Set([id]);
    let changed = true;
    while (changed) { changed = false; for (const b of space.boxes) if (b.parentId && out.has(b.parentId) && !out.has(b.id)) { out.add(b.id); changed = true; } }
    return out;
  }
  function wouldCycle(space, childId, parentId) {
    if (!parentId || childId === parentId) return true;
    let cur = parentId, guard = 0;
    while (cur && guard++ < 1000) { if (cur === childId) return true; const p = space.boxes.find(b => b.id === cur); cur = p?.parentId || null; }
    return false;
  }

  function addBox(type) {
    const space = activeSpace();
    const offset = 70 + (space.boxes.length % 6) * 32;
    const base = { id: uid(), type, title: typeLabel(type), content: type === 'text' ? '<p></p>' : '', url: '', tasks: [], chart: normalizeChart({kind:'bar',labels:['A','B','C'],values:[25,40,30]}), parentId: null, x: 100 + offset, y: 90 + offset, width: type === 'chart' ? 430 : 320, height: type === 'task' ? 300 : type === 'chart' ? 300 : 220, z: Math.max(1, ...space.boxes.map(b => b.z)) + 1 };
    space.boxes.push(base);
    persistDebounced();
    renderAll();
    setTimeout(() => { const el = dom.layer.querySelector(`[data-box-id="${CSS.escape(base.id)}"]`); el?.focus(); }, 0);
    if (type === 'link') openLinkModal(base.id);
    if (type === 'chart') openChartModal(base.id);
    showToast(`${typeLabel(type)} box created`);
  }

  function deleteBox(id) {
    const space = activeSpace(); const b = space.boxes.find(x => x.id === id); if (!b) return;
    space.boxes = space.boxes.filter(x => x.id !== id).map(x => x.parentId === id ? {...x, parentId: null} : x);
    persistDebounced(); renderAll(); showToast(`${typeLabel(b.type)} box deleted`);
  }

  function setParent(childId, parentId) {
    const space = activeSpace(); const child = space.boxes.find(b => b.id === childId); if (!child) return;
    if (parentId && wouldCycle(space, childId, parentId)) { showToast('That parent would create a cycle.', 'error'); return; }
    child.parentId = parentId || null; persistDebounced(); renderAll();
  }

  function moveWithDescendants(id, dx, dy) {
    const space = activeSpace(), ids = descendants(space, id);
    ids.forEach(cid => { const b = space.boxes.find(x => x.id === cid); b.x += dx; b.y += dy; });
  }

  function startDrag(e, boxEl) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!e.target.closest('[data-drag-handle]')) return;
    if (e.target.closest('button,input,select,textarea,[contenteditable="true"],a')) return;
    const id = boxEl.dataset.boxId, b = boxById(id); if (!b) return;
    e.preventDefault();
    const ids = [...descendants(activeSpace(), id)];
    activeDrag = { id, ids, startX: e.clientX, startY: e.clientY, originals: new Map(ids.map(cid => { const x = boxById(cid); return [cid, {x:x.x,y:x.y}]; })), moved:false };
    boxEl.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (activeDrag) {
      const dx = e.clientX - activeDrag.startX, dy = e.clientY - activeDrag.startY;
      if (Math.abs(dx)+Math.abs(dy) > 2) activeDrag.moved = true;
      if (!dragRAF) dragRAF = requestAnimationFrame(() => {
        dragRAF = 0; const space = activeSpace();
        activeDrag.ids.forEach(id => { const b=space.boxes.find(x=>x.id===id), o=activeDrag.originals.get(id); if (b && o) { b.x=Math.max(0,o.x+dx); b.y=Math.max(0,o.y+dy); const el=dom.layer.querySelector(`[data-box-id="${CSS.escape(id)}"]`); if(el){el.style.left=`${b.x}px`;el.style.top=`${b.y}px`;} } });
        renderConnections();
      });
    }
    if (activeResize) {
      const dx=e.clientX-activeResize.startX, dy=e.clientY-activeResize.startY, b=boxById(activeResize.id); if(!b)return;
      b.width=clamp(activeResize.w+dx,230,900); b.height=clamp(activeResize.h+dy,150,700);
      const el=dom.layer.querySelector(`[data-box-id="${CSS.escape(b.id)}"]`); if(el){el.style.width=`${b.width}px`;el.style.height=`${b.height}px`;}
      renderConnections(); renderChartForBox(b.id);
    }
  }
  function endPointer(e) {
    if (activeDrag) { persistDebounced(); activeDrag = null; }
    if (activeResize) { persistDebounced(); activeResize = null; }
  }
  function startResize(e, boxEl) {
    const b=boxById(boxEl.dataset.boxId); if(!b)return; e.preventDefault(); e.stopPropagation(); activeResize={id:b.id,startX:e.clientX,startY:e.clientY,w:b.width,h:b.height}; boxEl.setPointerCapture?.(e.pointerId);
  }

  function renderChartForBox(id) {
    const b=boxById(id); if(!b || b.type!=='chart') return;
    const el=dom.layer.querySelector(`[data-box-id="${CSS.escape(id)}"]`); if(!el)return;
    const wrap=$('[data-chart-wrap]',el); if(!wrap)return;
    const w=Math.max(260,wrap.clientWidth), h=Math.max(130,wrap.clientHeight);
    wrap.innerHTML=makeChartSVG(b.chart,w,h,id);
    const legend=$('[data-chart-legend]',el); legend.innerHTML=b.chart.kind==='pie' ? b.chart.labels.map((l,i)=>`<span class="legend-item"><i class="legend-dot" style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></i>${escapeHTML(l)}</span>`).join('') : b.chart.labels.slice(0,10).map((l,i)=>`<span class="legend-item"><i class="legend-dot" style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></i>${escapeHTML(l)}</span>`).join('');
  }

  function renderAllCharts() { activeSpace().boxes.filter(b=>b.type==='chart').forEach(b=>renderChartForBox(b.id)); }

  function makeChartSVG(c,w,h,id) {
    const labels=c.labels.length?c.labels:['A','B','C'], vals=c.values.length?c.values:[0,0,0];
    if(c.kind==='pie') return pieSVG(labels,vals,w,h,id);
    if(c.kind==='line') return lineSVG(labels,vals,w,h,id);
    return barSVG(labels,vals,w,h,id);
  }
  function svgText(x,y,text,size=10,anchor='middle'){ return `<text x="${x}" y="${y}" fill="${getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()}" font-size="${size}" text-anchor="${anchor}" font-family="Inter, sans-serif">${escapeHTML(text)}</text>`; }
  function chartBase(w,h){ const m={l:34,r:12,t:12,b:28}; return {m, iw:w-m.l-m.r, ih:h-m.t-m.b}; }
  function gridSVG(x,y,w,h,max){ let s=''; for(let i=0;i<5;i++){const yy=y+h-(i/4)*h;s+=`<line x1="${x}" y1="${yy}" x2="${x+w}" y2="${yy}" stroke="${getComputedStyle(document.documentElement).getPropertyValue('--border').trim()}" stroke-dasharray="5 7"/>`; if(i===0||i===4)s+=svgText(x-8,yy+3,String(Math.round(max*i/4)),9,'end');} return s; }
  function barSVG(labels,vals,w,h,id){ const {m,iw,ih}=chartBase(w,h), max=Math.max(1,...vals), bw=iw/labels.length*.58; let s=`<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Bar chart">${gridSVG(m.l,m.t,iw,ih,max)}`; labels.forEach((l,i)=>{const x=m.l+i*(iw/labels.length)+(iw/labels.length-bw)/2, bh=vals[i]/max*ih,y=m.t+ih-bh,c=CHART_COLORS[i%CHART_COLORS.length];s+=`<rect class="chart-hit" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${c}" data-tip="${escapeHTML(l)}: ${vals[i]}"></rect>`;s+=svgText(x+bw/2,m.t+ih+17,l.slice(0,12),9);}); return s+'</svg>'; }
  function lineSVG(labels,vals,w,h,id){ const {m,iw,ih}=chartBase(w,h), max=Math.max(1,...vals), min=Math.min(0,...vals), range=Math.max(1,max-min); let s=`<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Line chart">${gridSVG(m.l,m.t,iw,ih,max)}`; const pts=vals.map((v,i)=>[m.l+(labels.length===1?iw/2:i*(iw/(labels.length-1))),m.t+ih-(v-min)/range*ih]); const d=pts.map((p,i)=>(i?'L':'M')+` ${p[0]} ${p[1]}`).join(' '); s+=`<path d="${d}" fill="none" stroke="${CHART_COLORS[0]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`; pts.forEach((p,i)=>{s+=`<circle class="chart-hit" cx="${p[0]}" cy="${p[1]}" r="5" fill="${CHART_COLORS[i%CHART_COLORS.length]}" data-tip="${escapeHTML(labels[i])}: ${vals[i]}"></circle>`;s+=svgText(p[0],m.t+ih+17,labels[i].slice(0,12),9);}); return s+'</svg>'; }
  function pieSVG(labels,vals,w,h,id){ const total=vals.reduce((a,b)=>a+b,0)||1,cx=w/2,cy=h/2,r=Math.min(w,h)*.32;let angle=-Math.PI/2,s=`<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pie chart">`;vals.forEach((v,i)=>{const a=v/total*Math.PI*2,a2=angle+a, x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2),large=a>Math.PI?1:0;const d=`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;s+=`<path class="chart-hit" d="${d}" fill="${CHART_COLORS[i%CHART_COLORS.length]}" stroke="${getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()}" stroke-width="2" data-tip="${escapeHTML(labels[i])}: ${v}"></path>`;angle=a2;});return s+'</svg>'; }

  function openModal({title,body,footer='',small=false,onMount}) {
    closeModal();
    dom.modal.hidden=false; dom.modal.innerHTML=`<div class="modal ${small?'small':''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-header"><h2 id="modalTitle">${escapeHTML(title)}</h2><button class="modal-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}</div>`;
    const first=$('input,textarea,select,button',dom.modal); setTimeout(()=>first?.focus(),0);
    modalCleanup=onMount?.() || null;
  }
  function closeModal() { if (modalCleanup) { try{modalCleanup();}catch{} modalCleanup=null; } dom.modal.hidden=true; dom.modal.innerHTML=''; }
  function modalKey(e) { if(!dom.modal.hidden && e.key==='Escape'){ e.preventDefault(); closeModal(); } }

  function openSpaceModal(mode,id='') {
    const existing=state.spaces.find(s=>s.id===id); const isRename=mode==='rename';
    openModal({title:isRename?'Rename Space':'Create Space',body:`<div class="field"><label for="spaceName">Space name</label><input id="spaceName" maxlength="100" value="${escapeHTML(existing?.name||'New Space')}" autofocus></div>`,footer:`<button class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn" data-action="save-space">${isRename?'Save changes':'Create space'}</button>`});
    dom.modal.dataset.spaceMode=mode; dom.modal.dataset.spaceId=id;
  }
  function saveSpace() { const name=cleanName($('#spaceName',dom.modal)?.value,'Untitled Space'), mode=dom.modal.dataset.spaceMode,id=dom.modal.dataset.spaceId; if(mode==='rename'){const s=state.spaces.find(x=>x.id===id);if(s)s.name=name;}else{const s={id:uid(),name,boxes:[]};state.spaces.push(s);state.activeSpaceId=s.id;}persistDebounced();closeModal();renderAll(); }
  function openSpaceMenu(id) {
    const s=state.spaces.find(x=>x.id===id); if(!s)return;
    openModal({title:s.name,small:true,body:`<div class="import-choice"><button class="ghost-btn" data-action="rename-space"><i class="fa-solid fa-pen"></i> Rename space</button><button class="danger-btn" data-action="delete-space"><i class="fa-solid fa-trash"></i> Delete space</button></div>`}); dom.modal.dataset.spaceId=id;
  }
  function confirmDeleteSpace(id) {
    const s=state.spaces.find(x=>x.id===id); if(!s)return;
    openModal({title:'Delete space',small:true,body:`<p class="modal-note">This removes “${escapeHTML(s.name)}” and all of its boxes. To continue, type the exact space name.</p><div class="field"><label for="deleteName">Space name</label><input id="deleteName" autocomplete="off"></div>`,footer:`<button class="ghost-btn" data-action="close-modal">Cancel</button><button class="danger-btn" data-action="confirm-delete-space">Delete space</button>`}); dom.modal.dataset.spaceId=id;
  }
  function doDeleteSpace() { const id=dom.modal.dataset.spaceId,s=state.spaces.find(x=>x.id===id); if(!s)return; if($('#deleteName',dom.modal).value.trim()!==s.name){showToast('The name does not match.','error');return;} if(state.spaces.length===1){showToast('Keep at least one space.','error');return;} state.spaces=state.spaces.filter(x=>x.id!==id);if(state.activeSpaceId===id)state.activeSpaceId=state.spaces[0].id;persistDebounced();closeModal();renderAll();showToast('Space deleted'); }

  function openLinkModal(id='') {
    const b=boxById(id); if(!b)return;
    openModal({title:'Link Box',body:`<div class="field"><label for="linkTitle">Title</label><input id="linkTitle" maxlength="100" value="${escapeHTML(b.title)}"></div><div class="field"><label for="linkUrl">URL</label><input id="linkUrl" type="url" placeholder="https://example.com" value="${escapeHTML(b.url)}"></div><p class="modal-note">Only HTTP and HTTPS links are allowed.</p>`,footer:`<button class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn" data-action="save-link">Save link</button>`}); dom.modal.dataset.boxId=id;
  }
  function saveLink() { const b=boxById(dom.modal.dataset.boxId);if(!b)return;const url=$('#linkUrl',dom.modal).value.trim();if(!validURL(url)){showToast('Enter a valid HTTP or HTTPS URL.','error');return;}b.title=cleanName($('#linkTitle',dom.modal).value,'Link');b.url=url;persistDebounced();closeModal();renderAll(); }

  function openParentModal(id) {
    const space=activeSpace(), b=space.boxes.find(x=>x.id===id); if(!b)return; const blocked=descendants(space,id);
    const opts=[`<option value="">No parent</option>`].concat(space.boxes.filter(x=>!blocked.has(x.id)).map(x=>`<option value="${escapeHTML(x.id)}" ${b.parentId===x.id?'selected':''}>${escapeHTML(x.title)} · ${typeLabel(x.type)}</option>`)).join('');
    openModal({title:'Choose parent',small:true,body:`<div class="field"><label for="parentChoice">Parent for ${escapeHTML(b.title)}</label><select id="parentChoice">${opts}</select></div><p class="modal-note">This box and all of its descendants are excluded to prevent circular structures.</p>`,footer:`<button class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn" data-action="save-parent">Apply</button>`});dom.modal.dataset.boxId=id;
  }
  function saveParent(){const id=dom.modal.dataset.boxId;setParent(id,$('#parentChoice',dom.modal).value);closeModal();}

  function openChartModal(id='') {
    const b=boxById(id); if(!b)return;
    chartDraft=JSON.parse(JSON.stringify(b.chart||normalizeChart({}))); chartDraft.title=b.title; chartDraft.labels=chartDraft.labels.length?chartDraft.labels:['A','B','C']; chartDraft.values=chartDraft.values.length?chartDraft.values:[25,40,30];
    chartStep1(id);
  }
  function chartStep1(id){
    const b=boxById(id); if(!b)return;
    openModal({title:'Chart Editor · 1 of 3',body:`<div class="stepper"><i class="step active"></i><i class="step"></i><i class="step"></i></div><div class="field"><label for="chartTitle">Title</label><input id="chartTitle" maxlength="100" value="${escapeHTML(chartDraft.title||b.title)}"></div><div class="field"><label for="chartDesc">Description</label><textarea id="chartDesc" maxlength="300">${escapeHTML(chartDraft.description||'')}</textarea></div>`,footer:`<button class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn" data-action="chart-next-1">Next</button>`});dom.modal.dataset.boxId=id;
  }
  function chartStep2(){const id=dom.modal.dataset.boxId;chartDraft.kind=chartDraft.kind||'bar';openModal({title:'Chart Editor · 2 of 3',body:`<div class="stepper"><i class="step active"></i><i class="step active"></i><i class="step"></i></div><div class="field"><label>Chart type</label><div class="chart-kind-grid">${[['bar','fa-chart-column','Bar'],['line','fa-chart-line','Line'],['pie','fa-chart-pie','Pie']].map(([k,i,l])=>`<button class="chart-kind ${chartDraft.kind===k?'selected':''}" data-chart-kind="${k}"><i class="fa-solid ${i}"></i>${l}</button>`).join('')}</div></div>`,footer:`<button class="ghost-btn" data-action="chart-back-1">Back</button><button class="primary-btn" data-action="chart-next-2">Next</button>`});dom.modal.dataset.boxId=id; }
  function chartStep3(){const id=dom.modal.dataset.boxId;const rows=chartDraft.labels.map((l,i)=>`<div class="data-row"><input data-chart-label value="${escapeHTML(l)}" placeholder="Label"><input data-chart-value type="number" min="0" step="any" value="${Number(chartDraft.values[i]||0)}" placeholder="Value"><button class="icon-btn" data-action="remove-data-row" aria-label="Remove row"><i class="fa-solid fa-xmark"></i></button></div>`).join('');openModal({title:'Chart Editor · 3 of 3',body:`<div class="stepper"><i class="step active"></i><i class="step active"></i><i class="step active"></i></div><div id="dataRows">${rows}</div><button class="ghost-btn" data-action="add-data-row"><i class="fa-solid fa-plus"></i> Add data</button><div class="field" style="margin-top:16px"><label>Preview</label><div style="height:180px;border:1px solid var(--border);border-radius:10px;padding:7px;background:var(--surface-2)" id="chartPreview"></div></div>`,footer:`<button class="ghost-btn" data-action="chart-back-2">Back</button><button class="primary-btn" data-action="finish-chart">Create chart</button>`});dom.modal.dataset.boxId=id;updateChartPreview();}
  function updateChartDraftFromRows(){chartDraft.labels=$$('[data-chart-label]',dom.modal).map(x=>x.value.trim()||'Item');chartDraft.values=$$('[data-chart-value]',dom.modal).map(x=>Math.max(0,Number(x.value)||0));}
  function updateChartPreview(){const wrap=$('#chartPreview',dom.modal);if(!wrap)return;updateChartDraftFromRows();wrap.innerHTML=makeChartSVG(chartDraft,wrap.clientWidth||500,160,'preview');}
  function finishChart(){updateChartDraftFromRows();const id=dom.modal.dataset.boxId,b=boxById(id);if(!b)return;b.title=cleanName(chartDraft.title,b.title);b.chart=normalizeChart(chartDraft);persistDebounced();closeModal();renderAll();showToast('Chart saved');}

  function sanitizeRichText(html) {
    const template=document.createElement('template'); template.innerHTML=String(html||'');
    const walk=node=>{
      [...node.childNodes].forEach(child=>{
        if(child.nodeType===Node.ELEMENT_NODE){
          const tag=child.tagName;
          if(!ALLOWED_RICH.has(tag)){ child.replaceWith(...[...child.childNodes].map(n=>n.cloneNode(true))); return; }
          [...child.attributes].forEach(attr=>{
            if(tag==='A' && attr.name==='href' && validURL(attr.value)){ child.setAttribute('href',new URL(attr.value).href); child.setAttribute('target','_blank'); child.setAttribute('rel','noopener noreferrer'); }
            else child.removeAttribute(attr.name);
          });
        }
        walk(child);
      });
    }; walk(template.content); return template.innerHTML.slice(0,20000);
  }

  function handleRichCommand(btn) {
    const editor=btn.closest('.text-box')?.querySelector('.rich-editor');if(!editor)return;editor.focus();const cmd=btn.dataset.rich,val=btn.dataset.value;
    if(cmd==='createLink'){openRichLinkModal(editor, btn.closest('.box').dataset.boxId);return;}
    else document.execCommand(cmd,false,val||null);
    const b=boxById(btn.closest('.box').dataset.boxId);if(b){b.content=sanitizeRichText(editor.innerHTML);persistDebounced();}
  }
  function openRichLinkModal(editor, boxId){
    openModal({title:'Add rich-text link',small:true,body:`<div class="field"><label for="richLinkUrl">URL</label><input id="richLinkUrl" type="url" placeholder="https://example.com"></div><p class="modal-note">Only HTTP and HTTPS links are allowed.</p>`,footer:`<button class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn" data-action="save-rich-link">Insert link</button>`});dom.modal.dataset.richBoxId=boxId;dom.modal._richEditor=editor;
  }


  function saveRichLink(){const url=$('#richLinkUrl',dom.modal)?.value.trim();if(!validURL(url)){showToast('Enter a valid HTTP or HTTPS URL.','error');return;}const editor=dom.modal._richEditor;const box=boxById(dom.modal.dataset.richBoxId);if(!editor||!box)return;editor.focus();document.execCommand('createLink',false,url);box.content=sanitizeRichText(editor.innerHTML);persistDebounced();closeModal();}

  function showToast(message,type='ok'){const el=document.createElement('div');el.className='toast';el.innerHTML=`<i class="fa-solid ${type==='error'?'fa-circle-exclamation':'fa-check'}"></i><span>${escapeHTML(message)}</span>`;dom.toast.appendChild(el);setTimeout(()=>el.remove(),2600);}

  function searchNow(){const q=dom.search.value.trim().toLowerCase();$$('.box',dom.layer).forEach(el=>{const b=boxById(el.dataset.boxId);const hit=!q||[b.title,b.content,b.url,b.tasks.map(t=>t.text).join(' ')].join(' ').toLowerCase().includes(q);el.classList.toggle('search-match',!!q&&hit);});}
  function focusSearch(){dom.search.focus();dom.search.select();}

  function exportJSON(){persistNow();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`plan-space-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showToast('Workspace exported');}
  function openImportModal(payload){importPayload=payload;const count=payload.spaces.reduce((n,s)=>n+s.boxes.length,0);openModal({title:'Import workspace',small:true,body:`<p class="modal-note">Validated JSON contains <strong>${payload.spaces.length}</strong> space${payload.spaces.length===1?'':'s'} and <strong>${count}</strong> boxes. Choose how to import it.</p><div class="import-choice"><button class="ghost-btn" data-action="import-add"><i class="fa-solid fa-layer-group"></i><span><strong>Add</strong><br><small>Keep current spaces and add imported spaces.</small></span></button><button class="ghost-btn" data-action="import-replace"><i class="fa-solid fa-arrow-rotate-right"></i><span><strong>Replace</strong><br><small>Replace the current workspace with the imported state.</small></span></button></div>`,footer:`<button class="ghost-btn" data-action="close-modal">Cancel</button>`});}
  function remapImport(payload){const used=new Set(state.spaces.flatMap(s=>[s.id,...s.boxes.map(b=>b.id)]));const spaceMap=new Map(),boxMap=new Map();const clone=JSON.parse(JSON.stringify(payload));clone.spaces.forEach(s=>{const old=s.id,newId=used.has(old)?uid():old;spaceMap.set(old,newId);used.add(newId);s.id=newId;s.boxes.forEach(b=>{const bo=b.id,bn=used.has(bo)?uid():bo;boxMap.set(bo,bn);used.add(bn);b.id=bn;});});clone.spaces.forEach(s=>s.boxes.forEach(b=>{b.parentId=b.parentId?(boxMap.get(b.parentId)||null):null;}));return clone;}
  function importAdd(){const p=remapImport(importPayload);state.spaces.push(...p.spaces);persistDebounced();closeModal();renderAll();showToast('Import added');}
  function importReplace(){const p=normalizeState(importPayload);state=p;persistDebounced();closeModal();renderAll();showToast('Workspace replaced');}

  function validateImport(raw){if(!raw||typeof raw!=='object'||!Array.isArray(raw.spaces)||raw.spaces.length>100)throw new Error('Invalid Plan Space JSON.');return normalizeState(raw);}

  async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{showToast('Fullscreen is not available here.','error');}updateFullscreenButton();}
  function updateFullscreenButton(){$$('[data-action="fullscreen"]').forEach(b=>b.innerHTML=document.fullscreenElement?'<i class="fa-solid fa-compress"></i>':'<i class="fa-solid fa-expand"></i>');}
  function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;persistDebounced();updateThemeButtons();renderConnections();showToast(`${state.theme==='dark'?'Dark':'Light'} theme enabled`);}

  function moreMenu(){document.querySelector('.more-menu')?.remove();const el=document.createElement('div');el.className='more-menu';el.innerHTML=`<button data-action="import"><i class="fa-solid fa-file-arrow-up"></i> Import</button><button data-action="export"><i class="fa-solid fa-file-arrow-down"></i> Export</button><button data-action="fullscreen"><i class="fa-solid fa-expand"></i> Fullscreen</button><button data-action="new-space"><i class="fa-solid fa-plus"></i> New space</button>`;document.body.appendChild(el);setTimeout(()=>document.addEventListener('pointerdown',function close(e){if(!el.contains(e.target)){el.remove();document.removeEventListener('pointerdown',close);}}, {once:true}),0);}

  function handleClick(e){
    const actionEl=e.target.closest('[data-action]');
    if(actionEl){const action=actionEl.dataset.action;
      if(action==='new-space')openSpaceModal('create');
      else if(action==='space-menu')openSpaceMenu(actionEl.dataset.spaceId);
      else if(action==='save-space')saveSpace();
      else if(action==='close-modal')closeModal();
      else if(action==='rename-space'){const id=dom.modal.dataset.spaceId;openSpaceModal('rename',id);}
      else if(action==='delete-space')confirmDeleteSpace(dom.modal.dataset.spaceId);
      else if(action==='confirm-delete-space')doDeleteSpace();
      else if(action==='add-box')openAddBoxModal();
      else if(action==='delete-box')deleteBox(actionEl.closest('.box').dataset.boxId);
      else if(action==='parent-box')openParentModal(actionEl.closest('.box').dataset.boxId);
      else if(action==='edit-box')openLinkModal(actionEl.closest('.box').dataset.boxId);
      else if(action==='edit-chart')openChartModal(actionEl.closest('.box').dataset.boxId);
      else if(action==='add-task')addTask(actionEl.closest('.box').dataset.boxId);
      else if(action==='toggle-task')toggleTask(actionEl);
      else if(action==='delete-task')deleteTask(actionEl);
      else if(action==='theme')toggleTheme();
      else if(action==='export')exportJSON();
      else if(action==='import')dom.file.click();
      else if(action==='fullscreen')toggleFullscreen();
      else if(action==='search-focus')focusSearch();
      else if(action==='more')moreMenu();
      else if(action==='save-link')saveLink();
      else if(action==='save-rich-link')saveRichLink();
      else if(action==='save-parent')saveParent();
      else if(action==='chart-next-1')chartNext1();
      else if(action==='chart-back-1')chartStep1(dom.modal.dataset.boxId);
      else if(action==='chart-next-2')chartNext2();
      else if(action==='chart-back-2')chartStep2();
      else if(action==='add-data-row'){chartDraft.labels.push(`Item ${chartDraft.labels.length+1}`);chartDraft.values.push(0);chartStep3();}
      else if(action==='remove-data-row'){const row=actionEl.closest('.data-row'),rows=$$('[data-chart-label]',dom.modal),i=rows.indexOf($('[data-chart-label]',row));chartDraft.labels.splice(i,1);chartDraft.values.splice(i,1);if(!chartDraft.labels.length){chartDraft.labels=['A'];chartDraft.values=[0];}chartStep3();}
      else if(action==='finish-chart')finishChart();
      else if(action==='import-add')importAdd();
      else if(action==='import-replace')importReplace();
      return;
    }
    const tab=e.target.closest('.space-tab');if(tab&&!e.target.closest('.tab-menu')){state.activeSpaceId=tab.dataset.spaceId;persistDebounced();renderAll();}
    const rich=e.target.closest('[data-rich]');if(rich){e.preventDefault();handleRichCommand(rich);}
    const kind=e.target.closest('[data-chart-kind]');if(kind){chartDraft.kind=kind.dataset.chartKind;chartStep2();}
  }

  function openAddBoxModal(){openModal({title:'Add box',small:true,body:`<div class="import-choice"><button class="ghost-btn" data-add-type="text"><i class="fa-solid fa-align-left"></i><span><strong>Text</strong><br><small>Rich text for notes, briefs and ideas.</small></span></button><button class="ghost-btn" data-add-type="folder"><i class="fa-solid fa-folder"></i><span><strong>Parent / Folder</strong><br><small>Organize a group of related boxes.</small></span></button><button class="ghost-btn" data-add-type="task"><i class="fa-solid fa-list-check"></i><span><strong>Task</strong><br><small>Track work with progress.</small></span></button><button class="ghost-btn" data-add-type="link"><i class="fa-solid fa-link"></i><span><strong>Link</strong><br><small>Save an external HTTP/HTTPS link.</small></span></button><button class="ghost-btn" data-add-type="chart"><i class="fa-solid fa-chart-simple"></i><span><strong>Chart</strong><br><small>Build a Bar, Line or Pie chart.</small></span></button></div>`});}

  function addTask(id){const b=boxById(id),el=dom.layer.querySelector(`[data-box-id="${CSS.escape(id)}"]`);if(!b||!el)return;const input=$('[data-task-input]',el),text=input.value.trim();if(!text)return;b.tasks.push({id:uid(),text:text.slice(0,500),done:false});input.value='';persistDebounced();renderBoxInPlace(id);}
  function toggleTask(el){const item=el.closest('.task-item'),b=boxById(el.closest('.box').dataset.boxId),t=b?.tasks.find(x=>x.id===item.dataset.taskId);if(t){t.done=el.checked;persistDebounced();renderBoxInPlace(b.id);}}
  function deleteTask(el){const b=boxById(el.closest('.box').dataset.boxId),id=el.closest('.task-item').dataset.taskId;if(b){b.tasks=b.tasks.filter(t=>t.id!==id);persistDebounced();renderBoxInPlace(b.id);}}
  function renderBoxInPlace(id){const b=boxById(id),el=dom.layer.querySelector(`[data-box-id="${CSS.escape(id)}"]`);if(!b||!el)return;const top=el.querySelector('.box-header').outerHTML;const body=el.querySelector('.box-body');body.innerHTML=b.type==='task'?taskBody(b):b.type==='folder'?folderBody(b):b.type==='link'?linkBody(b):b.type==='chart'?chartBody(b):textBody(b);if(b.type==='chart')renderChartForBox(id);el.style.left=`${b.x}px`;el.style.top=`${b.y}px`;el.style.width=`${b.width}px`;el.style.height=`${b.height}px`;}

  function chartNext1(){const id=dom.modal.dataset.boxId;chartDraft.title=cleanName($('#chartTitle',dom.modal).value,'Chart');chartDraft.description=$('#chartDesc',dom.modal).value.trim();chartStep2();dom.modal.dataset.boxId=id;}
  function chartNext2(){const id=dom.modal.dataset.boxId;chartStep3();dom.modal.dataset.boxId=id;}

  dom.layer.addEventListener('pointerdown',e=>{const box=e.target.closest('.box');if(!box)return;if(e.target.closest('[data-resize-handle]'))startResize(e,box);else startDrag(e,box);});
  document.addEventListener('pointermove',onPointerMove,{passive:false});
  document.addEventListener('pointerup',endPointer,{passive:true});
  document.addEventListener('pointercancel',endPointer,{passive:true});
  document.addEventListener('click',handleClick);
  document.addEventListener('keydown',e=>{modalKey(e);if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();focusSearch();}});
  dom.search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchNow,60);});
  dom.modal.addEventListener('click',e=>{if(e.target===dom.modal)closeModal();});
  dom.file.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const text=await file.text();const payload=validateImport(JSON.parse(text));openImportModal(payload);}catch(err){showToast(err?.message||'Invalid JSON import.','error');}finally{dom.file.value='';}});
  document.addEventListener('fullscreenchange',updateFullscreenButton);
  window.addEventListener('resize',()=>{requestAnimationFrame(renderConnections);requestAnimationFrame(renderAllCharts);});

  // Delegated handling for Add Box choices.
  document.addEventListener('click',e=>{const typeBtn=e.target.closest('[data-add-type]');if(typeBtn){const type=typeBtn.dataset.addType;closeModal();addBox(type);}});
  // Keep rich text, title, folder and task edits lightweight and debounced.
  dom.layer.addEventListener('input',e=>{
    const box=e.target.closest('.box');if(!box)return;const b=boxById(box.dataset.boxId);if(!b)return;
    if(e.target.matches('[data-field="title"]')){b.title=e.target.value.slice(0,100);$('.box-title',box).textContent=b.title;persistDebounced();}
    if(e.target.matches('[data-field="content"]')){b.content=sanitizeRichText(e.target.innerHTML);persistDebounced();}
    if(e.target.matches('[data-task-edit]')){const t=b.tasks.find(x=>x.id===e.target.closest('.task-item').dataset.taskId);if(t){t.text=e.target.innerText.trim().slice(0,500);persistDebounced();}}
  });
  dom.layer.addEventListener('change',e=>{const box=e.target.closest('.box');if(!box)return;if(e.target.matches('[data-field="parentId"]'))setParent(box.dataset.boxId,e.target.value);});
  dom.layer.addEventListener('pointerover',e=>{const hit=e.target.closest('.chart-hit');if(!hit)return;const tip=hit.dataset.tip;if(!tip)return;let t=$('.chart-tooltip');if(!t){t=document.createElement('div');t.className='chart-tooltip';document.body.appendChild(t);}t.textContent=tip;t.style.display='block';t.style.left=(e.clientX+12)+'px';t.style.top=(e.clientY+12)+'px';});
  dom.layer.addEventListener('pointermove',e=>{const t=$('.chart-tooltip');if(t&&e.target.closest('.chart-hit')){t.style.left=(e.clientX+12)+'px';t.style.top=(e.clientY+12)+'px';}});
  dom.layer.addEventListener('pointerout',e=>{if(!e.relatedTarget?.closest?.('.chart-hit'))$('.chart-tooltip')?.remove();});

  // Restore the active space without jumping to an arbitrary scroll position.
  renderAll();
  requestAnimationFrame(renderAllCharts);
})();
