(function () {
  "use strict";

  /* ───────────────────────────────────────────
     404 bootstrap
  ─────────────────────────────────────────── */
  if (document.body.classList.contains("page-404")) {
    var p = document.getElementById("term-path");
    if (p) p.textContent = location.pathname || "/unknown";
    var gh = document.getElementById("go-home");
    var gb = document.getElementById("go-back");
    if (gh) gh.addEventListener("click", function () { location.href = "index.html"; });
    if (gb) gb.addEventListener("click", function () { history.length > 1 ? history.back() : (location.href = "index.html"); });
    return;
  }

  /* ───────────────────────────────────────────
     Constants
  ─────────────────────────────────────────── */
  var KEY = "planspace_v3";
  var PASTELS = ["#F4B8C4","#F6C6A8","#F3DFA2","#B8D8C0","#B9DDD5","#C9B8E8","#D5C7EA","#E8AFAF","#C5D6B7","#BFD7EA"];
  var TYPES = { text:"متن", folder:"پوشه", task:"تسک", link:"لینک", image:"عکس", embed:"امبد", timer:"تایمر", chart:"نمودار" };
  var MIN_W = 220, MIN_H = 140, MAX_W = 800, MAX_H = 700;
  var SAFE_TAGS = new Set(["B","I","U","S","STRONG","EM","H2","H3","P","BR","UL","OL","LI","BLOCKQUOTE","A","DIV","SPAN"]);

  /* ───────────────────────────────────────────
     DOM
  ─────────────────────────────────────────── */
  function $i(id) { return document.getElementById(id); }
  var D = {
    tabs:    $i("space-tabs"),
    boxes:   $i("boxes-layer"),
    conn:    $i("connections"),
    empty:   $i("empty-state"),
    modal:   $i("modal-root"),
    toast:   $i("toast-root"),
    search:  $i("search-input"),
    scroll:  $i("canvas-scroll"),
    file:    $i("import-file"),
    imgFile: $i("img-file"),
    themeB:  $i("btn-theme"),
    fsB:     $i("btn-fullscreen"),
  };

  /* ───────────────────────────────────────────
     Util
  ─────────────────────────────────────────── */
  function uid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch(_) {}
    return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  }
  function esc(s) {
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u||"")); }
  function clk(id, fn) { var e=$i(id); if(e) e.addEventListener("click",fn); }

  /* ───────────────────────────────────────────
     State / Storage
  ─────────────────────────────────────────── */
  var state;
  var saveTimer = 0;
  var pendingImport = null;

  function mkState() {
    var id = uid();
    return { version:3, theme:"dark", spaces:[{id:id, name:"اسپیس من", boxes:[]}], activeSpaceId:id };
  }

  function normBox(b) {
    if (!b || typeof b !== "object") b = {};
    var t = Object.keys(TYPES).includes(b.type) ? b.type : "text";
    var ch = (b.chart && typeof b.chart==="object") ? b.chart : {};
    return {
      id:       (typeof b.id==="string" && b.id) ? b.id : uid(),
      type:     t,
      title:    String(b.title || TYPES[t]),
      content:  String(b.content || ""),
      url:      String(b.url || ""),
      imageData:String(b.imageData || ""),
      embedUrl: String(b.embedUrl || ""),
      tasks: Array.isArray(b.tasks) ? b.tasks.map(function(t){ return {
        id: (typeof t.id==="string"&&t.id)?t.id:uid(),
        text: String(t.text||""), done:!!t.done
      }; }) : [],
      chart: {
        kind:   ["bar","line","pie"].includes(ch.kind)?ch.kind:"bar",
        desc:   String(ch.desc||""),
        labels: Array.isArray(ch.labels)?ch.labels.map(String):["الف","ب","ج"],
        values: Array.isArray(ch.values)?ch.values.map(function(n){return Number(n)||0;}):[12,8,16]
      },
      timer: {
        mode:      ["clock","countdown","pomodoro"].includes(b.timer&&b.timer.mode)?b.timer.mode:"clock",
        minutes:   Number((b.timer&&b.timer.minutes)||25),
      },
      parentId: (typeof b.parentId==="string"&&b.parentId)?b.parentId:null,
      x:      Math.max(0,   Number(b.x)||80),
      y:      Math.max(0,   Number(b.y)||80),
      width:  Math.max(MIN_W, Number(b.width)||320),
      height: Math.max(MIN_H, Number(b.height)||220),
      z:      Number(b.z)||1
    };
  }

  function normState(raw) {
    var s = (raw && typeof raw==="object") ? raw : {};
    var out = mkState();
    out.theme = s.theme==="light" ? "light" : "dark";
    if (Array.isArray(s.spaces) && s.spaces.length) {
      out.spaces = s.spaces.map(function(sp,i){
        return {
          id:    (typeof sp.id==="string"&&sp.id)?sp.id:uid(),
          name:  String(sp.name||"اسپیس "+(i+1)),
          boxes: Array.isArray(sp.boxes)?sp.boxes.map(normBox):[]
        };
      });
    }
    out.activeSpaceId = out.spaces.some(function(s){return s.id===raw.activeSpaceId;})?raw.activeSpaceId:out.spaces[0].id;
    return out;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY) || localStorage.getItem("plan_space_v2") || localStorage.getItem("plan_space_state_v1");
      state = raw ? normState(JSON.parse(raw)) : mkState();
    } catch(_) { state = mkState(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch(_) { toast("ذخیره ممکن نیست — حافظه پر است"); }
  }

  function lazySave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }

  /* ───────────────────────────────────────────
     Space helpers
  ─────────────────────────────────────────── */
  function activeSpace() {
    return state.spaces.find(function(s){return s.id===state.activeSpaceId;})||state.spaces[0];
  }
  function nextZ() { return activeSpace().boxes.reduce(function(m,b){return Math.max(m,b.z||1);},0)+1; }
  function mkBox(type, x, y) {
    return normBox({ type:type, x:x, y:y, z:nextZ(),
      height: (type==="chart"||type==="timer"||type==="embed") ? 280 : 220 });
  }

  /* ───────────────────────────────────────────
     Tree
  ─────────────────────────────────────────── */
  function descs(id, boxes) {
    var map=new Map(), out=new Set(), stack=[id];
    boxes.forEach(function(b){ if(!map.has(b.parentId))map.set(b.parentId,[]); map.get(b.parentId).push(b.id); });
    while(stack.length){ var c=stack.pop(); (map.get(c)||[]).forEach(function(cid){ if(!out.has(cid)){out.add(cid);stack.push(cid);} }); }
    return out;
  }
  function wouldCycle(child, parent, boxes) {
    return parent && (child===parent || descs(child,boxes).has(parent));
  }

  /* ───────────────────────────────────────────
     Theme
  ─────────────────────────────────────────── */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    var ic = state.theme==="dark"?"fa-moon":"fa-sun";
    var html = '<i class="fa-solid '+ic+'" aria-hidden="true"></i>';
    [D.themeB, $i("mob-theme")].forEach(function(b){ if(b) b.innerHTML=html; });
  }
  function toggleTheme() { state.theme=state.theme==="dark"?"light":"dark"; save(); applyTheme(); }

  /* ───────────────────────────────────────────
     Toast
  ─────────────────────────────────────────── */
  function toast(msg) {
    var el=document.createElement("div"); el.className="toast"; el.textContent=msg;
    D.toast.appendChild(el); setTimeout(function(){el.remove();},2800);
  }

  /* ───────────────────────────────────────────
     Modal
  ─────────────────────────────────────────── */
  var lastFocus=null;
  function openModal(html, opts) {
    var lock=!!(opts&&opts.lock);
    lastFocus=document.activeElement;
    D.modal.hidden=false;
    D.modal.innerHTML='<div class="modal" role="dialog" aria-modal="true">'+html+'</div>';
    D.modal.dataset.lock=lock?"1":"0";
    var first=D.modal.querySelector("input,button,select,textarea");
    if(first) first.focus();
    D.modal.onclick=function(e){ if(e.target===D.modal&&!lock) closeModal(); };
  }
  function closeModal() {
    D.modal.hidden=true; D.modal.innerHTML="";
    if(lastFocus){ try{lastFocus.focus();}catch(_){} }
  }
  function mbind(id,fn){ var e=$i(id); if(e) e.addEventListener("click",fn); }
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"&&!D.modal.hidden&&D.modal.dataset.lock!=="1") closeModal();
  });

  /* ───────────────────────────────────────────
     Sanitize HTML
  ─────────────────────────────────────────── */
  function sanitize(html) {
    var wrap=document.createElement("div"); wrap.innerHTML=String(html||"");
    (function walk(node){
      Array.from(node.childNodes).forEach(function(ch){
        if(ch.nodeType===8){ch.remove();return;}
        if(ch.nodeType!==1) return;
        var tag=ch.tagName;
        if(!SAFE_TAGS.has(tag)){
          var f=document.createDocumentFragment();
          while(ch.firstChild) f.appendChild(ch.firstChild);
          ch.replaceWith(f); return;
        }
        Array.from(ch.attributes).forEach(function(a){
          var n=a.name.toLowerCase();
          if(n.startsWith("on")||n==="style"||n==="src"||n==="srcdoc") ch.removeAttribute(a.name);
        });
        if(tag==="A"){
          var h=ch.getAttribute("href")||"";
          if(!/^https?:\/\//i.test(h)) ch.removeAttribute("href");
          ch.setAttribute("target","_blank"); ch.setAttribute("rel","noopener noreferrer");
        }
        walk(ch);
      });
    })(wrap);
    return wrap.innerHTML;
  }

  /* ───────────────────────────────────────────
     Render all
  ─────────────────────────────────────────── */
  function renderAll() { applyTheme(); renderTabs(); renderBoxes(); renderConns(); updateEmpty(); }

  function renderTabs() {
    D.tabs.innerHTML="";
    state.spaces.forEach(function(sp){
      var b=document.createElement("button");
      b.type="button"; b.className="space-tab"+(sp.id===state.activeSpaceId?" is-active":"");
      b.textContent=sp.name;
      b.addEventListener("click",function(){ state.activeSpaceId=sp.id; save(); renderAll(); });
      D.tabs.appendChild(b);
    });
  }

  function updateEmpty() { D.empty.hidden=activeSpace().boxes.length>0; }

  /* ───────────────────────────────────────────
     Box markup
  ─────────────────────────────────────────── */
  function renderBoxes() {
    var qStr=(D.search.value||"").trim().toLowerCase();
    D.boxes.innerHTML="";
    activeSpace().boxes.slice().sort(function(a,b){return(a.z||0)-(b.z||0);}).forEach(function(box){
      var el=document.createElement("article");
      el.className="ps-box"; el.dataset.id=box.id;
      el.style.cssText="left:"+box.x+"px;top:"+box.y+"px;width:"+box.width+"px;height:"+box.height+"px;z-index:"+(box.z||1);
      if(qStr&&matchQ(box,qStr)) el.classList.add("is-highlight");
      el.innerHTML=boxHTML(box);
      D.boxes.appendChild(el);
      wireBox(el,box);
    });
  }

  function matchQ(box,q) {
    return [box.title,box.content,box.url,box.embedUrl,
      (box.tasks||[]).map(function(t){return t.text;}).join(" "),
      (box.chart&&box.chart.desc)||""
    ].join(" ").toLowerCase().includes(q);
  }

  function boxHTML(box) {
    var acts=
      '<div class="box-actions">'+
        '<button class="icon-btn act-copy"   title="کپی"><i class="fa-solid fa-copy"></i></button>'+
        '<button class="icon-btn act-parent" title="والد"><i class="fa-solid fa-sitemap"></i></button>'+
        '<button class="icon-btn act-edit"   title="ویرایش"><i class="fa-solid fa-pen"></i></button>'+
        '<button class="icon-btn act-del"    title="حذف"><i class="fa-solid fa-trash"></i></button>'+
      '</div>';
    var head=
      '<div class="box-head" data-drag="1">'+
        '<span class="box-type">'+esc(TYPES[box.type]||box.type)+'</span>'+
        '<input class="box-title" value="'+esc(box.title)+'" aria-label="عنوان" />'+
        acts+
      '</div>';
    var body="";

    if(box.type==="text") {
      body=
        '<div class="rt-toolbar">'+
          rb("bold","B")+rb("italic","I")+rb("underline","U")+rb("strikeThrough","S")+
          rb("h2","H2")+rb("h3","H3")+rb("ul","•")+rb("ol","1.")+
          rb("quote","\u201c")+rb("link",'<i class="fa-solid fa-link"></i>')+
        '</div>'+
        '<div class="box-body"><div class="rt-editor" contenteditable="true" data-placeholder="متن…">'+sanitize(box.content)+'</div></div>';
      return head+body+'<div class="resize-handle"></div>';
    }

    if(box.type==="folder") {
      var kids=activeSpace().boxes.filter(function(b){return b.parentId===box.id;}).length;
      body='<div class="box-body"><p style="color:var(--text-m);font-size:12px">پوشه والد · فرزندان: '+kids+'</p></div>';
    }

    else if(box.type==="task") {
      var done=box.tasks.filter(function(t){return t.done;}).length;
      var tot=box.tasks.length, pct=tot?Math.round(done/tot*100):0;
      body='<div class="box-body">'+
        '<div class="progress-wrap">'+
          '<div class="progress-meta"><span>پیشرفت</span><span>'+done+'/'+tot+'</span></div>'+
          '<div class="progress-bar"><span style="width:'+pct+'%"></span></div>'+
        '</div>'+
        '<div class="task-list">'+box.tasks.map(taskRow).join("")+'</div>'+
        '<button class="btn-ghost btn-sm act-add-task" style="margin-top:8px">+ تسک جدید</button>'+
      '</div>';
    }

    else if(box.type==="link") {
      var su=safeUrl(box.url)?box.url:"";
      body='<div class="box-body"><div class="link-card">'+
        '<a class="link-url" href="'+esc(su)+'" target="_blank" rel="noopener noreferrer">'+esc(su||"لینکی ثبت نشده")+'</a>'+
        '<button class="btn-ghost btn-sm act-edit-link">ویرایش لینک</button>'+
      '</div></div>';
    }

    else if(box.type==="image") {
      body='<div class="box-body" style="padding:0">'+
        '<div class="img-box-wrap">'+
          (box.imageData||box.url
            ? '<img src="'+esc(box.imageData||box.url)+'" alt="'+esc(box.title)+'" />'
            : '<div class="img-placeholder"><i class="fa-solid fa-image"></i><span>عکسی انتخاب نشده</span><button class="btn-ghost btn-sm act-edit-img">انتخاب عکس</button></div>'
          )+
        '</div>'+
      '</div>';
    }

    else if(box.type==="embed") {
      body='<div class="box-body" style="padding:0">'+
        '<div class="iframe-wrap">'+
          (safeUrl(box.embedUrl)
            ? '<iframe src="'+esc(box.embedUrl)+'" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy" title="'+esc(box.title)+'"></iframe>'
            : '<div class="iframe-placeholder"><i class="fa-solid fa-globe"></i><span>آدرسی وارد نشده</span><button class="btn-ghost btn-sm act-edit-embed">وارد کردن URL</button></div>'
          )+
        '</div>'+
      '</div>';
    }

    else if(box.type==="timer") {
      body='<div class="box-body"><div class="timer-wrap" data-timer-id="'+box.id+'">'+
        '<div class="timer-modes">'+
          ['clock','countdown','pomodoro'].map(function(m){
            var labels={clock:"ساعت",countdown:"تایمر",pomodoro:"پومودورو"};
            return '<button class="timer-mode-btn'+(box.timer.mode===m?" is-on":"")+'" data-m="'+m+'">'+labels[m]+'</button>';
          }).join("")+
        '</div>'+
        '<div class="timer-clock">00:00:00</div>'+
        '<div class="timer-label"></div>'+
        '<div class="timer-progress"><div class="timer-progress-bar"><div class="timer-progress-fill" style="width:0%"></div></div></div>'+
        '<div class="timer-btns">'+
          '<button class="timer-play-btn">شروع</button>'+
          '<button class="timer-reset-btn">ریست</button>'+
        '</div>'+
      '</div></div>';
    }

    else if(box.type==="chart") {
      body='<div class="box-body">'+
        '<div class="chart-desc">'+esc(box.chart.desc||"")+'</div>'+
        '<div class="chart-host"></div>'+
        '<button class="btn-ghost btn-sm act-edit-chart" style="margin-top:5px">ویرایش نمودار</button>'+
      '</div>';
    }

    return head+'<div style="display:flex;flex-direction:column;flex:1;min-height:0">'+body+'</div><div class="resize-handle"></div>';
  }

  function rb(cmd,lbl){
    return '<button type="button" data-cmd="'+cmd+'" title="'+cmd+'">'+lbl+'</button>';
  }
  function taskRow(t){
    return '<div class="task-row'+(t.done?" is-done":"")+'" data-tid="'+t.id+'">'+
      '<input type="checkbox"'+(t.done?" checked":"")+'/>'+
      '<input class="task-text" value="'+esc(t.text)+'"/>'+
      '<button class="icon-btn act-del-task" title="حذف"><i class="fa-solid fa-xmark"></i></button>'+
    '</div>';
  }

  /* ───────────────────────────────────────────
     Wire box events
  ─────────────────────────────────────────── */
  function wireBox(el,box) {
    setupDrag(el.querySelector(".box-head"), box, el);
    setupResize(el.querySelector(".resize-handle"), box, el);

    el.querySelector(".box-title").addEventListener("input",function(e){ box.title=e.target.value; lazySave(); });
    el.querySelector(".act-del").addEventListener("click",function(){ confirmDel(box); });
    el.querySelector(".act-parent").addEventListener("click",function(){ openParentPicker(box); });
    el.querySelector(".act-edit").addEventListener("click",function(){ editBox(box); });
    el.querySelector(".act-copy").addEventListener("click",function(){ copyBox(box); });

    if(box.type==="text") {
      var ed=el.querySelector(".rt-editor");
      ed.addEventListener("input",function(){ box.content=sanitize(ed.innerHTML); lazySave(); });
      el.querySelectorAll(".rt-toolbar button").forEach(function(btn){
        btn.addEventListener("mousedown",function(e){e.preventDefault();});
        btn.addEventListener("click",function(){ applyRich(ed,btn.dataset.cmd,box); });
      });
    }

    if(box.type==="task") {
      var addBtn=el.querySelector(".act-add-task");
      if(addBtn) addBtn.addEventListener("click",function(){
        box.tasks.push({id:uid(),text:"تسک جدید",done:false});
        save(); renderBoxes(); renderConns();
      });
      el.querySelectorAll(".task-row").forEach(function(row){
        var tid=row.dataset.tid;
        var cb=row.querySelector("input[type=checkbox]");
        var inp=row.querySelector(".task-text");
        var delBtn=row.querySelector(".act-del-task");
        cb.addEventListener("change",function(){
          var t=box.tasks.find(function(x){return x.id===tid;});
          if(t) t.done=cb.checked; save(); renderBoxes();
        });
        inp.addEventListener("input",function(){
          var t=box.tasks.find(function(x){return x.id===tid;});
          if(t) t.text=inp.value; lazySave();
        });
        delBtn.addEventListener("click",function(){
          box.tasks=box.tasks.filter(function(x){return x.id!==tid;});
          save(); renderBoxes();
        });
      });
    }

    if(box.type==="link") {
      var elb=el.querySelector(".act-edit-link");
      if(elb) elb.addEventListener("click",function(){ openLinkModal(box); });
    }

    if(box.type==="image") {
      var eib=el.querySelector(".act-edit-img");
      if(eib) eib.addEventListener("click",function(){ openImageModal(box); });
      // also clicking the image opens modal
      var img=el.querySelector("img");
      if(img) img.addEventListener("dblclick",function(){ openImageModal(box); });
    }

    if(box.type==="embed") {
      var eeb=el.querySelector(".act-edit-embed");
      if(eeb) eeb.addEventListener("click",function(){ openEmbedModal(box); });
    }

    if(box.type==="timer") {
      initTimerBox(el,box);
    }

    if(box.type==="chart") {
      var ecb=el.querySelector(".act-edit-chart");
      if(ecb) ecb.addEventListener("click",function(){ openChartWizard(box); });
      drawChart(el.querySelector(".chart-host"),box);
    }
  }

  /* ───────────────────────────────────────────
     Edit dispatch
  ─────────────────────────────────────────── */
  function editBox(box) {
    if(box.type==="link")  return openLinkModal(box);
    if(box.type==="image") return openImageModal(box);
    if(box.type==="embed") return openEmbedModal(box);
    if(box.type==="chart") return openChartWizard(box);
    if(box.type==="text") {
      var ed=D.boxes.querySelector('[data-id="'+box.id+'"] .rt-editor');
      if(ed) ed.focus(); return;
    }
    if(box.type==="timer") return; // controlled inside box
    toast("عنوان را از هدر باکس ویرایش کن");
  }

  /* ───────────────────────────────────────────
     Copy box
  ─────────────────────────────────────────── */
  function copyBox(box) {
    var sp=activeSpace();
    var nb=JSON.parse(JSON.stringify(box));
    nb.id=uid();
    nb.x=box.x+box.width+20;
    nb.y=box.y;
    nb.z=nextZ();
    nb.parentId=null; // no parent copy
    sp.boxes.push(nb);
    save(); renderAll();
    toast("باکس کپی شد");
  }

  /* ───────────────────────────────────────────
     Rich text
  ─────────────────────────────────────────── */
  function applyRich(ed,cmd,box) {
    ed.focus();
    if(cmd==="h2")    document.execCommand("formatBlock",false,"H2");
    else if(cmd==="h3")    document.execCommand("formatBlock",false,"H3");
    else if(cmd==="ul")    document.execCommand("insertUnorderedList");
    else if(cmd==="ol")    document.execCommand("insertOrderedList");
    else if(cmd==="quote") document.execCommand("formatBlock",false,"BLOCKQUOTE");
    else if(cmd==="link") {
      openModal(
        '<h3>درج لینک</h3><label>آدرس</label><input id="mu" placeholder="https://" />'+
        '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mo">درج</button></div>'
      );
      mbind("mc",closeModal);
      mbind("mo",function(){
        var u=($i("mu")||{}).value||"";
        if(!safeUrl(u)){toast("فقط https://");return;}
        document.execCommand("createLink",false,u);
        box.content=sanitize(ed.innerHTML); save(); closeModal();
      });
      return;
    } else document.execCommand(cmd);
    box.content=sanitize(ed.innerHTML); lazySave();
  }

  /* ───────────────────────────────────────────
     Drag (pointer events — works on touch too)
  ─────────────────────────────────────────── */
  function setupDrag(handle,box,el) {
    if(!handle) return;
    handle.addEventListener("pointerdown",function(e){
      if(e.target.closest("button,input,select,[contenteditable]")) return;
      e.preventDefault();
      try{handle.setPointerCapture(e.pointerId);}catch(_){}
      el.classList.add("is-dragging");
      box.z=nextZ(); el.style.zIndex=String(box.z);
      var sx=e.clientX, sy=e.clientY;
      var sp=activeSpace();
      var ids=new Set([box.id].concat(Array.from(descs(box.id,sp.boxes))));
      var orig=new Map();
      sp.boxes.forEach(function(b){ if(ids.has(b.id)) orig.set(b.id,{x:b.x,y:b.y}); });
      var raf=0;
      function onMove(ev){
        var dx=ev.clientX-sx, dy=ev.clientY-sy;
        if(raf) cancelAnimationFrame(raf);
        raf=requestAnimationFrame(function(){
          sp.boxes.forEach(function(b){
            if(!ids.has(b.id)) return;
            var o=orig.get(b.id);
            b.x=Math.max(0,o.x+dx); b.y=Math.max(0,o.y+dy);
            var node=D.boxes.querySelector('[data-id="'+b.id+'"]');
            if(node){node.style.left=b.x+"px";node.style.top=b.y+"px";}
          });
          renderConns();
        });
      }
      function onUp(){
        try{handle.releasePointerCapture(e.pointerId);}catch(_){}
        handle.removeEventListener("pointermove",onMove);
        handle.removeEventListener("pointerup",onUp);
        el.classList.remove("is-dragging");
        save();
      }
      handle.addEventListener("pointermove",onMove);
      handle.addEventListener("pointerup",onUp);
    });
  }

  /* ───────────────────────────────────────────
     Resize
  ─────────────────────────────────────────── */
  function setupResize(handle,box,el) {
    if(!handle) return;
    handle.addEventListener("pointerdown",function(e){
      e.preventDefault(); e.stopPropagation();
      try{handle.setPointerCapture(e.pointerId);}catch(_){}
      var sx=e.clientX, sy=e.clientY, sw=box.width, sh=box.height;
      function onMove(ev){
        requestAnimationFrame(function(){
          // handle is bottom-left in RTL, so leftward drag = grow
          box.width  = Math.min(MAX_W,Math.max(MIN_W, sw-(ev.clientX-sx)));
          box.height = Math.min(MAX_H,Math.max(MIN_H, sh+(ev.clientY-sy)));
          el.style.width=box.width+"px"; el.style.height=box.height+"px";
          if(box.type==="chart") drawChart(el.querySelector(".chart-host"),box);
          renderConns();
        });
      }
      function onUp(){
        try{handle.releasePointerCapture(e.pointerId);}catch(_){}
        handle.removeEventListener("pointermove",onMove);
        handle.removeEventListener("pointerup",onUp);
        save();
      }
      handle.addEventListener("pointermove",onMove);
      handle.addEventListener("pointerup",onUp);
    });
  }

  /* ───────────────────────────────────────────
     Connections
  ─────────────────────────────────────────── */
  function renderConns() {
    var boxes=activeSpace().boxes, byId={};
    boxes.forEach(function(b){byId[b.id]=b;});
    D.conn.innerHTML=boxes.filter(function(b){return b.parentId&&byId[b.parentId];}).map(function(b){
      var p=byId[b.parentId];
      var x1=p.x+p.width/2, y1=p.y+p.height;
      var x2=b.x+b.width/2, y2=b.y;
      var mid=(y1+y2)/2;
      return '<path d="M'+x1+' '+y1+' C'+x1+' '+mid+','+x2+' '+mid+','+x2+' '+y2+
             '" fill="none" stroke="#5a5a5a" stroke-width="1.5" stroke-dasharray="4 3"/>';
    }).join("");
  }

  /* ───────────────────────────────────────────
     Timer box logic
  ─────────────────────────────────────────── */
  var timerState={};

  function initTimerBox(el,box){
    var id=box.id;
    var wrap=el.querySelector(".timer-wrap");
    if(!wrap) return;
    var clockEl=wrap.querySelector(".timer-clock");
    var labelEl=wrap.querySelector(".timer-label");
    var fillEl=wrap.querySelector(".timer-progress-fill");
    var playBtn=wrap.querySelector(".timer-play-btn");
    var resetBtn=wrap.querySelector(".timer-reset-btn");
    var modeBtns=wrap.querySelectorAll(".timer-mode-btn");

    if(!timerState[id]) {
      timerState[id]={ running:false, interval:null, elapsed:0, mode:box.timer.mode, totalSecs:box.timer.minutes*60 };
    }
    var ts=timerState[id];

    function tick() {
      var now=Date.now();
      ts.elapsed=Math.floor((now-ts.startAt)/1000)+ts.baseElapsed;
      render();
    }

    function render() {
      var mode=ts.mode;
      if(mode==="clock") {
        var d=new Date();
        clockEl.textContent=pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
        labelEl.textContent="ساعت";
        fillEl.style.width="0%";
        playBtn.style.display="none";
        resetBtn.style.display="none";
      } else if(mode==="countdown"||mode==="pomodoro") {
        var total=ts.totalSecs;
        var remaining=Math.max(0,total-ts.elapsed);
        var h=Math.floor(remaining/3600), m=Math.floor((remaining%3600)/60), s=remaining%60;
        clockEl.textContent=(h?pad(h)+":":"")+pad(m)+":"+pad(s);
        labelEl.textContent=mode==="pomodoro"?"پومودورو":"تایمر";
        fillEl.style.width=(total?Math.min(100,(ts.elapsed/total)*100):0)+"%";
        playBtn.textContent=ts.running?"توقف":"شروع";
        playBtn.classList.toggle("is-active",ts.running);
        playBtn.style.display="";
        resetBtn.style.display="";
        if(remaining===0&&ts.running) { stopTimer(ts); toast("تایمر تموم شد! ⏰"); }
      }
    }

    function startTimer() {
      ts.running=true; ts.startAt=Date.now(); ts.baseElapsed=ts.elapsed;
      ts.interval=setInterval(function(){
        ts.elapsed=Math.floor((Date.now()-ts.startAt)/1000)+ts.baseElapsed;
        render();
      },1000);
      render();
    }
    function stopTimer() { ts.running=false; clearInterval(ts.interval); render(); }
    function resetTimer() {
      stopTimer(ts); ts.elapsed=0;
      ts.totalSecs=box.timer.minutes*60; render();
    }

    if(ts.mode==="clock") {
      if(!ts.clockInterval) ts.clockInterval=setInterval(render,1000);
    }
    render();

    playBtn.addEventListener("click",function(){
      if(ts.mode==="clock") return;
      ts.running?stopTimer():startTimer();
    });
    resetBtn.addEventListener("click",function(){ resetTimer(); });

    modeBtns.forEach(function(btn){
      btn.addEventListener("click",function(){
        var m=btn.dataset.m;
        stopTimer(); ts.mode=m; ts.elapsed=0;
        if(m==="pomodoro") ts.totalSecs=25*60;
        else if(m==="countdown") ts.totalSecs=box.timer.minutes*60;
        box.timer.mode=m; save();
        modeBtns.forEach(function(b){ b.classList.toggle("is-on",b.dataset.m===m); });
        if(m==="clock"){ if(!ts.clockInterval) ts.clockInterval=setInterval(render,1000); }
        else { clearInterval(ts.clockInterval); ts.clockInterval=null; }
        render();
      });
    });
  }

  function pad(n){ return String(n).padStart(2,"0"); }

  /* ───────────────────────────────────────────
     Charts
  ─────────────────────────────────────────── */
  var tipEl=null;
  function showTip(e,text){
    if(!tipEl){tipEl=document.createElement("div");tipEl.className="chart-tooltip";document.body.appendChild(tipEl);}
    tipEl.style.display="block"; tipEl.textContent=text;
    tipEl.style.left=(e.clientX+12)+"px"; tipEl.style.top=(e.clientY+12)+"px";
  }
  function hideTip(){if(tipEl)tipEl.style.display="none";}
  function wTip(el,text){
    el.addEventListener("pointerenter",function(e){showTip(e,text);});
    el.addEventListener("pointerleave",hideTip);
    el.addEventListener("touchstart",function(e){
      e.preventDefault(); var t=e.touches[0];
      showTip({clientX:t.clientX,clientY:t.clientY},text);
    },{passive:false});
    el.addEventListener("touchend",hideTip);
  }

  function drawChart(host,box){
    if(!host) return;
    var ch=box.chart, labels=ch.labels.length?ch.labels:["—"];
    var values=labels.map(function(_,i){return Number(ch.values[i])||0;});
    var w=Math.max(200,(box.width||320)-28), h=Math.max(100,(box.height||280)-90);
    var svg=(ch.kind==="bar")?barSvg(labels,values,w,h):(ch.kind==="line")?lineSvg(labels,values,w,h):pieSvg(labels,values,w,h);
    var legend=labels.map(function(lb,i){
      return '<span><i class="legend-dot" style="background:'+PASTELS[i%PASTELS.length]+'"></i>'+esc(lb)+'</span>';
    }).join("");
    host.innerHTML=svg+'<div class="chart-legend">'+legend+'</div>';
    host.querySelectorAll("[data-tip]").forEach(function(n){ wTip(n,n.getAttribute("data-tip")); });
  }

  function barSvg(labels,values,w,h){
    var mx=Math.max(1,Math.max.apply(null,values)),pad=24,n=labels.length,gap=5;
    var bw=Math.max(5,(w-pad*2-gap*(n-1))/n);
    return '<svg class="chart-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+
      values.map(function(v,i){
        var bh=((h-pad*2)*v)/mx,x=pad+i*(bw+gap),y=h-pad-bh;
        return '<rect data-tip="'+esc(labels[i]+": "+v)+'" x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="3" fill="'+PASTELS[i%PASTELS.length]+'"/>';
      }).join("")+'</svg>';
  }

  function lineSvg(labels,values,w,h){
    var mx=Math.max(1,Math.max.apply(null,values)),pad=24,n=Math.max(1,labels.length-1);
    var pts=values.map(function(v,i){return{x:pad+(i*(w-pad*2))/n,y:h-pad-((h-pad*2)*v)/mx,l:labels[i],v:v};});
    return '<svg class="chart-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+
      '<path d="'+pts.map(function(p,i){return(i?"L":"M")+p.x+" "+p.y;}).join(" ")+'" fill="none" stroke="'+PASTELS[5]+'" stroke-width="2"/>'+
      pts.map(function(p,i){return'<circle data-tip="'+esc(p.l+": "+p.v)+'" cx="'+p.x+'" cy="'+p.y+'" r="4" fill="'+PASTELS[i%PASTELS.length]+'" stroke="#111" stroke-width="1"/>';}).join("")+
      '</svg>';
  }

  function pieSvg(labels,values,w,h){
    var tot=values.reduce(function(a,b){return a+b;},0)||1;
    var cx=w/2,cy=h/2,r=Math.min(w,h)/2-14,ir=r*.52,a0=-Math.PI/2,paths="";
    values.forEach(function(v,i){
      var a1=a0+(v/tot)*Math.PI*2;
      var lg=a1-a0>Math.PI?1:0;
      var p0=pol(cx,cy,r,a0),p1=pol(cx,cy,r,a1),ip0=pol(cx,cy,ir,a0),ip1=pol(cx,cy,ir,a1);
      paths+='<path data-tip="'+esc(labels[i]+": "+v)+'" d="M'+p0[0]+' '+p0[1]+' A'+r+' '+r+' 0 '+lg+' 1 '+p1[0]+' '+p1[1]+' L'+ip1[0]+' '+ip1[1]+' A'+ir+' '+ir+' 0 '+lg+' 0 '+ip0[0]+' '+ip0[1]+' Z" fill="'+PASTELS[i%PASTELS.length]+'"/>';
      a0=a1;
    });
    return '<svg class="chart-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+paths+'</svg>';
  }
  function pol(cx,cy,r,a){return[cx+r*Math.cos(a),cy+r*Math.sin(a)];}

  /* ───────────────────────────────────────────
     Box modals
  ─────────────────────────────────────────── */
  function confirmDel(box){
    openModal(
      '<h3>حذف باکس</h3><p>«'+esc(box.title)+'» حذف شود؟</p>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-danger" id="mo">حذف</button></div>'
    );
    mbind("mc",closeModal);
    mbind("mo",function(){
      var sp=activeSpace();
      sp.boxes.forEach(function(b){if(b.parentId===box.id)b.parentId=null;});
      sp.boxes=sp.boxes.filter(function(b){return b.id!==box.id;});
      delete timerState[box.id];
      save(); closeModal(); renderAll(); toast("حذف شد");
    });
  }

  function openParentPicker(box){
    var sp=activeSpace();
    var blocked=new Set([box.id].concat(Array.from(descs(box.id,sp.boxes))));
    var opts=sp.boxes.filter(function(b){return!blocked.has(b.id);}).map(function(b){
      return '<option value="'+b.id+'"'+(box.parentId===b.id?" selected":"")+'>'+esc(b.title)+'</option>';
    }).join("");
    openModal(
      '<h3>انتخاب والد</h3><label>والد</label>'+
      '<select id="mp"><option value="">بدون والد</option>'+opts+'</select>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mo">ذخیره</button></div>'
    );
    mbind("mc",closeModal);
    mbind("mo",function(){
      var pid=($i("mp")||{}).value||null;
      if(wouldCycle(box.id,pid,sp.boxes)){toast("ساختار حلقه‌ای مجاز نیست");return;}
      box.parentId=pid; save(); closeModal(); renderAll();
    });
  }

  function openLinkModal(box){
    openModal(
      '<h3>لینک</h3><label>عنوان</label><input id="mt" value="'+esc(box.title)+'"/>'+
      '<label>آدرس</label><input id="mu" value="'+esc(box.url)+'" placeholder="https://"/>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mo">ذخیره</button></div>'
    );
    mbind("mc",closeModal);
    mbind("mo",function(){
      var url=($i("mu")||{}).value||"";
      if(!safeUrl(url)){toast("فقط https://");return;}
      box.title=($i("mt")||{}).value||"لینک"; box.url=url;
      save(); closeModal(); renderBoxes();
    });
  }

  function openImageModal(box){
    openModal(
      '<h3>عکس</h3>'+
      '<label>آپلود از دستگاه</label>'+
      '<input type="file" id="imgpick" accept="image/*" style="font-size:12px"/>'+
      '<label>یا URL عکس</label>'+
      '<input id="mu" value="'+esc(box.url)+'" placeholder="https://...jpg"/>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mo">ذخیره</button></div>'
    );
    mbind("mc",closeModal);
    var pickEl=$i("imgpick");
    if(pickEl) pickEl.addEventListener("change",function(){
      var f=pickEl.files&&pickEl.files[0]; if(!f) return;
      if(f.size>4*1024*1024){toast("عکس بیش از ۴ مگابایت است");return;}
      var r=new FileReader();
      r.onload=function(){ box.imageData=r.result; box.url=""; save(); closeModal(); renderBoxes(); };
      r.readAsDataURL(f);
    });
    mbind("mo",function(){
      var url=($i("mu")||{}).value||"";
      if(url){ box.url=url; box.imageData=""; save(); closeModal(); renderBoxes(); }
      else toast("آدرس یا فایل انتخاب کن");
    });
  }

  function openEmbedModal(box){
    openModal(
      '<h3>امبد سایت</h3><label>آدرس URL</label>'+
      '<input id="mu" value="'+esc(box.embedUrl)+'" placeholder="https://example.com"/>'+
      '<p style="font-size:11px;color:var(--text-m);margin-top:6px">توجه: بعضی سایت‌ها اجازه امبد نمیدن (X-Frame-Options)</p>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mo">ذخیره</button></div>'
    );
    mbind("mc",closeModal);
    mbind("mo",function(){
      var url=($i("mu")||{}).value||"";
      if(!safeUrl(url)){toast("فقط https://");return;}
      box.embedUrl=url; save(); closeModal(); renderBoxes();
    });
  }

  /* ───────────────────────────────────────────
     Chart wizard
  ─────────────────────────────────────────── */
  function openChartWizard(existing){
    var draft=existing?JSON.parse(JSON.stringify(existing.chart)):{kind:"bar",desc:"",labels:["الف","ب"],values:[10,6]};
    var title=existing?existing.title:"نمودار";
    function s1(){
      openModal(
        '<h3>نمودار ۱/۴</h3><label>عنوان</label><input id="ct" value="'+esc(title)+'"/>'+
        '<label>توضیح</label><textarea id="cd">'+esc(draft.desc)+'</textarea>'+
        '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mn">بعدی</button></div>'
      );
      mbind("mc",closeModal);
      mbind("mn",function(){title=($i("ct")||{}).value||"نمودار";draft.desc=($i("cd")||{}).value;s2();});
    }
    function s2(){
      openModal(
        '<h3>نمودار ۲/۴</h3><div class="kind-grid cols-2">'+
        ['bar','line','pie'].map(function(k){
          var lbs={bar:"میله‌ای",line:"خطی",pie:"دایره‌ای"};
          return '<button class="kind-card'+(draft.kind===k?" is-on":"")+'" data-k="'+k+'">'+lbs[k]+'</button>';
        }).join("")+
        '</div><div class="modal-actions"><button class="btn-ghost" id="mb">قبلی</button><button class="btn-primary" id="mn">بعدی</button></div>'
      );
      D.modal.querySelectorAll(".kind-card").forEach(function(c){c.addEventListener("click",function(){draft.kind=c.dataset.k;s2();});});
      mbind("mb",s1); mbind("mn",s3);
    }
    function s3(){
      openModal(
        '<h3>نمودار ۳/۴</h3><div id="rows">'+
        draft.labels.map(function(lb,i){
          return '<div class="data-row"><input class="c-lb" value="'+esc(lb)+'"/><input class="c-val" type="number" value="'+(draft.values[i]||0)+'"/><button class="icon-btn c-del"><i class="fa-solid fa-xmark"></i></button></div>';
        }).join("")+
        '</div><button class="btn-ghost btn-sm" id="ca" style="margin:6px 0">+ ردیف</button>'+
        '<div class="modal-actions"><button class="btn-ghost" id="mb">قبلی</button><button class="btn-primary" id="mn">پیش‌نمایش</button></div>'
      );
      function collect(){
        draft.labels=Array.from(D.modal.querySelectorAll(".c-lb")).map(function(i){return i.value;});
        draft.values=Array.from(D.modal.querySelectorAll(".c-val")).map(function(i){return Number(i.value)||0;});
      }
      $i("ca").addEventListener("click",function(){collect();draft.labels.push("مورد");draft.values.push(1);s3();});
      D.modal.querySelectorAll(".c-del").forEach(function(btn,i){
        btn.addEventListener("click",function(){collect();draft.labels.splice(i,1);draft.values.splice(i,1);s3();});
      });
      mbind("mb",s2); mbind("mn",function(){collect();s4();});
    }
    function s4(){
      openModal(
        '<h3>پیش‌نمایش</h3><p style="font-size:11px;color:var(--text-m)">'+esc(title)+'</p><div id="cprev"></div>'+
        '<div class="modal-actions"><button class="btn-ghost" id="mb">قبلی</button><button class="btn-primary" id="mo">ذخیره</button></div>'
      );
      drawChart($i("cprev"),{width:420,height:260,chart:draft});
      mbind("mb",s3);
      mbind("mo",function(){
        if(existing){existing.title=title;existing.chart=draft;}
        else{
          var b=mkBox("chart",viewCenter().x,viewCenter().y);
          b.title=title; b.chart=draft; activeSpace().boxes.push(b);
        }
        save(); closeModal(); renderAll(); toast("نمودار ذخیره شد");
      });
    }
    s1();
  }

  /* ───────────────────────────────────────────
     Space modals
  ─────────────────────────────────────────── */
  function openAddBox(){
    openModal(
      '<h3>باکس جدید</h3><div class="kind-grid">'+
      Object.keys(TYPES).map(function(t){
        var icons={text:"fa-align-right",folder:"fa-folder",task:"fa-check",link:"fa-link",image:"fa-image",embed:"fa-globe",timer:"fa-clock",chart:"fa-chart-pie"};
        return '<button class="kind-card" data-t="'+t+'"><i class="fa-solid '+icons[t]+'"></i>'+TYPES[t]+'</button>';
      }).join("")+
      '</div><div class="modal-actions"><button class="btn-ghost" id="mc">بستن</button></div>'
    );
    mbind("mc",closeModal);
    D.modal.querySelectorAll(".kind-card").forEach(function(c){
      c.addEventListener("click",function(){
        var t=c.dataset.t; closeModal();
        if(t==="chart") return openChartWizard(null);
        var ctr=viewCenter();
        var b=mkBox(t,ctr.x,ctr.y);
        if(t==="task") b.tasks=[{id:uid(),text:"اولین تسک",done:false}];
        if(t==="link") { activeSpace().boxes.push(b); save(); renderAll(); openLinkModal(b); return; }
        if(t==="image") { activeSpace().boxes.push(b); save(); renderAll(); openImageModal(b); return; }
        if(t==="embed") { activeSpace().boxes.push(b); save(); renderAll(); openEmbedModal(b); return; }
        activeSpace().boxes.push(b); save(); renderAll();
      });
    });
  }

  function viewCenter(){
    return{x:D.scroll.scrollLeft+D.scroll.clientWidth/2-160, y:D.scroll.scrollTop+D.scroll.clientHeight/2-110};
  }

  function openNewSpace(){
    openModal(
      '<h3>اسپیس جدید</h3><label>نام</label><input id="mn" value="اسپیس جدید"/>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mo">ساخت</button></div>'
    );
    mbind("mc",closeModal);
    mbind("mo",function(){
      var name=($i("mn")||{}).value||"اسپیس جدید"; var id=uid();
      state.spaces.push({id:id,name:name,boxes:[]});
      state.activeSpaceId=id; save(); closeModal(); renderAll();
    });
  }

  function openRenameSpace(){
    var sp=activeSpace();
    openModal(
      '<h3>تغییر نام</h3><label>نام</label><input id="mn" value="'+esc(sp.name)+'"/>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">انصراف</button><button class="btn-primary" id="mo">ذخیره</button></div>'
    );
    mbind("mc",closeModal);
    mbind("mo",function(){sp.name=($i("mn")||{}).value||sp.name;save();closeModal();renderTabs();});
  }

  function openDeleteSpace(){
    if(state.spaces.length<2){toast("حداقل یک اسپیس باید بماند");return;}
    var sp=activeSpace();
    openModal(
      '<h3>حذف اسپیس</h3><p>نام «'+esc(sp.name)+'» را وارد کن:</p>'+
      '<input id="mn"/><div class="modal-actions">'+
      '<button class="btn-ghost" id="mc">انصراف</button><button class="btn-danger" id="mo">حذف</button></div>',
      {lock:true}
    );
    mbind("mc",closeModal);
    mbind("mo",function(){
      if(($i("mn")||{}).value!==sp.name){toast("نام مطابقت ندارد");return;}
      state.spaces=state.spaces.filter(function(s){return s.id!==sp.id;});
      state.activeSpaceId=state.spaces[0].id;
      save(); closeModal(); renderAll(); toast("اسپیس حذف شد");
    });
  }

  function openSpaceMenu(){
    openModal(
      '<h3>'+esc(activeSpace().name)+'</h3><div class="kind-grid cols-2">'+
      '<button class="kind-card" id="smr">تغییر نام</button><button class="kind-card" id="smd">حذف</button></div>'+
      '<div class="modal-actions"><button class="btn-ghost" id="mc">بستن</button></div>'
    );
    mbind("mc",closeModal);
    mbind("smr",function(){closeModal();openRenameSpace();});
    mbind("smd",function(){closeModal();openDeleteSpace();});
  }

  /* ───────────────────────────────────────────
     Export / Import
  ─────────────────────────────────────────── */
  function doExport(){
    var blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="plan-space.json";
    a.click(); URL.revokeObjectURL(a.href); toast("خروجی گرفته شد");
  }

  function onImportFile(e){
    var f=e.target.files&&e.target.files[0]; e.target.value=""; if(!f) return;
    var r=new FileReader();
    r.onerror=function(){toast("خواندن فایل ناموفق");};
    r.onload=function(){
      try{
        var norm=normState(JSON.parse(String(r.result)));
        if(!norm.spaces.length) throw 0;
        pendingImport=norm;
        openModal(
          '<h3>ورود داده</h3><p>فایل معتبر است.</p>'+
          '<div class="modal-actions">'+
          '<button class="btn-ghost" id="mc">انصراف</button>'+
          '<button class="btn-ghost" id="madd">افزودن</button>'+
          '<button class="btn-primary" id="mrep">جایگزینی</button></div>',
          {lock:true}
        );
        mbind("mc",function(){pendingImport=null;closeModal();});
        mbind("mrep",function(){state=pendingImport;pendingImport=null;save();closeModal();renderAll();toast("جایگزین شد");});
        mbind("madd",function(){
          var inc=pendingImport;pendingImport=null;
          inc.spaces.forEach(function(sp){
            var idMap={},sid=uid();
            var boxes=sp.boxes.map(function(b){var nid=uid();idMap[b.id]=nid;return Object.assign({},b,{id:nid});});
            boxes.forEach(function(b){b.parentId=(b.parentId&&idMap[b.parentId])?idMap[b.parentId]:null;});
            state.spaces.push({id:sid,name:sp.name,boxes:boxes});
          });
          save();closeModal();renderAll();toast("افزوده شد");
        });
      }catch(_){
        openModal('<h3>خطا</h3><p>فایل JSON نامعتبر است.</p><div class="modal-actions"><button class="btn-primary" id="mo">باشه</button></div>');
        mbind("mo",closeModal);
      }
    };
    r.readAsText(f);
  }

  /* ───────────────────────────────────────────
     Fullscreen
  ─────────────────────────────────────────── */
  function toggleFs(){
    if(!document.fullscreenElement)
      document.documentElement.requestFullscreen().catch(function(){toast("تمام‌صفحه پشتیبانی نمی‌شود");});
    else document.exitFullscreen();
  }
  document.addEventListener("fullscreenchange",function(){
    if(D.fsB) D.fsB.innerHTML='<i class="fa-solid '+(document.fullscreenElement?"fa-compress":"fa-expand")+'"></i>';
  });

  /* ───────────────────────────────────────────
     Search
  ─────────────────────────────────────────── */
  D.search.addEventListener("input",function(){
    renderBoxes();
    var first=D.boxes.querySelector(".is-highlight");
    if(first){
      D.scroll.scrollTo({
        left:Math.max(0,(parseInt(first.style.left)||0)-60),
        top:Math.max(0,(parseInt(first.style.top)||0)-60),
        behavior:"smooth"
      });
    }
  });

  /* ───────────────────────────────────────────
     Event wiring
  ─────────────────────────────────────────── */
  clk("btn-add-space",  openNewSpace);
  clk("btn-space-menu", openSpaceMenu);
  clk("btn-theme",      toggleTheme);
  clk("btn-fullscreen", toggleFs);
  clk("btn-export",     doExport);
  clk("btn-import",     function(){D.file.click();});
  clk("fab-add",        openAddBox);
  clk("btn-empty-add",  openAddBox);

  // mobile toolbar
  clk("mob-add",    openAddBox);
  clk("mob-theme",  toggleTheme);
  clk("mob-export", doExport);
  clk("mob-import", function(){D.file.click();});
  clk("mob-search", function(){
    var w=$i("search-wrap");
    w.classList.toggle("is-open");
    if(w.classList.contains("is-open")) D.search.focus();
  });

  D.file.addEventListener("change",onImportFile);
  window.addEventListener("error",function(){toast("خطای غیرمنتظره");});

  /* ───────────────────────────────────────────
     Boot
  ─────────────────────────────────────────── */
  load(); applyTheme(); renderAll();
  D.scroll.scrollTo(80,60);

})();
