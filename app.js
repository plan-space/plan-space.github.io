const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const toast = (t) => {
  const el = $("#toast");
  el.textContent = t;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1600);
};

const store = {
  key: "spacechi.v1",
  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key)) || null;
    } catch {
      return null;
    }
  },
  save(state) {
    localStorage.setItem(this.key, JSON.stringify(state));
  },
};

const defaultState = () => ({
  invert: false,
  activeSpace: null,
  folderStack: [],
  spaces: [
    {
      id: uid(),
      name: "خانه",
      items: [
        {
          id: uid(),
          type: "note",
          title: "خوش آمدی به Space Chi",
          text: "**سیاه و سفید.**\nیادداشت با *ایتالیک*، [لینک](https://example.com)، لیست:\n- اولین\n- دومین\n\nجدول:\n| ستون | مقدار |\n| --- | --- |\n| اسپیس | تب بالا |\n| پوشه | تو در تو |",
        },
        {
          id: uid(),
          type: "task",
          title: "کارهای امروز",
          tasks: [
            { id: uid(), text: "اسپیس جدید بساز", done: false },
            { id: uid(), text: "باکس را به پوشه ببر", done: false },
          ],
        },
        {
          id: uid(),
          type: "link",
          title: "لوگو",
          url: "https://cdn.imgurl.ir/uploads/j9346_InShot_20260930_141619549.png",
        },
        {
          id: uid(),
          type: "folder",
          title: "آرشیو",
          items: [],
        },
      ],
    },
  ],
});

let state = store.load() || defaultState();
if (!state.activeSpace) state.activeSpace = state.spaces[0].id;
if (!state.folderStack) state.folderStack = [];

const persist = () => store.save(state);

function currentSpace() {
  return state.spaces.find((s) => s.id === state.activeSpace) || state.spaces[0];
}

function currentList() {
  const space = currentSpace();
  let list = space.items;
  const trail = [{ name: space.name, items: space.items }];
  for (const id of state.folderStack) {
    const folder = list.find((x) => x.id === id && x.type === "folder");
    if (!folder) break;
    list = folder.items;
    trail.push({ name: folder.title, items: folder.items, id: folder.id });
  }
  return { list, trail };
}

function renderTabs() {
  $("#tabs").innerHTML = state.spaces
    .map(
      (s) => `
    <div class="tab \( {s.id === state.activeSpace ? "active" : ""}" data-id=" \){s.id}">
      <span class="t-name">${escapeHtml(s.name)}</span>
      <button class="t-close" data-close="${s.id}" title="بستن"><i class="fa-solid fa-xmark"></i></button>
    </div>`
    )
    .join("");
}

function renderPath() {
  const { list, trail } = currentList();
  $("#path").innerHTML = trail
    .map(
      (t, i) =>
        `<button class="crumb-item" data-depth="\( {i}"> \){escapeHtml(t.name)}</button>${
          i < trail.length - 1 ? '<span class="sep">/</span>' : ""
        }`
    )
    .join("");
  $("#back-folder").hidden = state.folderStack.length === 0;
  \( ("#space-meta").textContent = ` \){list.length} باکس`;
}

function kindIcon(type) {
  return {
    note: "fa-note-sticky",
    task: "fa-list-check",
    link: "fa-link",
    folder: "fa-folder",
  }[type];
}

function renderBoard() {
  const { list } = currentList();
  const q = (state.query || "").trim();
  const items = q
    ? walkFilter(currentSpace().items, q)
    : list;

  if (!items.length) {
    $("#board").innerHTML = `<div class="empty"><i class="fa-regular fa-square"></i>اینجا خالی است. یک باکس اضافه کن.</div>`;
    return;
  }
  $("#board").innerHTML = items.map(boxHtml).join("");
}

function walkFilter(items, q) {
  const out = [];
  for (const it of items) {
    const blob = `${it.title} ${it.text || ""} ${it.url || ""} ${(it.tasks || []).map((t) => t.text).join(" ")}`.toLowerCase();
    if (blob.includes(q.toLowerCase())) out.push(it);
    if (it.type === "folder") out.push(...walkFilter(it.items, q));
  }
  return out;
}

function boxHtml(item) {
  let body = "";
  if (item.type === "note") {
    body = `
      <div class="note-tools" data-for="${item.id}">
        <button data-fmt="b"><b>B</b></button>
        <button data-fmt="i"><i>I</i></button>
        <button data-fmt="link"><i class="fa-solid fa-link"></i></button>
        <button data-fmt="ul"><i class="fa-solid fa-list-ul"></i></button>
        <button data-fmt="table"><i class="fa-solid fa-table"></i></button>
      </div>
      <textarea class="note-area" data-note="\( {item.id}"> \){escapeHtml(item.text || "")}</textarea>
      <div class="note-preview">${renderMarkdown(item.text || "")}</div>`;
  }
  if (item.type === "task") {
    body = (item.tasks || [])
      .map(
        (t) => `
      <label class="task-row ${t.done ? "done" : ""}">
        <input type="checkbox" data-task="\( {item.id}" data-tid=" \){t.id}" ${t.done ? "checked" : ""} />
        <span contenteditable="true" data-tedit="\( {item.id}" data-tid=" \){t.id}">${escapeHtml(t.text)}</span>
      </label>`
      )
      .join("") + `<button class="add-task" data-addtask="${item.id}">+ تسک</button>`;
  }
  if (item.type === "link") {
    body = `<a class="link-url" href="\( {escapeAttr(item.url || "#")}" target="_blank" rel="noopener"> \){escapeHtml(item.url || "بدون لینک")}</a>
      <input class="note-area" style="min-height:auto;margin-top:8px" data-url="\( {item.id}" value=" \){escapeAttr(item.url || "")}" placeholder="https://" />`;
  }
  if (item.type === "folder") {
    body = `<p class="folder-meta">${(item.items || []).length} مورد داخل پوشه</p>
      <button class="open-folder" data-open="${item.id}"><i class="fa-solid fa-folder-open"></i> باز کردن</button>`;
  }

  const moveOpts = folderOptions(item.id)
    .map((f) => `<option value="\( {f.id}"> \){escapeHtml(f.path)}</option>`)
    .join("");

  return `
  <article class="box" data-box="${item.id}">
    <div class="box-head">
      <span class="kind"><i class="fa-solid ${kindIcon(item.type)}"></i></span>
      <input class="box-title" data-title="\( {item.id}" value=" \){escapeAttr(item.title || "")}" />
      <select class="box-menu" data-move="${item.id}">
        <option value="">انتقال…</option>
        <option value="__root">ریشه اسپیس</option>
        ${moveOpts}
        <option value="__del">حذف</option>
      </select>
    </div>
    <div class="box-body">${body}</div>
  </article>`;
}

function folderOptions(exceptId, items, path = "") {
  items = items || currentSpace().items;
  const out = [];
  for (const it of items) {
    if (it.type !== "folder" || it.id === exceptId) continue;
    const p = path ? `${path} / ${it.title}` : it.title;
    out.push({ id: it.id, path: p });
    out.push(...folderOptions(exceptId, it.items, p));
  }
  return out;
}

function findItem(id, items) {
  items = items || currentSpace().items;
  for (const it of items) {
    if (it.id === id) return { item: it, list: items };
    if (it.type === "folder") {
      const hit = findItem(id, it.items);
      if (hit) return hit;
    }
  }
  return null;
}

function removeItem(id) {
  const hit = findItem(id, currentSpace().items);
  if (!hit) return;
  const i = hit.list.findIndex((x) => x.id === id);
  hit.list.splice(i, 1);
}

function moveItem(id, folderId) {
  const hit = findItem(id);
  if (!hit) return;
  const item = hit.item;
  removeItem(id);
  if (folderId === "__root") currentSpace().items.push(item);
  else {
    const dest = findItem(folderId);
    if (dest && dest.item.type === "folder") dest.item.items.push(item);
    else currentSpace().items.push(item);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function renderMarkdown(src) {
  let s = escapeHtml(src);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  if (/^\|.+\|$/m.test(src)) {
    s = s.replace(/(?:^\|.+\|[ \t]*\n?)+/gm, (block) => {
      const rows = block.trim().split("\n").filter(Boolean);
      const cells = rows
        .filter((r) => !/^\|\s*-+/.test(r))
        .map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
      if (!cells.length) return block;
      const head = cells[0].map((c) => `<th>${c}</th>`).join("");
      const body = cells
        .slice(1)
        .map((r) => `<tr>\( {r.map((c) => `<td> \){c}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead><tr>\( {head}</tr></thead><tbody> \){body}</tbody></table>`;
    });
  }
  s = s.replace(/^- (.+)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  return s.replace(/\n/g, "<br>");
}

function render() {
  document.documentElement.dataset.invert = state.invert ? "1" : "0";
  renderTabs();
  renderPath();
  renderBoard();
  persist();
}

function openModal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
}

function addBoxModal() {
  openModal(
    "باکس جدید",
    `
    <div class="type-grid">
      <button class="type-pick active" data-type="note"><i class="fa-solid fa-note-sticky"></i><br>نوت</button>
      <button class="type-pick" data-type="task"><i class="fa-solid fa-list-check"></i><br>تسک</button>
      <button class="type-pick" data-type="link"><i class="fa-solid fa-link"></i><br>لینک</button>
      <button class="type-pick" data-type="folder"><i class="fa-solid fa-folder"></i><br>پوشه</button>
    </div>
    <div class="field"><label>عنوان</label><input id="new-title" placeholder="عنوان باکس" /></div>
    <div class="field" id="extra-field"></div>
    <button class="primary" id="create-box">ساختن</button>`
  );
  let type = "note";
  const extra = () => {
    const box = $("#extra-field");
    if (type === "link") box.innerHTML = `<label>آدرس</label><input id="new-url" placeholder="https://" />`;
    else if (type === "note") box.innerHTML = `<label>متن</label><textarea id="new-text" rows="4"></textarea>`;
    else box.innerHTML = "";
  };
  extra();
  \[ (".type-pick").forEach((b) =>
    b.addEventListener("click", () => { \](".type-pick").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      type = b.dataset.type;
      extra();
    })
  );
  $("#create-box").onclick = () => {
    const title = $("#new-title").value.trim() || "بدون عنوان";
    const item = { id: uid(), type, title };
    if (type === "note") item.text = $("#new-text")?.value || "";
    if (type === "task") item.tasks = [];
    if (type === "link") item.url = $("#new-url")?.value || "";
    if (type === "folder") item.items = [];
    currentList().list.push(item);
    closeModal();
    render();
    toast("باکس اضافه شد");
  };
}

function addSpace() {
  const name = prompt("نام اسپیس", "اسپیس جدید");
  if (!name) return;
  const s = { id: uid(), name, items: [] };
  state.spaces.push(s);
  state.activeSpace = s.id;
  state.folderStack = [];
  render();
}

function action(name) {
  if (name === "add-box") addBoxModal();
  if (name === "search") {
    const q = prompt("جستجو در اسپیس", state.query || "");
    state.query = q || "";
    render();
  }
  if (name === "export") {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "space-chi.json";
    a.click();
  }
  if (name === "import") $("#import-file").click();
  if (name === "theme") {
    state.invert = !state.invert;
    render();
  }
  if (name === "spaces") {
    openModal(
      "اسپیس‌ها",
      state.spaces
        .map(
          (s) =>
            `<button class="type-pick" style="width:100%;margin-bottom:6px;text-align:right" data-sid="\( {s.id}"> \){escapeHtml(s.name)}</button>`
        )
        .join("") + `<button class="primary" id="new-space-m">اسپیس جدید</button>`
    );
    \[ ("[data-sid]").forEach((b) => {
      b.onclick = () => {
        state.activeSpace = b.dataset.sid;
        state.folderStack = [];
        closeModal();
        render();
      };
    });
    $("#new-space-m").onclick = () => {
      closeModal();
      addSpace();
    };
  }
  if (name === "more") {
    openModal(
      "گزینه‌ها",
      `<button class="type-pick" style="width:100%;margin-bottom:6px" data-more="export">خروجی JSON</button>
       <button class="type-pick" style="width:100%;margin-bottom:6px" data-more="import">ورودی JSON</button>
       <button class="type-pick" style="width:100%" data-more="theme">تغییر تم سیاه/سفید</button>`
    ); \]("[data-more]").forEach((b) => {
      b.onclick = () => {
        closeModal();
        action(b.dataset.more);
      };
    });
  }
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab && !e.target.closest("[data-close]")) {
    state.activeSpace = tab.dataset.id;
    state.folderStack = [];
    state.query = "";
    render();
  }
  const closer = e.target.closest("[data-close]");
  if (closer) {
    e.stopPropagation();
    if (state.spaces.length === 1) return toast("حداقل یک اسپیس لازم است");
    const id = closer.dataset.close;
    state.spaces = state.spaces.filter((s) => s.id !== id);
    if (state.activeSpace === id) state.activeSpace = state.spaces[0].id;
    state.folderStack = [];
    render();
  }
  if (e.target.closest("#add-space-btn")) addSpace();
  const nav = e.target.closest("[data-action]");
  if (nav) action(nav.dataset.action);
  if (e.target.closest("#modal-close") || e.target.id === "modal") closeModal();
  const crumb = e.target.closest("[data-depth]");
  if (crumb) {
    state.folderStack = state.folderStack.slice(0, +crumb.dataset.depth);
    render();
  }
  if (e.target.closest("#back-folder")) {
    state.folderStack.pop();
    render();
  }
  const open = e.target.closest("[data-open]");
  if (open) {
    state.folderStack.push(open.dataset.open);
    render();
  }
  const fmt = e.target.closest("[data-fmt]");
  if (fmt) {
    const id = fmt.parentElement.dataset.for;
    const ta = \( (`[data-note=" \){id}"]`);
    const map = {
      b: "**متن**",
      i: "*متن*",
      link: "[عنوان](https://)",
      ul: "- مورد",
      table: "| ستون | مقدار |\n| --- | --- |\n| الف | ۱ |",
    };
    ta.value = (ta.value ? ta.value + "\n" : "") + map[fmt.dataset.fmt];
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const addt = e.target.closest("[data-addtask]");
  if (addt) {
    const hit = findItem(addt.dataset.addtask);
    hit.item.tasks.push({ id: uid(), text: "تسک جدید", done: false });
    render();
  }
});

document.addEventListener("dblclick", (e) => {
  const name = e.target.closest(".t-name");
  if (!name) return;
  const id = name.parentElement.dataset.id;
  const space = state.spaces.find((s) => s.id === id);
  const n = prompt("نام اسپیس", space.name);
  if (n) {
    space.name = n;
    render();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.dataset.title) {
    findItem(e.target.dataset.title).item.title = e.target.value;
    persist();
  }
  if (e.target.dataset.note) {
    const it = findItem(e.target.dataset.note).item;
    it.text = e.target.value;
    e.target.parentElement.querySelector(".note-preview").innerHTML = renderMarkdown(it.text);
    persist();
  }
  if (e.target.dataset.url) {
    findItem(e.target.dataset.url).item.url = e.target.value;
    persist();
  }
  if (e.target.dataset.tedit) {
    const it = findItem(e.target.dataset.tedit).item;
    const t = it.tasks.find((x) => x.id === e.target.dataset.tid);
    t.text = e.target.textContent;
    persist();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.task) {
    const it = findItem(e
