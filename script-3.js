(function () {
  "use strict";

  if (document.body.classList.contains("page-404")) {
    var pathEl = document.getElementById("term-path");
    if (pathEl) pathEl.textContent = location.pathname || "/unknown";
    var home = document.getElementById("go-home");
    var back = document.getElementById("go-back");
    if (home) home.addEventListener("click", function () { location.href = "index.html"; });
    if (back) back.addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.href = "index.html";
    });
    return;
  }

  const STORAGE_KEY = "plan_space_state_v1";
  const PASTELS = ["#F4B8C4","#F6C6A8","#F3DFA2","#B8D8C0","#B9DDD5","#C9B8E8","#D5C7EA","#E8AFAF","#C5D6B7","#BFD7EA"];
  const BOX_TYPES = { text: "متن", folder: "پوشه", task: "تسک", link: "لینک", chart: "نمودار" };
  const MIN_W = 220, MIN_H = 140, MAX_W = 720, MAX_H = 640;
  const ALLOWED_TAGS = new Set(["B","I","U","S","STRONG","EM","H2","H3","P","BR","UL","OL","LI","BLOCKQUOTE","A","DIV","SPAN"]);

  const $ = (id) => document.getElementById(id);
  const els = {
    tabs: $("space-tabs"),
    boxes: $("boxes-layer"),
    conn: $("connections"),
    empty: $("empty-state"),
    modal: $("modal-root"),
    toast: $("toast-root"),
    search: $("search-input"),
    canvas: $("canvas"),
    scroll: $("canvas-scroll"),
    importFile: $("import-file"),
    themeBtn: $("btn-theme"),
    fsBtn: $("btn-fullscreen"),
  };

  function uid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function defaultBox(type, x, y) {
    return {
      id: uid(), type, title: BOX_TYPES[type] || "باکس", content: "", url: "",
      tasks: [], chart: { kind: "bar", description: "", labels: ["الف", "ب", "ج"], values: [12, 8, 16] },
      parentId: null, x, y, width: 320, height: type === "chart" ? 280 : 220, z: nextZ()
    };
  }

  function defaultState() {
    const id = uid();
    return { version: 1, theme: "dark", spaces: [{ id, name: "اسپیس من", boxes: [] }], activeSpaceId: id };
  }

  function normalize(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const out = defaultState();
    out.theme = s.theme === "light" ? "light" : "dark";
    if (Array.isArray(s.spaces) && s.spaces.length) {
      out.spaces = s.spaces.map((sp, i) => {
        const sid = typeof sp.id === "string" ? sp.id : uid();
        const boxes = Array.isArray(sp.boxes) ? sp.boxes.map(normalizeBox) : [];
        return { id: sid, name: String(sp.name || "اسپیس " + (i + 1)), boxes };
      });
    }
    out.activeSpaceId = out.spaces.some((x) => x.id === s.activeSpaceId) ? s.activeSpaceId : out.spaces[0].id;
    return out;
  }

  function normalizeBox(b) {
    const type = ["text","folder","task","link","chart"].includes(b && b.type) ? b.type : "text";
    const chart = (b && b.chart) || {};
    return {
      id: typeof b.id === "string" ? b.id : uid(),
      type,
      title: String(b.title || BOX_TYPES[type]),
      content: String(b.content || ""),
      url: String(b.url || ""),
      tasks: Array.isArray(b.tasks) ? b.tasks.map((t) => ({
        id: typeof t.id === "string" ? t.id : uid(),
        text: String(t.text || ""),
        done: !!t.done
      })) : [],
      chart: {
        kind: ["bar","line","pie"].includes(chart.kind) ? chart.kind : "bar",
        description: String(chart.description || ""),
        labels: Array.isArray(chart.labels) ? chart.labels.map(String) : [],
        values: Array.isArray(chart.values) ? chart.values.map((n) => Number(n) || 0) : []
      },
      parentId: typeof b.parentId === "string" ? b.parentId : null,
      x: Number(b.x) || 80, y: Number(b.y) || 80,
      width: Math.max(MIN_W, Number(b.width) || 320),
      height: Math.max(MIN_H, Number(b.height) || 220),
      z: Number(b.z) || 1
    };
  }

  let state = defaultState();
  let saveTimer = 0;
  let lastFocus = null;
  let pendingImport = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? normalize(JSON.parse(raw)) : defaultState();
    } catch (_) {
      state = defaultState();
    }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { toast("ذخیره ممکن نیست"); }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 280);
  }

  function activeSpace() {
    return state.spaces.find((s) => s.id === state.activeSpaceId) || state.spaces[0];
  }

  function nextZ() {
    const boxes = activeSpace().boxes;
    return boxes.reduce((m, b) => Math.max(m, b.z || 1), 0) + 1;
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    const icon = state.theme === "dark" ? "fa-moon" : "fa-sun";
    [els.themeBtn, $("m-theme")].forEach((btn) => {
      if (btn) btn.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
    });
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    els.toast.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function sanitizeHtml(html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = String(html || "");
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          const tag = child.tagName;
          if (!ALLOWED_TAGS.has(tag)) {
            const frag = document.createDocumentFragment();
            while (child.firstChild) frag.appendChild(child.firstChild);
            child.replaceWith(frag);
            return;
          }
          [...child.attributes].forEach((a) => {
            const n = a.name.toLowerCase();
            if (n.startsWith("on") || n === "style" || n === "src" || n === "srcdoc") child.removeAttribute(a.name);
          });
          if (tag === "A") {
            const href = child.getAttribute("href") || "";
            if (!/^https?:\/\//i.test(href)) child.removeAttribute("href");
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          }
          walk(child);
        } else if (child.nodeType === 8) child.remove();
      });
    };
    walk(wrap);
    return wrap.innerHTML;
  }

  function descendantsOf(id, boxes) {
    const map = new Map();
    boxes.forEach((b) => {
      if (!map.has(b.parentId)) map.set(b.parentId, []);
      map.get(b.parentId).push(b.id);
    });
    const out = new Set();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      (map.get(cur) || []).forEach((cid) => {
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

  function closeModal() {
    els.modal.hidden = true;
    els.modal.innerHTML = "";
    if (lastFocus) try { lastFocus.focus(); } catch (_) {}
  }

  function openModal(html, opts) {
    const lock = opts && opts.lock;
    lastFocus = document.activeElement;
    els.modal.hidden = false;
    els.modal.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + "</div>";
    const first = els.modal.querySelector("input,button,select,textarea");
    if (first) first.focus();
    els.modal.onclick = (e) => { if (e.target === els.modal && !lock) closeModal(); };
    els.modal.dataset.lock = lock ? "1" : "0";
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.hidden && els.modal.dataset.lock !== "1") closeModal();
  });

  function renderAll() {
    applyTheme();
    renderTabs();
    renderBoxes();
    renderConnections();
    updateEmpty();
  }

  function renderTabs() {
    els.tabs.innerHTML = "";
    state.spaces.forEach((sp) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "space-tab" + (sp.id === state.activeSpaceId ? " is-active" : "");
      b.textContent = sp.name;
      b.addEventListener("click", () => {
        state.activeSpaceId = sp.id;
        persist();
        renderAll();
      });
      els.tabs.appendChild(b);
    });
  }

  function updateEmpty() {
    els.empty.hidden = activeSpace().boxes.length !== 0;
  }

  function renderBoxes() {
    const q = (els.search.value || "").trim().toLowerCase();
    els.boxes.innerHTML = "";
    const boxes = activeSpace().boxes.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    boxes.forEach((box) => {
      const el = document.createElement("article");
      el.className = "ps-box";
      el.dataset.id = box.id;
      el.style.left = box.x + "px";
      el.style.top = box.y + "px";
      el.style.width = box.width + "px";
      el.style.height = box.height + "px";
      el.style.zIndex = String(box.z || 1);
      if (q && matchesQuery(box, q)) el.classList.add("is-highlight");
      el.innerHTML = boxMarkup(box);
      els.boxes.appendChild(el);
      bindBox(el, box);
    });
  }

  function matchesQuery(box, q) {
    const blob = [
      box.title, box.content, box.url, box.type,
      (box.tasks || []).map((t) => t.text).join(" "),
      (box.chart && box.chart.description) || ""
    ].join(" ").toLowerCase();
    return blob.includes(q);
  }

  function boxMarkup(box) {
    const actions = `
      <div class="box-actions">
        <button type="button" class="icon-btn act-parent" data-id="${box.id}" aria-label="والد"><i class="fa-solid fa-sitemap"></i></button>
        <button type="button" class="icon-btn act-edit" data-id="${box.id}" aria-label="ویرایش"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="icon-btn act-del" data-id="${box.id}" aria-label="حذف"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    const head = `
      <div class="box-head" data-drag="1">
        <span class="box-type">${BOX_TYPES[box.type] || box.type}</span>
        <input class="box-title" data-id="${box.id}" value="${escapeAttr(box.title)}" aria-label="عنوان" />
        ${actions}
      </div>`;
    let body = "";
    if (box.type === "text") {
      body = `<div class="rt-toolbar" data-for="${box.id}">
        ${rtBtn("bold","B")}${rtBtn("italic","I")}${rtBtn("underline","U")}${rtBtn("strikeThrough","S")}
        ${rtBtn("h2","H2")}${rtBtn("h3","H3")}${rtBtn("ul","•")}${rtBtn("ol","1.")}
        ${rtBtn("quote","“")}${rtBtn("link",'<i class="fa-solid fa-link"></i>')}
      </div>
      <div class="rt-editor" contenteditable="true" data-id="${box.id}" data-placeholder="متن را بنویس…">${sanitizeHtml(box.content)}</div>`;
    } else if (box.type === "folder") {
      const kids = activeSpace().boxes.filter((b) => b.parentId === box.id).length;
      body = `<p style="color:var(--text-muted);font-size:13px;margin:0">پوشه والد برای ساختاردهی باکس‌ها. فرزندان: ${kids}</p>`;
    } else if (box.type === "task") {
      const done = box.tasks.filter((t) => t.done).length;
      const total = box.tasks.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      body = `<div class="progress-wrap"><div class="progress-meta"><span>پیشرفت</span><span>${done}/${total}</span></div>
        <div class="progress-bar"><span style="width:${pct}%"></span></div></div>
        <div class="task-list">${box.tasks.map(taskRow).join("")}</div>
        <button type="button" class="btn-ghost act-add-task" data-id="${box.id}" style="margin-top:8px">+ تسک جدید</button>`;
    } else if (box.type === "link") {
      const safe = isSafeUrl(box.url) ? box.url : "";
      body = `<div class="link-card">
        <a class="link-url" href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safe || "لینکی تنظیم نشده")}</a>
        <button type="button" class="btn-ghost act-edit-link" data-id="${box.id}">ویرایش لینک</button>
      </div>`;
    } else if (box.type === "chart") {
      body = `<div class="chart-desc">${escapeHtml(box.chart.description || "")}</div>
        <div class="chart-host" data-id="${box.id}"></div>
        <button type="button" class="btn-ghost act-edit-chart" data-id="${box.id}" style="margin-top:6px">ویرایش نمودار</button>`;
    }
    return head + `<div class="box-body">${body}</div><div class="resize-handle" data-resize="1" aria-label="تغییر اندازه"></div>`;
  }

  function rtBtn(cmd, label) {
    return `<button type="button" data-cmd="${cmd}" aria-label="${cmd}">${label}</button>`;
  }

  function taskRow(t) {
    return `<div class="task-row ${t.done ? "is-done" : ""}" data-tid="${t.id}">
      <input type="checkbox" ${t.done ? "checked" : ""} data-tid="${t.id}" />
      <input class="task-text" value="${escapeAttr(t.text)}" data-tid="${t.id}" />
      <button type="button" class="icon-btn act-del-task" data-tid="${t.id}" aria-label="حذف تسک"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
  function isSafeUrl(u) { return /^https?:\/\//i.test(String(u || "")); }

  function bindBox(el, box) {
    const head = el.querySelector(".box-head");
    const handle = el.querySelector(".resize-handle");
    setupDrag(head, box, el);
    setupResize(handle, box, el);

    el.querySelector(".box-title").addEventListener("input", (e) => {
      box.title = e.target.value;
      scheduleSave();
    });
    el.querySelector(".act-del").addEventListener("click", () => confirmDeleteBox(box));
    el.querySelector(".act-parent").addEventListener("click", () => openParentPicker(box));
    el.querySelector(".act-edit").addEventListener("click", () => editBox(box));

    if (box.type === "text") {
      const editor = el.querySelector(".rt-editor");
      editor.addEventListener("input", () => {
        box.content = sanitizeHtml(editor.innerHTML);
        scheduleSave();
      });
      el.querySelectorAll(".rt-toolbar button").forEach((btn) => {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => applyRich(editor, btn.dataset.cmd, box));
      });
    }
    if (box.type === "task") {
      el.querySelector(".act-add-task").addEventListener("click", () => {
        box.tasks.push({ id: uid(), text: "تسک جدید", done: false });
        persist(); renderBoxes(); renderConnections();
      });
      el.querySelectorAll(".task-row input[type=checkbox]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const t = box.tasks.find((x) => x.id === cb.dataset.tid);
          if (t) t.done = cb.checked;
          persist(); renderBoxes();
        });
      });
      el.querySelectorAll(".task-text").forEach((inp) => {
        inp.addEventListener("input", () => {
          const t = box.tasks.find((x) => x.id === inp.dataset.tid);
          if (t) t.text = inp.value;
          scheduleSave();
        });
      });
      el.querySelectorAll(".act-del-task").forEach((btn) => {
        btn.addEventListener("click", () => {
          box.tasks = box.tasks.filter((x) => x.id !== btn.dataset.tid);
          persist(); renderBoxes();
        });
      });
    }
    if (box.type === "link") {
      el.querySelector(".act-edit-link").addEventListener("click", () => openLinkModal(box));
    }
    if (box.type === "chart") {
      el.querySelector(".act-edit-chart").addEventListener("click", () => openChartWizard(box));
      drawChart(el.querySelector(".chart-host"), box);
    }
  }

  function editBox(box) {
    if (box.type === "link") return openLinkModal(box);
    if (box.type === "chart") return openChartWizard(box);
    if (box.type === "text") {
      const ed = document.querySelector('.rt-editor[data-id="' + box.id + '"]');
      if (ed) ed.focus();
      return;
    }
    toast("از هدر باکس می‌توانی عنوان را ویرایش کنی");
  }

  function applyRich(editor, cmd, box) {
    editor.focus();
    if (cmd === "h2") document.execCommand("formatBlock", false, "H2");
    else if (cmd === "h3") document.execCommand("formatBlock", false, "H3");
    else if (cmd === "ul") document.execCommand("insertUnorderedList");
    else if (cmd === "ol") document.execCommand("insertOrderedList");
    else if (cmd === "quote") document.execCommand("formatBlock", false, "BLOCKQUOTE");
    else if (cmd === "link") {
      openModal(`<h3>لینک متن</h3>
        <label>آدرس</label><input id="m-url" placeholder="https://" />
        <div class="modal-actions">
          <button type="button" class="btn-ghost" id="m-cancel">انصراف</button>
          <button type="button" class="btn-primary" id="m-ok">درج</button>
        </div>`);
      $bind("m-cancel", closeModal);
      $bind("m-ok", () => {
        const u = document.getElementById("m-url").value.trim();
        if (!isSafeUrl(u)) { toast("فقط HTTP/HTTPS"); return; }
        document.execCommand("createLink", false, u);
        box.content = sanitizeHtml(editor.innerHTML);
        persist(); closeModal();
      });
      return;
    } else document.execCommand(cmd);
    box.content = sanitizeHtml(editor.innerHTML);
    scheduleSave();
  }

  function $bind(id, fn) {
    const n = document.getElementById(id);
    if (n) n.addEventListener("click", fn);
  }

  function setupDrag(handle, box, el) {
    if (!handle) return;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, input, select, [contenteditable]")) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      box.z = nextZ();
      el.style.zIndex = String(box.z);
      const startX = e.clientX, startY = e.clientY;
      const space = activeSpace();
      const idSet = new Set([box.id, ...descendantsOf(box.id, space.boxes)]);
      const orig = new Map();
      space.boxes.forEach((b) => { if (idSet.has(b.id)) orig.set(b.id, { x: b.x, y: b.y }); });

      let raf = 0;
      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          space.boxes.forEach((b) => {
            if (!idSet.has(b.id)) return;
            const o = orig.get(b.id);
            b.x = Math.max(0, o.x + dx);
            b.y = Math.max(0, o.y + dy);
            const node = els.boxes.querySelector('[data-id="' + b.id + '"]');
            if (node) { node.style.left = b.x + "px"; node.style.top = b.y + "px"; }
          });
          renderConnections();
        });
      };
      const onUp = () => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        persist();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function setupResize(handle, box, el) {
    if (!handle) return;
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, sw = box.width, sh = box.height;
      const onMove = (ev) => {
        requestAnimationFrame(() => {
          box.width = Math.min(MAX_W, Math.max(MIN_W, sw + (ev.clientX - sx)));
          box.height = Math.min(MAX_H, Math.max(MIN_H, sh + (ev.clientY - sy)));
          el.style.width = box.width + "px";
          el.style.height = box.height + "px";
          if (box.type === "chart") drawChart(el.querySelector(".chart-host"), box);
          renderConnections();
        });
      };
      const onUp = () => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        persist();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function renderConnections() {
    const boxes = activeSpace().boxes;
    const byId = Object.fromEntries(boxes.map((b) => [b.id, b]));
    const parts = [];
    boxes.forEach((b) => {
      if (!b.parentId || !byId[b.parentId]) return;
      const p = byId[b.parentId];
      const x1 = p.x + p.width / 2, y1 = p.y + p.height;
      const x2 = b.x + b.width / 2, y2 = b.y;
      const mid = (y1 + y2) / 2;
      parts.push('<path d="M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + mid + ', ' + x2 + ' ' + mid + ', ' + x2 + ' ' + y2 + '" fill="none" stroke="#6a6a6a" stroke-width="1.2" />');
    });
    els.conn.innerHTML = parts.join("");
  }

  function drawChart(host, box) {
    if (!host) return;
    const labels = box.chart.labels.length ? box.chart.labels : ["—"];
    const values = labels.map((_, i) => Number(box.chart.values[i]) || 0);
    const kind = box.chart.kind;
    const w = Math.max(220, (box.width || 320) - 28);
    const h = Math.max(140, (box.height || 280) - 90);
    let svg = "";
    if (kind === "bar") svg = barSvg(labels, values, w, h);
    else if (kind === "line") svg = lineSvg(labels, values, w, h);
    else svg = pieSvg(labels, values, w, h);
    const legend = labels.map((lb, i) =>
      '<span><i class="legend-dot" style="background:' + PASTELS[i % PASTELS.length] + '"></i>' + escapeHtml(lb) + '</span>'
    ).join("");
    host.innerHTML = svg + '<div class="chart-legend">' + legend + '</div>';
    host.querySelectorAll("[data-tip]").forEach((n) => {
      n.addEventListener("pointerenter", (e) => showTip(e, n.getAttribute("data-tip")));
      n.addEventListener("pointerleave", hideTip);
    });
  }

  let tipEl;
  function showTip(e, text) {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "chart-tooltip";
      document.body.appendChild(tipEl);
    }
    tipEl.style.display = "block";
    tipEl.textContent = text;
    tipEl.style.left = e.clientX + 10 + "px";
    tipEl.style.top = e.clientY + 10 + "px";
  }
  function hideTip() { if (tipEl) tipEl.style.display = "none"; }

  function barSvg(labels, values, w, h) {
    const max = Math.max(1, ...values);
    const pad = 28;
    const n = labels.length;
    const gap = 8;
    const bw = Math.max(8, (w - pad * 2 - gap * n) / n);
    let bars = "";
    values.forEach((v, i) => {
      const bh = ((h - pad * 2) * v) / max;
      const x = pad + i * (bw + gap);
      const y = h - pad - bh;
      bars += '<rect data-tip="' + escapeAttr(labels[i] + ": " + v) + '" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="4" fill="' + PASTELS[i % PASTELS.length] + '" />';
    });
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' + bars + '</svg>';
  }

  function lineSvg(labels, values, w, h) {
    const max = Math.max(1, ...values);
    const pad = 28;
    const n = Math.max(1, labels.length - 1);
    const pts = values.map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / n;
      const y = h - pad - ((h - pad * 2) * v) / max;
      return { x, y, v, l: labels[i] };
    });
    const d = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
    const dots = pts.map((p, i) =>
      '<circle data-tip="' + escapeAttr(p.l + ": " + p.v) + '" cx="' + p.x + '" cy="' + p.y + '" r="4" fill="' + PASTELS[i % PASTELS.length] + '" stroke="#111" stroke-width="1" />'
    ).join("");
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet"><path d="' + d + '" fill="none" stroke="' + PASTELS[5] + '" stroke-width="2" />' + dots + '</svg>';
  }

  function pieSvg(labels, values, w, h) {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 16, ir = r * 0.55;
    let a0 = -Math.PI / 2, paths = "";
    values.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      paths += donutSlice(cx, cy, r, ir, a0, a1, PASTELS[i % PASTELS.length], labels[i] + ": " + v);
      a0 = a1;
    });
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' + paths + '</svg>';
  }

  function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function donutSlice(cx, cy, r, ir, a0, a1, color, tip) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = polar(cx, cy, r, a0);
    const p1 = polar(cx, cy, r, a1);
    const ip0 = polar(cx, cy, ir, a0);
    const ip1 = polar(cx, cy, ir, a1);
    const d = "M " + p0[0] + " " + p0[1] + " A " + r + " " + r + " 0 " + large + " 1 " + p1[0] + " " + p1[1] +
      " L " + ip1[0] + " " + ip1[1] + " A " + ir + " " + ir + " 0 " + large + " 0 " + ip0[0] + " " + ip0[1] + " Z";
    return '<path data-tip="' + escapeAttr(tip) + '" d="' + d + '" fill="' + color + '" />';
  }

  function confirmDeleteBox(box) {
    openModal('<h3>حذف باکس</h3><p>«' + escapeHtml(box.title) + '» حذف شود؟ فرزندان باقی می‌مانند.</p>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
      '<button type="button" class="btn-danger" id="m-ok">حذف</button></div>');
    $bind("m-cancel", closeModal);
    $bind("m-ok", () => {
      const space = activeSpace();
      space.boxes.forEach((b) => { if (b.parentId === box.id) b.parentId = null; });
      space.boxes = space.boxes.filter((b) => b.id !== box.id);
      persist(); closeModal(); renderAll(); toast("باکس حذف شد");
    });
  }

  function openParentPicker(box) {
    const space = activeSpace();
    const blocked = new Set([box.id, ...descendantsOf(box.id, space.boxes)]);
    const opts = space.boxes.filter((b) => !blocked.has(b.id))
      .map((b) => '<option value="' + b.id + '"' + (box.parentId === b.id ? " selected" : "") + '>' + escapeHtml(b.title) + '</option>').join("");
    openModal('<h3>انتخاب والد</h3><label>پوشه / باکس والد</label>' +
      '<select id="m-parent"><option value="">بدون والد</option>' + opts + '</select>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
      '<button type="button" class="btn-primary" id="m-ok">ذخیره</button></div>');
    $bind("m-cancel", closeModal);
    $bind("m-ok", () => {
      const pid = document.getElementById("m-parent").value || null;
      if (wouldCycle(box.id, pid, space.boxes)) { toast("ساختار حلقه‌ای مجاز نیست"); return; }
      box.parentId = pid;
      persist(); closeModal(); renderAll();
    });
  }

  function openLinkModal(box) {
    openModal('<h3>لینک</h3><label>عنوان</label><input id="m-title" value="' + escapeAttr(box.title) + '" />' +
      '<label>آدرس</label><input id="m-url" value="' + escapeAttr(box.url) + '" placeholder="https://" />' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
      '<button type="button" class="btn-primary" id="m-ok">ذخیره</button></div>');
    $bind("m-cancel", closeModal);
    $bind("m-ok", () => {
      const url = document.getElementById("m-url").value.trim();
      if (!isSafeUrl(url)) { toast("فقط HTTP یا HTTPS"); return; }
      box.title = document.getElementById("m-title").value.trim() || "لینک";
      box.url = url;
      persist(); closeModal(); renderBoxes();
    });
  }

  function openChartWizard(existing) {
    const draft = existing ? JSON.parse(JSON.stringify(existing.chart)) : { kind: "bar", description: "", labels: ["الف","ب"], values: [10, 6] };
    let title = existing ? existing.title : "نمودار";
    step1();
    function step1() {
      openModal('<h3>نمودار — مرحله ۱</h3><label>عنوان</label><input id="c-title" value="' + escapeAttr(title) + '" />' +
        '<label>توضیح</label><textarea id="c-desc">' + escapeHtml(draft.description) + '</textarea>' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
        '<button type="button" class="btn-primary" id="m-next">بعدی</button></div>');
      $bind("m-cancel", closeModal);
      $bind("m-next", () => {
        title = document.getElementById("c-title").value.trim() || "نمودار";
        draft.description = document.getElementById("c-desc").value;
        step2();
      });
    }
    function step2() {
      openModal('<h3>نمودار — نوع</h3><div class="kind-grid">' +
        '<button type="button" class="kind-card ' + (draft.kind==="bar"?"is-on":"") + '" data-k="bar">میله‌ای</button>' +
        '<button type="button" class="kind-card ' + (draft.kind==="line"?"is-on":"") + '" data-k="line">خطی</button>' +
        '<button type="button" class="kind-card ' + (draft.kind==="pie"?"is-on":"") + '" data-k="pie">دایره‌ای</button></div>' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-back">قبلی</button>' +
        '<button type="button" class="btn-primary" id="m-next">بعدی</button></div>');
      els.modal.querySelectorAll(".kind-card").forEach((c) => c.addEventListener("click", () => {
        draft.kind = c.dataset.k;
        step2();
      }));
      $bind("m-back", step1);
      $bind("m-next", step3);
    }
    function step3() {
      const rows = draft.labels.map((lb, i) =>
        '<div class="data-row"><input class="c-lb" value="' + escapeAttr(lb) + '" />' +
        '<input class="c-val" type="number" value="' + (draft.values[i]||0) + '" />' +
        '<button type="button" class="icon-btn c-del" aria-label="حذف"><i class="fa-solid fa-xmark"></i></button></div>'
      ).join("");
      openModal('<h3>نمودار — داده</h3><div id="c-rows">' + rows + '</div>' +
        '<button type="button" class="btn-ghost" id="c-add">+ ردیف</button>' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-back">قبلی</button>' +
        '<button type="button" class="btn-primary" id="m-next">پیش‌نمایش</button></div>');
      document.getElementById("c-add").addEventListener("click", () => { collect(); draft.labels.push("مورد"); draft.values.push(1); step3(); });
      els.modal.querySelectorAll(".c-del").forEach((btn, i) => btn.addEventListener("click", () => {
        collect(); draft.labels.splice(i,1); draft.values.splice(i,1); step3();
      }));
      $bind("m-back", step2);
      $bind("m-next", () => { collect(); step4(); });
      function collect() {
        draft.labels = [...els.modal.querySelectorAll(".c-lb")].map((i) => i.value);
        draft.values = [...els.modal.querySelectorAll(".c-val")].map((i) => Number(i.value) || 0);
      }
    }
    function step4() {
      openModal('<h3>پیش‌نمایش</h3><p style="color:var(--text-muted);font-size:13px">' +
        escapeHtml(title) + ' — ' + escapeHtml(draft.description) + '</p><div id="c-prev"></div>' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-back">قبلی</button>' +
        '<button type="button" class="btn-primary" id="m-ok">ایجاد</button></div>');
      drawChart(document.getElementById("c-prev"), { width: 400, height: 280, chart: draft });
      $bind("m-back", step3);
      $bind("m-ok", () => {
        if (existing) {
          existing.title = title;
          existing.chart = draft;
        } else {
          const b = defaultBox("chart", 120 + Math.random()*80, 120 + Math.random()*80);
          b.title = title; b.chart = draft;
          activeSpace().boxes.push(b);
        }
        persist(); closeModal(); renderAll(); toast("نمودار ذخیره شد");
      });
    }
  }

  function openAddBox() {
    openModal('<h3>باکس جدید</h3><div class="kind-grid">' +
      '<button type="button" class="kind-card" data-t="text"><i class="fa-solid fa-align-right"></i><br>متن</button>' +
      '<button type="button" class="kind-card" data-t="folder"><i class="fa-solid fa-folder"></i><br>پوشه</button>' +
      '<button type="button" class="kind-card" data-t="task"><i class="fa-solid fa-check"></i><br>تسک</button>' +
      '<button type="button" class="kind-card" data-t="link"><i class="fa-solid fa-link"></i><br>لینک</button>' +
      '<button type="button" class="kind-card" data-t="chart"><i class="fa-solid fa-chart-pie"></i><br>نمودار</button></div>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">بستن</button></div>');
    $bind("m-cancel", closeModal);
    els.modal.querySelectorAll(".kind-card").forEach((c) => c.addEventListener("click", () => {
      const t = c.dataset.t;
      closeModal();
      if (t === "chart") return openChartWizard(null);
      if (t === "link") {
        const b = defaultBox("link", viewCenter().x, viewCenter().y);
        activeSpace().boxes.push(b);
        persist(); renderAll();
        openLinkModal(b);
        return;
      }
      const b = defaultBox(t, viewCenter().x, viewCenter().y);
      if (t === "task") b.tasks = [{ id: uid(), text: "اولین تسک", done: false }];
      activeSpace().boxes.push(b);
      persist(); renderAll();
    }));
  }

  function viewCenter() {
    const sc = els.scroll;
    return { x: sc.scrollLeft + sc.clientWidth / 2 - 160, y: sc.scrollTop + sc.clientHeight / 2 - 110 };
  }

  function openNewSpace() {
    openModal('<h3>اسپیس جدید</h3><label>نام</label><input id="m-name" value="اسپیس جدید" />' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
      '<button type="button" class="btn-primary" id="m-ok">ساخت</button></div>');
    $bind("m-cancel", closeModal);
    $bind("m-ok", () => {
      const name = document.getElementById("m-name").value.trim() || "اسپیس جدید";
      const id = uid();
      state.spaces.push({ id, name, boxes: [] });
      state.activeSpaceId = id;
      persist(); closeModal(); renderAll();
    });
  }

  function openRenameSpace() {
    const sp = activeSpace();
    openModal('<h3>تغییر نام اسپیس</h3><label>نام</label><input id="m-name" value="' + escapeAttr(sp.name) + '" />' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
      '<button type="button" class="btn-primary" id="m-ok">ذخیره</button></div>');
    $bind("m-cancel", closeModal);
    $bind("m-ok", () => {
      sp.name = document.getElementById("m-name").value.trim() || sp.name;
      persist(); closeModal(); renderTabs();
    });
  }

  function openDeleteSpace() {
    if (state.spaces.length < 2) { toast("حداقل یک اسپیس باید بماند"); return; }
    const sp = activeSpace();
    openModal('<h3>حذف اسپیس</h3><p>برای تأیید، نام «' + escapeHtml(sp.name) + '» را وارد کن.</p>' +
      '<input id="m-name" /><div class="modal-actions">' +
      '<button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
      '<button type="button" class="btn-danger" id="m-ok">حذف</button></div>', { lock: true });
    $bind("m-cancel", closeModal);
    $bind("m-ok", () => {
      const val = document.getElementById("m-name").value.trim();
      if (val !== sp.name) { toast("نام مطابقت ندارد"); return; }
      state.spaces = state.spaces.filter((s) => s.id !== sp.id);
      state.activeSpaceId = state.spaces[0].id;
      persist(); closeModal(); renderAll(); toast("اسپیس حذف شد");
    });
  }

  function openSpaceMenu() {
    openModal('<h3>' + escapeHtml(activeSpace().name) + '</h3><div class="kind-grid">' +
      '<button type="button" class="kind-card" id="sm-ren">تغییر نام</button>' +
      '<button type="button" class="kind-card" id="sm-del">حذف اسپیس</button></div>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">بستن</button></div>');
    $bind("m-cancel", closeModal);
    $bind("sm-ren", () => { closeModal(); openRenameSpace(); });
    $bind("sm-del", () => { closeModal(); openDeleteSpace(); });
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "plan-space.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("خروجی گرفته شد");
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast("خواندن فایل ناموفق بود");
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const norm = normalize(data);
        if (!norm.spaces.length) throw new Error("empty");
        pendingImport = norm;
        openModal('<h3>ورود داده</h3><p>فایل معتبر است. چطور اعمال شود؟</p>' +
          '<div class="modal-actions" style="flex-wrap:wrap">' +
          '<button type="button" class="btn-ghost" id="m-cancel">انصراف</button>' +
          '<button type="button" class="btn-ghost" id="m-add">افزودن</button>' +
          '<button type="button" class="btn-primary" id="m-rep">جایگزینی</button></div>', { lock: true });
        $bind("m-cancel", () => { pendingImport = null; closeModal(); });
        $bind("m-rep", () => {
          state = pendingImport;
          pendingImport = null;
          persist(); closeModal(); renderAll(); toast("جایگزین شد");
        });
        $bind("m-add", () => {
          const incoming = pendingImport;
          pendingImport = null;
          incoming.spaces.forEach((sp) => {
            const sid = uid();
            const idMap = {};
            const boxes = sp.boxes.map((b) => {
              const nid = uid();
              idMap[b.id] = nid;
              return Object.assign({}, b, { id: nid });
            });
            boxes.forEach((b) => {
              if (b.parentId && idMap[b.parentId]) b.parentId = idMap[b.parentId];
              else b.parentId = null;
            });
            state.spaces.push({ id: sid, name: sp.name, boxes });
          });
          persist(); closeModal(); renderAll(); toast("افزوده شد");
        });
      } catch (_) {
        openModal('<h3>خطای ورود</h3><p>JSON نامعتبر است.</p>' +
          '<div class="modal-actions"><button type="button" class="btn-primary" id="m-ok">باشه</button></div>');
        $bind("m-ok", closeModal);
      }
    };
    reader.readAsText(file);
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    persist(); applyTheme();
  }

  function toggleFs() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => toast("تمام‌صفحه پشتیبانی نمی‌شود"));
    else document.exitFullscreen();
  }
  document.addEventListener("fullscreenchange", () => {
    const on = !!document.fullscreenElement;
    if (els.fsBtn) els.fsBtn.innerHTML = '<i class="fa-solid ' + (on ? "fa-compress" : "fa-expand") + '"></i>';
  });

  $("btn-add-space").addEventListener("click", openNewSpace);
  $("btn-space-menu").addEventListener("click", openSpaceMenu);
  $("btn-theme").addEventListener("click", toggleTheme);
  $("btn-fullscreen").addEventListener("click", toggleFs);
  $("btn-export").addEventListener("click", doExport);
  $("btn-import").addEventListener("click", () => els.importFile.click());
  $("fab-add").addEventListener("click", openAddBox);
  $("btn-empty-add").addEventListener("click", openAddBox);
  $("m-add").addEventListener("click", openAddBox);
  $("m-search").addEventListener("click", () => {
    const wrap = document.getElementById("search-wrap");
    wrap.classList.toggle("is-open");
    if (wrap.classList.contains("is-open")) els.search.focus();
  });
  $("m-theme").addEventListener("click", toggleTheme);
  $("m-export").addEventListener("click", doExport);
  $("m-import").addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", onImportFile);
  els.search.addEventListener("input", () => renderBoxes());

  window.addEventListener("error", () => toast("خطای غیرمنتظره رخ داد"));

  load();
  applyTheme();
  renderAll();
  els.scroll.scrollTo(80, 60);
})();
