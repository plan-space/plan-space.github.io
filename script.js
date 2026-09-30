(function () {
  "use strict";

  /* ═══════════════════════════════════════════
     404 page — minimal bootstrap
     ═══════════════════════════════════════════ */
  if (document.body.classList.contains("page-404")) {
    var pathEl = document.getElementById("term-path");
    if (pathEl) pathEl.textContent = location.pathname || "/unknown";
    var btnHome = document.getElementById("go-home");
    var btnBack = document.getElementById("go-back");
    if (btnHome) btnHome.addEventListener("click", function () { location.href = "index.html"; });
    if (btnBack) btnBack.addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.href = "index.html";
    });
    return;
  }

  /* ═══════════════════════════════════════════
     Constants
     ═══════════════════════════════════════════ */
  var STORAGE_KEY = "plan_space_v2";
  var PASTELS = ["#F4B8C4","#F6C6A8","#F3DFA2","#B8D8C0","#B9DDD5",
                 "#C9B8E8","#D5C7EA","#E8AFAF","#C5D6B7","#BFD7EA"];
  var BOX_TYPES = { text:"متن", folder:"پوشه", task:"تسک", link:"لینک", chart:"نمودار" };
  var MIN_W = 220, MIN_H = 140, MAX_W = 720, MAX_H = 640;
  var ALLOWED_TAGS = new Set([
    "B","I","U","S","STRONG","EM","H2","H3","P","BR",
    "UL","OL","LI","BLOCKQUOTE","A","DIV","SPAN"
  ]);

  /* ═══════════════════════════════════════════
     DOM refs
     ═══════════════════════════════════════════ */
  function q(id) { return document.getElementById(id); }
  var DOM = {
    tabs:       q("space-tabs"),
    boxes:      q("boxes-layer"),
    conn:       q("connections"),
    empty:      q("empty-state"),
    modal:      q("modal-root"),
    toast:      q("toast-root"),
    search:     q("search-input"),
    scroll:     q("canvas-scroll"),
    importFile: q("import-file"),
    themeBtn:   q("btn-theme"),
    fsBtn:      q("btn-fullscreen"),
  };

  /* ═══════════════════════════════════════════
     Utilities
     ═══════════════════════════════════════════ */
  function uid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function isSafeUrl(u) { return /^https?:\/\//i.test(String(u || "")); }

  function on(id, fn) {
    var el = q(id);
    if (el) el.addEventListener("click", fn);
  }

  /* ═══════════════════════════════════════════
     State helpers
     ═══════════════════════════════════════════ */
  function defaultState() {
    var id = uid();
    return {
      version: 2,
      theme: "dark",
      spaces: [{ id: id, name: "اسپیس من", boxes: [] }],
      activeSpaceId: id
    };
  }

  function normalizeBox(b) {
    if (!b || typeof b !== "object") b = {};
    var type = ["text","folder","task","link","chart"].includes(b.type) ? b.type : "text";
    var chart = b.chart && typeof b.chart === "object" ? b.chart : {};
    return {
      id:      typeof b.id === "string" && b.id ? b.id : uid(),
      type:    type,
      title:   String(b.title  || BOX_TYPES[type] || "باکس"),
      content: String(b.content || ""),
      url:     String(b.url    || ""),
      tasks: Array.isArray(b.tasks) ? b.tasks.map(function (t) {
        return {
          id:   typeof t.id === "string" && t.id ? t.id : uid(),
          text: String(t.text || ""),
          done: !!t.done
        };
      }) : [],
      chart: {
        kind:        ["bar","line","pie"].includes(chart.kind) ? chart.kind : "bar",
        description: String(chart.description || ""),
        labels:      Array.isArray(chart.labels) ? chart.labels.map(String) : [],
        values:      Array.isArray(chart.values) ? chart.values.map(function (n) { return Number(n) || 0; }) : []
      },
      parentId: typeof b.parentId === "string" && b.parentId ? b.parentId : null,
      x:        Math.max(0,    Number(b.x)      || 80),
      y:        Math.max(0,    Number(b.y)      || 80),
      width:    Math.max(MIN_W, Number(b.width)  || 320),
      height:   Math.max(MIN_H, Number(b.height) || 220),
      z:        Number(b.z) || 1
    };
  }

  function normalizeState(raw) {
    var s = raw && typeof raw === "object" ? raw : {};
    var out = defaultState();
    out.theme = s.theme === "light" ? "light" : "dark";
    if (Array.isArray(s.spaces) && s.spaces.length) {
      out.spaces = s.spaces.map(function (sp, i) {
        var sid = typeof sp.id === "string" && sp.id ? sp.id : uid();
        var boxes = Array.isArray(sp.boxes) ? sp.boxes.map(normalizeBox) : [];
        return { id: sid, name: String(sp.name || ("اسپیس " + (i + 1))), boxes: boxes };
      });
    }
    var found = out.spaces.some(function (sp) { return sp.id === s.activeSpaceId; });
    out.activeSpaceId = found ? s.activeSpaceId : out.spaces[0].id;
    return out;
  }

  /* ═══════════════════════════════════════════
     Persistence
     ═══════════════════════════════════════════ */
  var state = defaultState();
  var saveTimer = 0;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      // also migrate old key
      if (!raw) raw = localStorage.getItem("plan_space_state_v1");
      state = raw ? normalizeState(JSON.parse(raw)) : defaultState();
    } catch (_) {
      state = defaultState();
    }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { showToast("ذخیره ممکن نیست"); }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }

  /* ═══════════════════════════════════════════
     Space helpers
     ═══════════════════════════════════════════ */
  function activeSpace() {
    return state.spaces.find(function (s) { return s.id === state.activeSpaceId; }) || state.spaces[0];
  }

  function nextZ() {
    return activeSpace().boxes.reduce(function (m, b) { return Math.max(m, b.z || 1); }, 0) + 1;
  }

  function defaultBox(type, x, y) {
    return {
      id: uid(), type: type,
      title: BOX_TYPES[type] || "باکس",
      content: "", url: "",
      tasks: [],
      chart: { kind:"bar", description:"", labels:["الف","ب","ج"], values:[12,8,16] },
      parentId: null,
      x: x, y: y,
      width: 320, height: type === "chart" ? 280 : 220,
      z: nextZ()
    };
  }

  /* ═══════════════════════════════════════════
     Tree helpers
     ═══════════════════════════════════════════ */
  function descendantsOf(id, boxes) {
    var map = new Map();
    boxes.forEach(function (b) {
      if (!map.has(b.parentId)) map.set(b.parentId, []);
      map.get(b.parentId).push(b.id);
    });
    var out = new Set(), stack = [id];
    while (stack.length) {
      var cur = stack.pop();
      (map.get(cur) || []).forEach(function (cid) {
        if (!out.has(cid)) { out.add(cid); stack.push(cid); }
      });
    }
    return out;
  }

  function wouldCycle(childId, parentId, boxes) {
    if (!parentId) return false;
    if (childId === parentId) return true;
    return descendantsOf(childId, boxes).has(parentId);
  }

  /* ═══════════════════════════════════════════
     Theme
     ═══════════════════════════════════════════ */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    var icon = state.theme === "dark" ? "fa-moon" : "fa-sun";
    var html = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
    [DOM.themeBtn, q("mob-theme")].forEach(function (btn) { if (btn) btn.innerHTML = html; });
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    persist(); applyTheme();
  }

  /* ═══════════════════════════════════════════
     Toast
     ═══════════════════════════════════════════ */
  function showToast(msg) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    DOM.toast.appendChild(el);
    setTimeout(function () { el.remove(); }, 2800);
  }

  /* ═══════════════════════════════════════════
     Modal
     ═══════════════════════════════════════════ */
  var _lastFocus = null;

  function openModal(html, opts) {
    var lock = !!(opts && opts.lock);
    _lastFocus = document.activeElement;
    DOM.modal.hidden = false;
    DOM.modal.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + "</div>";
    DOM.modal.dataset.lock = lock ? "1" : "0";
    var first = DOM.modal.querySelector("input,button,select,textarea");
    if (first) first.focus();
    DOM.modal.onclick = function (e) { if (e.target === DOM.modal && !lock) closeModal(); };
  }

  function closeModal() {
    DOM.modal.hidden = true;
    DOM.modal.innerHTML = "";
    if (_lastFocus) { try { _lastFocus.focus(); } catch (_) {} }
  }

  function bind(id, fn) {
    var el = q(id);
    if (el) el.addEventListener("click", fn);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !DOM.modal.hidden && DOM.modal.dataset.lock !== "1") closeModal();
  });

  /* ═══════════════════════════════════════════
     HTML sanitizer
     ═══════════════════════════════════════════ */
  function sanitizeHtml(html) {
    var wrap = document.createElement("div");
    wrap.innerHTML = String(html || "");
    (function walk(node) {
      Array.from(node.childNodes).forEach(function (child) {
        if (child.nodeType === 8) { child.remove(); return; }
        if (child.nodeType !== 1) return;
        var tag = child.tagName;
        if (!ALLOWED_TAGS.has(tag)) {
          var frag = document.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.replaceWith(frag);
          return;
        }
        Array.from(child.attributes).forEach(function (a) {
          var n = a.name.toLowerCase();
          if (n.startsWith("on") || n === "style" || n === "src" || n === "srcdoc")
            child.removeAttribute(a.name);
        });
        if (tag === "A") {
          var href = child.getAttribute("href") || "";
          if (!/^https?:\/\//i.test(href)) child.removeAttribute("href");
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        }
        walk(child);
      });
    })(wrap);
    return wrap.innerHTML;
  }

  /* ═══════════════════════════════════════════
     Render
     ═══════════════════════════════════════════ */
  function renderAll() {
    applyTheme();
    renderTabs();
    renderBoxes();
    renderConnections();
    updateEmpty();
  }

  function renderTabs() {
    DOM.tabs.innerHTML = "";
    state.spaces.forEach(function (sp) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "space-tab" + (sp.id === state.activeSpaceId ? " is-active" : "");
      b.textContent = sp.name;
      b.addEventListener("click", function () {
        state.activeSpaceId = sp.id;
        persist(); renderAll();
      });
      DOM.tabs.appendChild(b);
    });
  }

  function updateEmpty() {
    DOM.empty.hidden = activeSpace().boxes.length > 0;
  }

  function renderBoxes() {
    var q_str = (DOM.search.value || "").trim().toLowerCase();
    DOM.boxes.innerHTML = "";
    var boxes = activeSpace().boxes.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    boxes.forEach(function (box) {
      var el = document.createElement("article");
      el.className = "ps-box";
      el.dataset.id = box.id;
      el.style.cssText = "left:" + box.x + "px;top:" + box.y + "px;width:" + box.width + "px;height:" + box.height + "px;z-index:" + (box.z || 1);
      if (q_str && matchesQuery(box, q_str)) el.classList.add("is-highlight");
      el.innerHTML = boxMarkup(box);
      DOM.boxes.appendChild(el);
      wireBox(el, box);
    });
  }

  function matchesQuery(box, q_str) {
    var blob = [
      box.title, box.content, box.url,
      (box.tasks || []).map(function (t) { return t.text; }).join(" "),
      (box.chart && box.chart.description) || ""
    ].join(" ").toLowerCase();
    return blob.includes(q_str);
  }

  /* ── Box markup ─────────────────────────── */
  function boxMarkup(box) {
    var id = box.id;
    var actions =
      '<div class="box-actions">' +
        '<button type="button" class="icon-btn act-parent" aria-label="والد"><i class="fa-solid fa-sitemap"></i></button>' +
        '<button type="button" class="icon-btn act-edit"   aria-label="ویرایش"><i class="fa-solid fa-pen"></i></button>' +
        '<button type="button" class="icon-btn act-del"    aria-label="حذف"><i class="fa-solid fa-trash"></i></button>' +
      '</div>';
    var head =
      '<div class="box-head" data-drag="1">' +
        '<span class="box-type">' + (BOX_TYPES[box.type] || box.type) + '</span>' +
        '<input class="box-title" value="' + esc(box.title) + '" aria-label="عنوان" />' +
        actions +
      '</div>';

    var body = "";
    if (box.type === "text") {
      body =
        '<div class="rt-toolbar">' +
          rtBtn("bold","B") + rtBtn("italic","I") + rtBtn("underline","U") + rtBtn("strikeThrough","S") +
          rtBtn("h2","H2") + rtBtn("h3","H3") + rtBtn("ul","•") + rtBtn("ol","1.") +
          rtBtn("quote","\u201c") + rtBtn("link",'<i class="fa-solid fa-link"></i>') +
        '</div>' +
        '<div class="rt-editor" contenteditable="true" data-placeholder="متن را بنویس…">' +
          sanitizeHtml(box.content) +
        '</div>';

    } else if (box.type === "folder") {
      var kids = activeSpace().boxes.filter(function (b) { return b.parentId === box.id; }).length;
      body = '<p style="color:var(--text-muted);font-size:13px;margin:0">پوشه والد · فرزندان: ' + kids + '</p>';

    } else if (box.type === "task") {
      var done  = box.tasks.filter(function (t) { return t.done; }).length;
      var total = box.tasks.length;
      var pct   = total ? Math.round((done / total) * 100) : 0;
      body =
        '<div class="progress-wrap">' +
          '<div class="progress-meta"><span>پیشرفت</span><span>' + done + "/" + total + '</span></div>' +
          '<div class="progress-bar"><span style="width:' + pct + '%"></span></div>' +
        '</div>' +
        '<div class="task-list">' + box.tasks.map(taskRowMarkup).join("") + '</div>' +
        '<button type="button" class="btn-ghost act-add-task" style="margin-top:8px">+ تسک جدید</button>';

    } else if (box.type === "link") {
      var safe = isSafeUrl(box.url) ? box.url : "";
      body =
        '<div class="link-card">' +
          '<a class="link-url" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">' +
            esc(safe || "لینکی تنظیم نشده") +
          '</a>' +
          '<button type="button" class="btn-ghost act-edit-link">ویرایش لینک</button>' +
        '</div>';

    } else if (box.type === "chart") {
      body =
        '<div class="chart-desc">' + esc(box.chart.description || "") + '</div>' +
        '<div class="chart-host"></div>' +
        '<button type="button" class="btn-ghost act-edit-chart" style="margin-top:6px">ویرایش نمودار</button>';
    }

    return head + '<div class="box-body">' + body + '</div>' +
           '<div class="resize-handle" aria-label="تغییر اندازه"></div>';
  }

  function rtBtn(cmd, label) {
    return '<button type="button" data-cmd="' + cmd + '" aria-label="' + cmd + '">' + label + '</button>';
  }

  function taskRowMarkup(t) {
    return '<div class="task-row' + (t.done ? " is-done" : "") + '" data-tid="' + t.id + '">' +
      '<input type="checkbox"' + (t.done ? " checked" : "") + ' />' +
      '<input class="task-text" value="' + esc(t.text) + '" />' +
      '<button type="button" class="icon-btn act-del-task" aria-label="حذف تسک"><i class="fa-solid fa-xmark"></i></button>' +
    '</div>';
  }

  /* ── Wire box events ────────────────────── */
  function wireBox(el, box) {
    setupDrag(el.querySelector(".box-head"), box, el);
    setupResize(el.querySelector(".resize-handle"), box, el);

    el.querySelector(".box-title").addEventListener("input", function (e) {
      box.title = e.target.value; scheduleSave();
    });
    el.querySelector(".act-del").addEventListener("click", function () { confirmDeleteBox(box); });
    el.querySelector(".act-parent").addEventListener("click", function () { openParentPicker(box); });
    el.querySelector(".act-edit").addEventListener("click", function () { editBox(box); });

    if (box.type === "text") {
      var editor = el.querySelector(".rt-editor");
      editor.addEventListener("input", function () {
        box.content = sanitizeHtml(editor.innerHTML); scheduleSave();
      });
      el.querySelectorAll(".rt-toolbar button").forEach(function (btn) {
        btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
        btn.addEventListener("click", function () { applyRich(editor, btn.dataset.cmd, box); });
      });
    }

    if (box.type === "task") {
      el.querySelector(".act-add-task").addEventListener("click", function () {
        box.tasks.push({ id: uid(), text: "تسک جدید", done: false });
        persist(); renderBoxes(); renderConnections();
      });
      el.querySelectorAll(".task-row").forEach(function (row) {
        var tid = row.dataset.tid;
        var cb  = row.querySelector("input[type=checkbox]");
        var inp = row.querySelector(".task-text");
        var del = row.querySelector(".act-del-task");
        cb.addEventListener("change", function () {
          var t = box.tasks.find(function (x) { return x.id === tid; });
          if (t) t.done = cb.checked;
          persist(); renderBoxes();
        });
        inp.addEventListener("input", function () {
          var t = box.tasks.find(function (x) { return x.id === tid; });
          if (t) t.text = inp.value;
          scheduleSave();
        });
        del.addEventListener("click", function () {
          box.tasks = box.tasks.filter(function (x) { return x.id !== tid; });
          persist(); renderBoxes();
        });
      });
    }

    if (box.type === "link") {
      el.querySelector(".act-edit-link").addEventListener("click", function () { openLinkModal(box); });
    }

    if (box.type === "chart") {
      el.querySelector(".act-edit-chart").addEventListener("click", function () { openChartWizard(box); });
      drawChart(el.querySelector(".chart-host"), box);
    }
  }

  function editBox(box) {
    if (box.type === "link")  return openLinkModal(box);
    if (box.type === "chart") return openChartWizard(box);
    if (box.type === "text") {
      var ed = DOM.boxes.querySelector('.rt-editor');
      if (ed) ed.focus();
      return;
    }
    showToast("عنوان را از هدر باکس ویرایش کن");
  }

  /* ── Rich text commands ─────────────────── */
  function applyRich(editor, cmd, box) {
    editor.focus();
    if      (cmd === "h2")    document.execCommand("formatBlock", false, "H2");
    else if (cmd === "h3")    document.execCommand("formatBlock", false, "H3");
    else if (cmd === "ul")    document.execCommand("insertUnorderedList");
    else if (cmd === "ol")    document.execCommand("insertOrderedList");
    else if (cmd === "quote") document.execCommand("formatBlock", false, "BLOCKQUOTE");
    else if (cmd === "link") {
      openModal(
        '<h3>لینک متن</h3>' +
        '<label>آدرس</label><input id="m-url" placeholder="https://" />' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
          '<button type="button" class="btn-primary" id="m-ok">درج</button>' +
        '</div>'
      );
      bind("m-cancel", closeModal);
      bind("m-ok", function () {
        var u = q("m-url").value.trim();
        if (!isSafeUrl(u)) { showToast("فقط HTTP / HTTPS"); return; }
        document.execCommand("createLink", false, u);
        box.content = sanitizeHtml(editor.innerHTML);
        persist(); closeModal();
      });
      return;
    } else {
      document.execCommand(cmd);
    }
    box.content = sanitizeHtml(editor.innerHTML);
    scheduleSave();
  }

  /* ═══════════════════════════════════════════
     Drag & resize
     ═══════════════════════════════════════════ */
  function setupDrag(handle, box, el) {
    if (!handle) return;
    handle.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button,input,select,[contenteditable]")) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);

      box.z = nextZ();
      el.style.zIndex = String(box.z);

      var startX = e.clientX, startY = e.clientY;
      var space = activeSpace();
      var idSet = new Set([box.id].concat(Array.from(descendantsOf(box.id, space.boxes))));
      var orig  = new Map();
      space.boxes.forEach(function (b) { if (idSet.has(b.id)) orig.set(b.id, { x: b.x, y: b.y }); });

      var raf = 0;
      function onMove(ev) {
        var dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          space.boxes.forEach(function (b) {
            if (!idSet.has(b.id)) return;
            var o = orig.get(b.id);
            b.x = Math.max(0, o.x + dx);
            b.y = Math.max(0, o.y + dy);
            var node = DOM.boxes.querySelector('[data-id="' + b.id + '"]');
            if (node) { node.style.left = b.x + "px"; node.style.top = b.y + "px"; }
          });
          renderConnections();
        });
      }
      function onUp() {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        persist();
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function setupResize(handle, box, el) {
    if (!handle) return;
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      var sx = e.clientX, sy = e.clientY, sw = box.width, sh = box.height;
      function onMove(ev) {
        requestAnimationFrame(function () {
          // Handle is at bottom-left (RTL): dragging left increases width
          box.width  = Math.min(MAX_W, Math.max(MIN_W, sw - (ev.clientX - sx)));
          box.height = Math.min(MAX_H, Math.max(MIN_H, sh + (ev.clientY - sy)));
          el.style.width  = box.width  + "px";
          el.style.height = box.height + "px";
          if (box.type === "chart") drawChart(el.querySelector(".chart-host"), box);
          renderConnections();
        });
      }
      function onUp() {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        persist();
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  /* ═══════════════════════════════════════════
     Connections (SVG)
     ═══════════════════════════════════════════ */
  function renderConnections() {
    var boxes = activeSpace().boxes;
    var byId  = {};
    boxes.forEach(function (b) { byId[b.id] = b; });
    var parts = [];
    boxes.forEach(function (b) {
      if (!b.parentId || !byId[b.parentId]) return;
      var p   = byId[b.parentId];
      var x1  = p.x + p.width / 2,  y1 = p.y + p.height;
      var x2  = b.x + b.width / 2,  y2 = b.y;
      var mid = (y1 + y2) / 2;
      parts.push(
        '<path d="M ' + x1 + ' ' + y1 +
        ' C ' + x1 + ' ' + mid + ',' + x2 + ' ' + mid + ',' + x2 + ' ' + y2 +
        '" fill="none" stroke="#5a5a5a" stroke-width="1.5" stroke-dasharray="4 3"/>'
      );
    });
    DOM.conn.innerHTML = parts.join("");
  }

  /* ═══════════════════════════════════════════
     Charts
     ═══════════════════════════════════════════ */
  var _tip = null;

  function showTip(e, text) {
    if (!_tip) {
      _tip = document.createElement("div");
      _tip.className = "chart-tooltip";
      document.body.appendChild(_tip);
    }
    _tip.style.display = "block";
    _tip.textContent = text;
    _tip.style.left = (e.clientX + 12) + "px";
    _tip.style.top  = (e.clientY + 12) + "px";
  }
  function hideTip() { if (_tip) _tip.style.display = "none"; }

  function attachTip(el, text) {
    el.addEventListener("pointerenter", function (e) { showTip(e, text); });
    el.addEventListener("pointerleave", hideTip);
    el.addEventListener("touchstart", function (e) {
      e.preventDefault();
      var t = e.touches[0];
      showTip({ clientX: t.clientX, clientY: t.clientY }, text);
    }, { passive: false });
    el.addEventListener("touchend", hideTip);
  }

  function drawChart(host, box) {
    if (!host) return;
    var labels = box.chart.labels.length ? box.chart.labels : ["—"];
    var values = labels.map(function (_, i) { return Number(box.chart.values[i]) || 0; });
    var kind   = box.chart.kind;
    var w = Math.max(220, (box.width  || 320) - 28);
    var h = Math.max(120, (box.height || 280) - 90);

    var svgStr = kind === "bar"  ? barSvg(labels, values, w, h)
               : kind === "line" ? lineSvg(labels, values, w, h)
               :                   pieSvg(labels, values, w, h);

    var legend = labels.map(function (lb, i) {
      return '<span><i class="legend-dot" style="background:' + PASTELS[i % PASTELS.length] + '"></i>' + esc(lb) + '</span>';
    }).join("");

    host.innerHTML = svgStr + '<div class="chart-legend">' + legend + '</div>';
    host.querySelectorAll("[data-tip]").forEach(function (n) {
      attachTip(n, n.getAttribute("data-tip"));
    });
  }

  function barSvg(labels, values, w, h) {
    var max = Math.max(1, Math.max.apply(null, values));
    var pad = 24, n = labels.length, gap = 6;
    var bw  = Math.max(6, (w - pad * 2 - gap * (n - 1)) / n);
    var rects = values.map(function (v, i) {
      var bh = ((h - pad * 2) * v) / max;
      var x  = pad + i * (bw + gap);
      var y  = h - pad - bh;
      return '<rect data-tip="' + esc(labels[i] + ": " + v) + '"' +
             ' x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '"' +
             ' rx="3" fill="' + PASTELS[i % PASTELS.length] + '"/>';
    }).join("");
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' + rects + '</svg>';
  }

  function lineSvg(labels, values, w, h) {
    var max = Math.max(1, Math.max.apply(null, values));
    var pad = 24, n = Math.max(1, labels.length - 1);
    var pts = values.map(function (v, i) {
      return {
        x: pad + (i * (w - pad * 2)) / n,
        y: h - pad - ((h - pad * 2) * v) / max,
        l: labels[i], v: v
      };
    });
    var d    = pts.map(function (p, i) { return (i ? "L" : "M") + p.x + " " + p.y; }).join(" ");
    var dots = pts.map(function (p, i) {
      return '<circle data-tip="' + esc(p.l + ": " + p.v) + '"' +
             ' cx="' + p.x + '" cy="' + p.y + '" r="4"' +
             ' fill="' + PASTELS[i % PASTELS.length] + '" stroke="#111" stroke-width="1"/>';
    }).join("");
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' +
           '<path d="' + d + '" fill="none" stroke="' + PASTELS[5] + '" stroke-width="2"/>' +
           dots + '</svg>';
  }

  function pieSvg(labels, values, w, h) {
    var total = values.reduce(function (a, b) { return a + b; }, 0) || 1;
    var cx = w / 2, cy = h / 2;
    var r  = Math.min(w, h) / 2 - 14;
    var ir = r * 0.52;
    var a0 = -Math.PI / 2, paths = "";
    values.forEach(function (v, i) {
      var a1   = a0 + (v / total) * Math.PI * 2;
      paths   += donutSlice(cx, cy, r, ir, a0, a1, PASTELS[i % PASTELS.length], labels[i] + ": " + v);
      a0 = a1;
    });
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' + paths + '</svg>';
  }

  function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

  function donutSlice(cx, cy, r, ir, a0, a1, color, tip) {
    var lg  = a1 - a0 > Math.PI ? 1 : 0;
    var p0  = polar(cx, cy, r,  a0), p1  = polar(cx, cy, r,  a1);
    var ip0 = polar(cx, cy, ir, a0), ip1 = polar(cx, cy, ir, a1);
    var d   = "M " + p0[0]  + " " + p0[1]  + " A " + r  + " " + r  + " 0 " + lg + " 1 " + p1[0]  + " " + p1[1] +
              " L " + ip1[0] + " " + ip1[1] + " A " + ir + " " + ir + " 0 " + lg + " 0 " + ip0[0] + " " + ip0[1] + " Z";
    return '<path data-tip="' + esc(tip) + '" d="' + d + '" fill="' + color + '"/>';
  }

  /* ═══════════════════════════════════════════
     Modals — boxes
     ═══════════════════════════════════════════ */
  function confirmDeleteBox(box) {
    openModal(
      '<h3>حذف باکس</h3>' +
      '<p>«' + esc(box.title) + '» حذف شود؟ فرزندان باقی می‌مانند.</p>' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn-ghost"  id="m-cancel">انصراف</button>' +
        '<button type="button" class="btn-danger" id="m-ok">حذف</button>' +
      '</div>'
    );
    bind("m-cancel", closeModal);
    bind("m-ok", function () {
      var sp = activeSpace();
      sp.boxes.forEach(function (b) { if (b.parentId === box.id) b.parentId = null; });
      sp.boxes = sp.boxes.filter(function (b) { return b.id !== box.id; });
      persist(); closeModal(); renderAll(); showToast("باکس حذف شد");
    });
  }

  function openParentPicker(box) {
    var sp      = activeSpace();
    var blocked = new Set([box.id].concat(Array.from(descendantsOf(box.id, sp.boxes))));
    var opts    = sp.boxes
      .filter(function (b) { return !blocked.has(b.id); })
      .map(function (b) {
        return '<option value="' + b.id + '"' + (box.parentId === b.id ? " selected" : "") + '>' + esc(b.title) + '</option>';
      }).join("");
    openModal(
      '<h3>انتخاب والد</h3>' +
      '<label>باکس والد</label>' +
      '<select id="m-parent"><option value="">بدون والد</option>' + opts + '</select>' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn-ghost"   id="m-cancel">انصراف</button>' +
        '<button type="button" class="btn-primary" id="m-ok">ذخیره</button>' +
      '</div>'
    );
    bind("m-cancel", closeModal);
    bind("m-ok", function () {
      var pid = q("m-parent").value || null;
      if (wouldCycle(box.id, pid, sp.boxes)) { showToast("ساختار حلقه‌ای مجاز نیست"); return; }
      box.parentId = pid;
      persist(); closeModal(); renderAll();
    });
  }

  function openLinkModal(box) {
    openModal(
      '<h3>لینک</h3>' +
      '<label>عنوان</label><input id="m-title" value="' + esc(box.title) + '" />' +
      '<label>آدرس</label><input id="m-url" value="' + esc(box.url) + '" placeholder="https://" />' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn-ghost"   id="m-cancel">انصراف</button>' +
        '<button type="button" class="btn-primary" id="m-ok">ذخیره</button>' +
      '</div>'
    );
    bind("m-cancel", closeModal);
    bind("m-ok", function () {
      var url = q("m-url").value.trim();
      if (!isSafeUrl(url)) { showToast("فقط HTTP یا HTTPS"); return; }
      box.title = q("m-title").value.trim() || "لینک";
      box.url   = url;
      persist(); closeModal(); renderBoxes();
    });
  }

  /* ── Chart wizard (4 steps) ─────────────── */
  function openChartWizard(existing) {
    var draft = existing
      ? JSON.parse(JSON.stringify(existing.chart))
      : { kind:"bar", description:"", labels:["الف","ب"], values:[10,6] };
    var title = existing ? existing.title : "نمودار";

    function step1() {
      openModal(
        '<h3>نمودار — ۱ / ۴</h3>' +
        '<label>عنوان</label><input id="c-title" value="' + esc(title) + '" />' +
        '<label>توضیح</label><textarea id="c-desc">' + esc(draft.description) + '</textarea>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-ghost"   id="m-cancel">انصراف</button>' +
          '<button type="button" class="btn-primary" id="m-next">بعدی</button>' +
        '</div>'
      );
      bind("m-cancel", closeModal);
      bind("m-next", function () {
        title = q("c-title").value.trim() || "نمودار";
        draft.description = q("c-desc").value;
        step2();
      });
    }

    function step2() {
      openModal(
        '<h3>نمودار — ۲ / ۴</h3>' +
        '<div class="kind-grid">' +
          ['bar','line','pie'].map(function (k) {
            var labels = { bar:"میله‌ای", line:"خطی", pie:"دایره‌ای" };
            return '<button type="button" class="kind-card' + (draft.kind === k ? " is-on" : "") + '" data-k="' + k + '">' + labels[k] + '</button>';
          }).join("") +
        '</div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-ghost"   id="m-back">قبلی</button>' +
          '<button type="button" class="btn-primary" id="m-next">بعدی</button>' +
        '</div>'
      );
      DOM.modal.querySelectorAll(".kind-card").forEach(function (c) {
        c.addEventListener("click", function () { draft.kind = c.dataset.k; step2(); });
      });
      bind("m-back", step1);
      bind("m-next", step3);
    }

    function step3() {
      var rows = draft.labels.map(function (lb, i) {
        return '<div class="data-row">' +
          '<input class="c-lb"  value="' + esc(lb) + '" />' +
          '<input class="c-val" type="number" value="' + (draft.values[i] || 0) + '" />' +
          '<button type="button" class="icon-btn c-del" aria-label="حذف"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
      }).join("");
      openModal(
        '<h3>نمودار — ۳ / ۴</h3>' +
        '<div id="c-rows">' + rows + '</div>' +
        '<button type="button" class="btn-ghost" id="c-add" style="margin-top:6px">+ ردیف</button>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-ghost"   id="m-back">قبلی</button>' +
          '<button type="button" class="btn-primary" id="m-next">پیش‌نمایش</button>' +
        '</div>'
      );
      function collect() {
        draft.labels = Array.from(DOM.modal.querySelectorAll(".c-lb")).map(function (i) { return i.value; });
        draft.values = Array.from(DOM.modal.querySelectorAll(".c-val")).map(function (i) { return Number(i.value) || 0; });
      }
      q("c-add").addEventListener("click", function () { collect(); draft.labels.push("مورد"); draft.values.push(1); step3(); });
      DOM.modal.querySelectorAll(".c-del").forEach(function (btn, i) {
        btn.addEventListener("click", function () { collect(); draft.labels.splice(i,1); draft.values.splice(i,1); step3(); });
      });
      bind("m-back", step2);
      bind("m-next", function () { collect(); step4(); });
    }

    function step4() {
      openModal(
        '<h3>پیش‌نمایش</h3>' +
        '<p style="color:var(--text-muted);font-size:12px">' + esc(title) + (draft.description ? ' — ' + esc(draft.description) : '') + '</p>' +
        '<div id="c-prev"></div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-ghost"   id="m-back">قبلی</button>' +
          '<button type="button" class="btn-primary" id="m-ok">ذخیره</button>' +
        '</div>'
      );
      drawChart(q("c-prev"), { width:420, height:280, chart:draft });
      bind("m-back", step3);
      bind("m-ok", function () {
        if (existing) {
          existing.title = title;
          existing.chart = draft;
        } else {
          var b = defaultBox("chart", 120 + Math.random() * 80, 120 + Math.random() * 80);
          b.title = title; b.chart = draft;
          activeSpace().boxes.push(b);
        }
        persist(); closeModal(); renderAll(); showToast("نمودار ذخیره شد");
      });
    }

    step1();
  }

  /* ═══════════════════════════════════════════
     Modals — spaces & boxes
     ═══════════════════════════════════════════ */
  function openAddBox() {
    openModal(
      '<h3>باکس جدید</h3>' +
      '<div class="kind-grid">' +
        '<button type="button" class="kind-card" data-t="text"><i class="fa-solid fa-align-right"></i><br>متن</button>' +
        '<button type="button" class="kind-card" data-t="folder"><i class="fa-solid fa-folder"></i><br>پوشه</button>' +
        '<button type="button" class="kind-card" data-t="task"><i class="fa-solid fa-check"></i><br>تسک</button>' +
        '<button type="button" class="kind-card" data-t="link"><i class="fa-solid fa-link"></i><br>لینک</button>' +
        '<button type="button" class="kind-card" data-t="chart"><i class="fa-solid fa-chart-pie"></i><br>نمودار</button>' +
      '</div>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">بستن</button></div>'
    );
    bind("m-cancel", closeModal);
    DOM.modal.querySelectorAll(".kind-card").forEach(function (c) {
      c.addEventListener("click", function () {
        var t = c.dataset.t;
        closeModal();
        if (t === "chart") return openChartWizard(null);
        var center = viewCenter();
        var b = defaultBox(t, center.x, center.y);
        if (t === "link") {
          activeSpace().boxes.push(b); persist(); renderAll(); openLinkModal(b); return;
        }
        if (t === "task") b.tasks = [{ id: uid(), text: "اولین تسک", done: false }];
        activeSpace().boxes.push(b); persist(); renderAll();
      });
    });
  }

  function viewCenter() {
    return {
      x: DOM.scroll.scrollLeft + DOM.scroll.clientWidth  / 2 - 160,
      y: DOM.scroll.scrollTop  + DOM.scroll.clientHeight / 2 - 110
    };
  }

  function openNewSpace() {
    openModal(
      '<h3>اسپیس جدید</h3>' +
      '<label>نام</label><input id="m-name" value="اسپیس جدید" />' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn-ghost"   id="m-cancel">انصراف</button>' +
        '<button type="button" class="btn-primary" id="m-ok">ساخت</button>' +
      '</div>'
    );
    bind("m-cancel", closeModal);
    bind("m-ok", function () {
      var name = q("m-name").value.trim() || "اسپیس جدید";
      var id   = uid();
      state.spaces.push({ id: id, name: name, boxes: [] });
      state.activeSpaceId = id;
      persist(); closeModal(); renderAll();
    });
  }

  function openRenameSpace() {
    var sp = activeSpace();
    openModal(
      '<h3>تغییر نام</h3>' +
      '<label>نام</label><input id="m-name" value="' + esc(sp.name) + '" />' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn-ghost"   id="m-cancel">انصراف</button>' +
        '<button type="button" class="btn-primary" id="m-ok">ذخیره</button>' +
      '</div>'
    );
    bind("m-cancel", closeModal);
    bind("m-ok", function () {
      sp.name = q("m-name").value.trim() || sp.name;
      persist(); closeModal(); renderTabs();
    });
  }

  function openDeleteSpace() {
    if (state.spaces.length < 2) { showToast("حداقل یک اسپیس باید بماند"); return; }
    var sp = activeSpace();
    openModal(
      '<h3>حذف اسپیس</h3>' +
      '<p>برای تأیید، نام «' + esc(sp.name) + '» را وارد کن.</p>' +
      '<input id="m-name" />' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn-ghost"  id="m-cancel">انصراف</button>' +
        '<button type="button" class="btn-danger" id="m-ok">حذف</button>' +
      '</div>',
      { lock: true }
    );
    bind("m-cancel", closeModal);
    bind("m-ok", function () {
      if (q("m-name").value.trim() !== sp.name) { showToast("نام مطابقت ندارد"); return; }
      state.spaces = state.spaces.filter(function (s) { return s.id !== sp.id; });
      state.activeSpaceId = state.spaces[0].id;
      persist(); closeModal(); renderAll(); showToast("اسپیس حذف شد");
    });
  }

  function openSpaceMenu() {
    openModal(
      '<h3>' + esc(activeSpace().name) + '</h3>' +
      '<div class="kind-grid">' +
        '<button type="button" class="kind-card" id="sm-ren">تغییر نام</button>' +
        '<button type="button" class="kind-card" id="sm-del">حذف اسپیس</button>' +
      '</div>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">بستن</button></div>'
    );
    bind("m-cancel", closeModal);
    bind("sm-ren", function () { closeModal(); openRenameSpace(); });
    bind("sm-del", function () { closeModal(); openDeleteSpace(); });
  }

  /* ═══════════════════════════════════════════
     Export / Import
     ═══════════════════════════════════════════ */
  function doExport() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a    = document.createElement("a");
    a.href   = URL.createObjectURL(blob);
    a.download = "plan-space.json";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("خروجی گرفته شد");
  }

  var _pendingImport = null;

  function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { showToast("خواندن فایل ناموفق بود"); };
    reader.onload  = function () {
      try {
        var norm = normalizeState(JSON.parse(String(reader.result)));
        if (!norm.spaces.length) throw new Error();
        _pendingImport = norm;
        openModal(
          '<h3>ورود داده</h3><p>فایل معتبر است. چطور اعمال شود؟</p>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn-ghost"   id="m-cancel">انصراف</button>' +
            '<button type="button" class="btn-ghost"   id="m-add">افزودن</button>' +
            '<button type="button" class="btn-primary" id="m-rep">جایگزینی</button>' +
          '</div>',
          { lock: true }
        );
        bind("m-cancel", function () { _pendingImport = null; closeModal(); });
        bind("m-rep", function () {
          state = _pendingImport; _pendingImport = null;
          persist(); closeModal(); renderAll(); showToast("جایگزین شد");
        });
        bind("m-add", function () {
          var inc = _pendingImport; _pendingImport = null;
          inc.spaces.forEach(function (sp) {
            var idMap = {}, sid = uid();
            var boxes = sp.boxes.map(function (b) {
              var nid = uid(); idMap[b.id] = nid;
              return Object.assign({}, b, { id: nid });
            });
            boxes.forEach(function (b) {
              b.parentId = (b.parentId && idMap[b.parentId]) ? idMap[b.parentId] : null;
            });
            state.spaces.push({ id: sid, name: sp.name, boxes: boxes });
          });
          persist(); closeModal(); renderAll(); showToast("افزوده شد");
        });
      } catch (_) {
        openModal(
          '<h3>خطای ورود</h3><p>فایل JSON نامعتبر است.</p>' +
          '<div class="modal-actions"><button type="button" class="btn-primary" id="m-ok">باشه</button></div>'
        );
        bind("m-ok", closeModal);
      }
    };
    reader.readAsText(file);
  }

  /* ═══════════════════════════════════════════
     Fullscreen
     ═══════════════════════════════════════════ */
  function toggleFs() {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen().catch(function () { showToast("تمام‌صفحه پشتیبانی نمی‌شود"); });
    else
      document.exitFullscreen();
  }
  document.addEventListener("fullscreenchange", function () {
    var on = !!document.fullscreenElement;
    if (DOM.fsBtn) DOM.fsBtn.innerHTML = '<i class="fa-solid ' + (on ? "fa-compress" : "fa-expand") + '"></i>';
  });

  /* ═══════════════════════════════════════════
     Event wiring
     ═══════════════════════════════════════════ */
  // Header
  on("btn-add-space",  openNewSpace);
  on("btn-space-menu", openSpaceMenu);
  on("btn-theme",      toggleTheme);
  on("btn-fullscreen", toggleFs);
  on("btn-export",     doExport);
  on("btn-import",     function () { DOM.importFile.click(); });
  on("fab-add",        openAddBox);
  on("btn-empty-add",  openAddBox);

  // Mobile toolbar — IDs differ from modal IDs to avoid collision
  on("mob-add",    openAddBox);
  on("mob-theme",  toggleTheme);
  on("mob-export", doExport);
  on("mob-import", function () { DOM.importFile.click(); });
  on("mob-search", function () {
    var wrap = q("search-wrap");
    wrap.classList.toggle("is-open");
    if (wrap.classList.contains("is-open")) DOM.search.focus();
  });

  DOM.importFile.addEventListener("change", onImportFile);

  DOM.search.addEventListener("input", function () {
    renderBoxes();
    // scroll to first highlighted result
    var first = DOM.boxes.querySelector(".is-highlight");
    if (first) {
      DOM.scroll.scrollTo({
        left:     Math.max(0, (parseInt(first.style.left) || 0) - 60),
        top:      Math.max(0, (parseInt(first.style.top)  || 0) - 60),
        behavior: "smooth"
      });
    }
  });

  window.addEventListener("error", function () { showToast("خطای غیرمنتظره رخ داد"); });

  /* ═══════════════════════════════════════════
     Boot
     ═══════════════════════════════════════════ */
  load();
  applyTheme();
  renderAll();
  DOM.scroll.scrollTo(80, 60);

})();
