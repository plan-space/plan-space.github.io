"use strict";

/* =========================================
   SPACE CHI
========================================= */

const STORAGE_KEY = "spacechi_state_v3";

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];


/* =========================================
   STATE
========================================= */

const state = {
  version: 3,
  theme: "dark",
  spaces: [],
  activeSpaceId: null
};


function uid(prefix = "id") {
  if (crypto && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
}


function createSpace(name = "Space 1") {
  return {
    id: uid("space"),
    name,
    scrollX: 0,
    scrollY: 0,
    boxes: []
  };
}


function createBox(type, x = 150, y = 150) {

  return {
    id: uid("box"),

    type,

    title:
      type === "text"
        ? "Text"
        : type === "parent"
          ? "Folder"
          : type === "task"
            ? "Tasks"
            : "Link",

    content: "",

    url: "",

    tasks: [],

    parentId: null,

    x,
    y,

    z: Date.now()
  };
}


/* =========================================
   NORMALIZATION
========================================= */

function normalizeBox(raw) {

  const allowed = [
    "text",
    "parent",
    "task",
    "link"
  ];

  const type =
    allowed.includes(raw?.type)
      ? raw.type
      : "text";

  return {
    id: String(raw?.id || uid("box")),

    type,

    title:
      typeof raw?.title === "string"
        ? raw.title.slice(0, 120)
        : type === "parent"
          ? "Folder"
          : type === "task"
            ? "Tasks"
            : type === "link"
              ? "Link"
              : "Text",

    content:
      typeof raw?.content === "string"
        ? sanitizeHTML(raw.content)
        : "",

    url:
      typeof raw?.url === "string"
        ? raw.url.slice(0, 2000)
        : "",

    tasks:
      Array.isArray(raw?.tasks)
        ? raw.tasks
            .slice(0, 100)
            .map(task => ({
              id: String(task?.id || uid("task")),
              text:
                typeof task?.text === "string"
                  ? task.text.slice(0, 500)
                  : "",
              done: Boolean(task?.done)
            }))
        : [],

    parentId:
      typeof raw?.parentId === "string"
        ? raw.parentId
        : null,

    x:
      Number.isFinite(Number(raw?.x))
        ? Math.max(0, Number(raw.x))
        : 100,

    y:
      Number.isFinite(Number(raw?.y))
        ? Math.max(0, Number(raw.y))
        : 100,

    z:
      Number.isFinite(Number(raw?.z))
        ? Number(raw.z)
        : 1
  };
}


function normalizeSpace(raw, index) {

  const space = {
    id: String(raw?.id || uid("space")),

    name:
      typeof raw?.name === "string" &&
      raw.name.trim()
        ? raw.name.trim().slice(0, 80)
        : `Space ${index + 1}`,

    scrollX:
      Number(raw?.scrollX) || 0,

    scrollY:
      Number(raw?.scrollY) || 0,

    boxes:
      Array.isArray(raw?.boxes)
        ? raw.boxes.slice(0, 300).map(normalizeBox)
        : []
  };

  const ids = new Set(
    space.boxes.map(box => box.id)
  );

  space.boxes.forEach(box => {

    if (
      box.parentId === box.id ||
      !ids.has(box.parentId)
    ) {
      box.parentId = null;
    }
  });

  return space;
}


function normalizeState(raw) {

  const spaces =
    Array.isArray(raw?.spaces) && raw.spaces.length
      ? raw.spaces.map(normalizeSpace)
      : [createSpace()];

  const active =
    spaces.some(s => s.id === raw?.activeSpaceId)
      ? raw.activeSpaceId
      : spaces[0].id;

  return {
    version: 3,

    theme:
      raw?.theme === "light"
        ? "light"
        : "dark",

    spaces,

    activeSpaceId: active
  };
}


/* =========================================
   STORAGE
========================================= */

function saveState() {

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch (error) {
    showToast(
      "Could not save workspace.",
      true
    );
  }
}


function loadState() {

  try {

    const raw =
      localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      state.spaces = [createSpace()];
      state.activeSpaceId =
        state.spaces[0].id;

      return;
    }

    const parsed = JSON.parse(raw);

    const normalized =
      normalizeState(parsed);

    Object.assign(state, normalized);

  } catch (error) {

    state.spaces = [createSpace()];
    state.activeSpaceId =
      state.spaces[0].id;

    showToast(
      "Saved data was invalid. A new space was created.",
      true
    );
  }
}


/* =========================================
   HELPERS
========================================= */

function activeSpace() {
  return state.spaces.find(
    space => space.id === state.activeSpaceId
  );
}


function getBox(id) {
  return activeSpace()?.boxes.find(
    box => box.id === id
  );
}


function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function sanitizeHTML(html) {

  const parser = new DOMParser();

  const doc = parser.parseFromString(
    html || "",
    "text/html"
  );

  const allowed = new Set([
    "B",
    "I",
    "U",
    "S",
    "STRONG",
    "EM",
    "H2",
    "H3",
    "P",
    "BR",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "PRE",
    "CODE",
    "A"
  ]);

  [...doc.body.querySelectorAll("*")]
    .forEach(element => {

      if (!allowed.has(element.tagName)) {
        element.replaceWith(
          ...element.childNodes
        );
        return;
      }

      [...element.attributes]
        .forEach(attribute => {

          const name =
            attribute.name.toLowerCase();

          if (
            name.startsWith("on") ||
            name === "style" ||
            name === "class" ||
            name === "id"
          ) {
            element.removeAttribute(
              attribute.name
            );
          }
        });

      if (element.tagName === "A") {

        const href =
          element.getAttribute("href") || "";

        if (
          !/^https?:\/\//i.test(href)
        ) {
          element.removeAttribute("href");
        } else {
          element.setAttribute(
            "target",
            "_blank"
          );

          element.setAttribute(
            "rel",
            "noopener noreferrer"
          );
        }
      }
    });

  return doc.body.innerHTML;
}


function safeURL(value) {

  try {

    const url = new URL(value);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return "";
    }

    return url.href;

  } catch {
    return "";
  }
}


/* =========================================
   TABS
========================================= */

function renderTabs() {

  const tabs = $("#tabs");

  tabs.replaceChildren();

  state.spaces.forEach(space => {

    const tab =
      document.createElement("div");

    tab.className =
      `tab ${
        space.id === state.activeSpaceId
          ? "active"
          : ""
      }`;

    tab.dataset.id = space.id;

    const icon =
      document.createElement("i");

    icon.className =
      "fa-regular fa-window-maximize tab-icon";

    const name =
      document.createElement("div");

    name.className = "tab-name";
    name.textContent = space.name;

    const close =
      document.createElement("button");

    close.className = "tab-close";
    close.title = "Delete Space";

    close.innerHTML =
      '<i class="fa-solid fa-xmark"></i>';

    tab.append(icon, name, close);

    tabs.appendChild(tab);
  });
}


$("#tabs").addEventListener(
  "click",
  event => {

    const tab =
      event.target.closest(".tab");

    if (!tab) return;

    const id = tab.dataset.id;

    if (
      event.target.closest(".tab-close")
    ) {
      deleteSpace(id);
      return;
    }

    state.activeSpaceId = id;

    saveState();

    render();
  }
);


$("#tabs").addEventListener(
  "dblclick",
  event => {

    const tab =
      event.target.closest(".tab");

    if (!tab) return;

    renameSpace(tab.dataset.id);
  }
);


/* =========================================
   RENDER
========================================= */

function render() {

  renderTabs();
  renderBoxes();
  applyTheme();

  const space = activeSpace();

  if (space) {

    const canvas = $("#canvas");

    requestAnimationFrame(() => {

      canvas.scrollLeft =
        space.scrollX || 0;

      canvas.scrollTop =
        space.scrollY || 0;
    });
  }
}


function renderBoxes() {

  const space = activeSpace();

  const container = $("#boxes");
  const empty = $("#emptyState");

  container.replaceChildren();

  if (!space) return;

  empty.classList.toggle(
    "hidden",
    space.boxes.length > 0
  );

  space.boxes
    .sort((a, b) => a.z - b.z)
    .forEach(box => {

      const element =
        createBoxElement(box);

      container.appendChild(element);
    });

  updateCanvasSize();

  requestAnimationFrame(
    renderConnections
  );
}


/* =========================================
   BOX CREATION
========================================= */

function createBoxElement(box) {

  const el =
    document.createElement("article");

  el.className =
    `box ${
      box.type === "parent"
        ? "folder"
        : ""
    }`;

  el.dataset.id = box.id;

  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;

  el.style.zIndex =
    String(box.z || 1);

  const header =
    document.createElement("div");

  header.className = "box-header";

  const type =
    document.createElement("div");

  type.className = "box-type";

  type.innerHTML =
    typeIcon(box.type);

  const title =
    document.createElement("div");

  title.className = "box-title";
  title.textContent = box.title;

  const actions =
    document.createElement("div");

  actions.className = "box-actions";

  const edit =
    makeBoxButton(
      "fa-solid fa-pen",
      "Rename"
    );

  edit.dataset.action = "rename";

  const remove =
    makeBoxButton(
      "fa-solid fa-trash",
      "Delete"
    );

  remove.classList.add("delete");
  remove.dataset.action = "delete";

  actions.append(edit, remove);

  header.append(
    type,
    title,
    actions
  );

  el.appendChild(header);


  if (box.type !== "parent") {

    const parent =
      document.createElement("div");

    parent.className = "box-parent";

    parent.innerHTML =
      createParentSelect(box);

    el.appendChild(parent);
  }


  const body =
    document.createElement("div");

  body.className = "box-body";

  if (box.type === "text") {
    body.appendChild(
      createTextEditor(box)
    );
  }

  if (box.type === "parent") {
    body.appendChild(
      createFolderBody(box)
    );
  }

  if (box.type === "task") {
    body.appendChild(
      createTaskBody(box)
    );
  }

  if (box.type === "link") {
    body.appendChild(
      createLinkBody(box)
    );
  }

  el.appendChild(body);

  return el;
}


function typeIcon(type) {

  if (type === "text")
    return '<i class="fa-solid fa-font"></i>';

  if (type === "parent")
    return '<i class="fa-regular fa-folder"></i>';

  if (type === "task")
    return '<i class="fa-solid fa-list-check"></i>';

  return '<i class="fa-solid fa-link"></i>';
}


function makeBoxButton(icon, title) {

  const button =
    document.createElement("button");

  button.className = "box-btn";

  button.title = title;

  button.innerHTML =
    `<i class="${icon}"></i>`;

  return button;
}


/* =========================================
   PARENT SELECT
========================================= */

function getDescendants(
  space,
  id
) {

  const result = new Set();

  let changed = true;

  while (changed) {

    changed = false;

    space.boxes.forEach(box => {

      if (
        box.parentId === id ||
        result.has(box.parentId)
      ) {
        if (!result.has(box.id)) {
          result.add(box.id);
          changed = true;
        }
      }
    });
  }

  return result;
}


function createParentSelect(box) {

  const space = activeSpace();

  const select =
    document.createElement("select");

  select.className =
    "parent-select";

  select.dataset.action =
    "parent";

  select.innerHTML =
    '<option value="">No parent</option>';

  const descendants =
    getDescendants(
      space,
      box.id
    );

  space.boxes
    .filter(other =>
      other.id !== box.id &&
      other.type === "parent" &&
      !descendants.has(other.id)
    )
    .forEach(other => {

      const option =
        document.createElement("option");

      option.value = other.id;
      option.textContent = other.title;

      if (
        box.parentId === other.id
      ) {
        option.selected = true;
      }

      select.appendChild(option);
    });

  return select.outerHTML;
}


/* =========================================
   TEXT
========================================= */

function createTextEditor(box) {

  const wrapper =
    document.createElement("div");

  const toolbar =
    document.createElement("div");

  toolbar.className =
    "editor-toolbar";

  const tools = [
    ["bold", "fa-solid fa-bold"],
    ["italic", "fa-solid fa-italic"],
    ["underline", "fa-solid fa-underline"],
    ["formatBlock:h2", "fa-solid fa-heading"],
    ["insertUnorderedList", "fa-solid fa-list"],
    ["insertOrderedList", "fa-solid fa-list-ol"],
    ["blockquote", "fa-solid fa-quote-left"],
    ["code", "fa-solid fa-code"],
    ["link", "fa-solid fa-link"]
  ];

  tools.forEach(([command, icon]) => {

    const button =
      document.createElement("button");

    button.className = "tool-btn";

    button.type = "button";

    button.dataset.command =
      command;

    button.innerHTML =
      `<i class="${icon}"></i>`;

    toolbar.appendChild(button);
  });


  const editor =
    document.createElement("div");

  editor.className = "editor";

  editor.contentEditable = "true";

  editor.spellcheck = true;

  editor.innerHTML =
    sanitizeHTML(box.content || "");

  editor.dataset.action =
    "editor";

  wrapper.append(
    toolbar,
    editor
  );

  return wrapper;
}


/* =========================================
   FOLDER
========================================= */

function createFolderBody(box) {

  const wrapper =
    document.createElement("div");

  const description =
    document.createElement("div");

  description.className =
    "no-children";

  const children =
    activeSpace().boxes
      .filter(child =>
        child.parentId === box.id
      );

  if (!children.length) {

    description.textContent =
      "No connected boxes yet.";

    wrapper.appendChild(description);

    return wrapper;
  }

  description.textContent =
    `${children.length} connected ${
      children.length === 1
        ? "box"
        : "boxes"
    }`;

  const list =
    document.createElement("div");

  list.className =
    "folder-children";

  children.forEach(child => {

    const tag =
      document.createElement("div");

    tag.className = "child-tag";

    tag.textContent =
      child.title;

    list.appendChild(tag);
  });

  wrapper.append(
    description,
    list
  );

  return wrapper;
}


/* =========================================
   TASKS
========================================= */

function createTaskBody(box) {

  const wrapper =
    document.createElement("div");

  const list =
    document.createElement("div");

  list.className =
    "task-list";

  box.tasks.forEach(task => {

    const row =
      document.createElement("div");

    row.className =
      `task ${
        task.done ? "done" : ""
      }`;

    row.dataset.taskId =
      task.id;

    const check =
      document.createElement("input");

    check.type = "checkbox";
    check.className = "task-check";
    check.checked = task.done;

    const text =
      document.createElement("div");

    text.className = "task-text";

    text.contentEditable = "true";

    text.textContent = task.text;

    const remove =
      document.createElement("button");

    remove.className =
      "task-remove";

    remove.dataset.action =
      "remove-task";

    remove.innerHTML =
      '<i class="fa-solid fa-xmark"></i>';

    row.append(
      check,
      text,
      remove
    );

    list.appendChild(row);
  });


  const add =
    document.createElement("button");

  add.className = "add-task";

  add.dataset.action =
    "add-task";

  add.innerHTML =
    '<i class="fa-solid fa-plus"></i> Add task';

  wrapper.append(
    list,
    add
  );

  return wrapper;
}


/* =========================================
   LINKS
========================================= */

function createLinkBody(box) {

  const wrapper =
    document.createElement("div");

  const row =
    document.createElement("div");

  row.className = "link-row";

  const input =
    document.createElement("input");

  input.className = "link-input";

  input.type = "url";

  input.placeholder =
    "https://example.com";

  input.value = box.url || "";

  input.dataset.action =
    "link-input";

  const go =
    document.createElement("button");

  go.className = "link-go";

  go.dataset.action =
    "open-link";

  go.innerHTML =
    '<i class="fa-solid fa-arrow-up-right-from-square"></i>';

  row.append(
    input,
    go
  );

  wrapper.appendChild(row);

  if (box.url) {

    const safe =
      safeURL(box.url);

    if (safe) {

      const preview =
        document.createElement("div");

      preview.className =
        "link-preview";

      const title =
        document.createElement("div");

      title.className =
        "link-preview-title";

      title.textContent =
        getDomain(safe);

      const url =
        document.createElement("div");

      url.className =
        "link-preview-url";

      url.textContent =
        safe;

      preview.append(
        title,
        url
      );

      const media =
        getEmbedURL(safe);

      if (media) {

        const iframe =
          document.createElement("iframe");

        iframe.className =
          "embed";

        iframe.src = media;

        iframe.loading =
          "lazy";

        iframe.allowFullscreen = true;

        iframe.setAttribute(
          "referrerpolicy",
          "strict-origin-when-cross-origin"
        );

        preview.appendChild(
          iframe
        );
      }

      wrapper.appendChild(
        preview
      );
    }
  }

  return wrapper;
}


function getDomain(url) {

  try {
    return new URL(url).hostname;
  } catch {
    return "Link";
  }
}


function getEmbedURL(url) {

  try {

    const parsed =
      new URL(url);

    if (
      parsed.hostname.includes(
        "youtube.com"
      )
    ) {

      const id =
        parsed.searchParams.get("v");

      if (id) {
        return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      }
    }

    if (
      parsed.hostname ===
        "youtu.be"
    ) {

      const id =
        parsed.pathname.slice(1);

      if (id) {
        return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      }
    }

    if (
      parsed.hostname.includes(
        "vimeo.com"
      )
    ) {

      const id =
        parsed.pathname.split("/")[1];

      if (/^\d+$/.test(id)) {
        return `https://player.vimeo.com/video/${id}`;
      }
    }

  } catch {}

  return "";
}


/* =========================================
   ADD BOX
========================================= */

function addBox(type) {

  const space = activeSpace();

  if (!space) return;

  const offset =
    100 + (space.boxes.length % 5) * 45;

  const box =
    createBox(
      type,
      offset,
      offset
    );

  space.boxes.push(box);

  saveState();
  render();

  showToast(
    `${capitalize(type)} added.`
  );
}


function capitalize(text) {

  return text.charAt(0).toUpperCase() +
    text.slice(1);
}


document.addEventListener(
  "click",
  event => {

    const add =
      event.target.closest(
        "[data-add]"
      );

    if (add) {
      addBox(add.dataset.add);
    }
  }
);


/* =========================================
   BOX EVENTS
========================================= */

$("#boxes").addEventListener(
  "click",
  event => {

    const boxEl =
      event.target.closest(".box");

    if (!boxEl) return;

    const box =
      getBox(boxEl.dataset.id);

    if (!box) return;

    const action =
      event.target.closest(
        "[data-action]"
      )?.dataset.action;

    if (action === "delete") {
      deleteBox(box.id);
    }

    if (action === "rename") {
      renameBox(box.id);
    }

    if (action === "add-task") {

      box.tasks.push({
        id: uid("task"),
        text: "New task",
        done: false
      });

      saveState();
      renderBoxes();
    }

    if (action === "remove-task") {

      const task =
        event.target.closest(".task");

      if (!task) return;

      box.tasks =
        box.tasks.filter(
          item =>
            item.id !==
            task.dataset.taskId
        );

      saveState();
      renderBoxes();
    }

    if (action === "open-link") {

      const url =
        safeURL(box.url);

      if (url) {
        window.open(
          url,
          "_blank",
          "noopener,noreferrer"
        );
      } else {
        showToast(
          "Enter a valid HTTP or HTTPS URL.",
          true
        );
      }
    }
  }
);


/* =========================================
   CHANGE EVENTS
========================================= */

$("#boxes").addEventListener(
  "change",
  event => {

    const boxEl =
      event.target.closest(".box");

    if (!boxEl) return;

    const box =
      getBox(boxEl.dataset.id);

    if (!box) return;

    if (
      event.target.matches(
        ".parent-select"
      )
    ) {

      box.parentId =
        event.target.value || null;

      saveState();
      renderBoxes();
      return;
    }

    if (
      event.target.matches(
        ".task-check"
      )
    ) {

      const task =
        event.target.closest(".task");

      const item =
        box.tasks.find(
          taskData =>
            taskData.id ===
            task.dataset.taskId
        );

      if (item) {
        item.done =
          event.target.checked;
      }

      saveState();

      task.classList.toggle(
        "done",
        event.target.checked
      );

      renderConnections();
    }
  }
);


/* =========================================
   INPUT EVENTS
========================================= */

$("#boxes").addEventListener(
  "input",
  event => {

    const boxEl =
      event.target.closest(".box");

    if (!boxEl) return;

    const box =
      getBox(boxEl.dataset.id);

    if (!box) return;

    if (
      event.target.matches(".editor")
    ) {

      box.content =
        sanitizeHTML(
          event.target.innerHTML
        );

      saveState();
    }

    if (
      event.target.matches(".task-text")
    ) {

      const task =
        event.target.closest(".task");

      const item =
        box.tasks.find(
          taskData =>
            taskData.id ===
            task.dataset.taskId
        );

      if (item) {
        item.text =
          event.target.textContent;
      }

      saveState();
    }

    if (
      event.target.matches(
        ".link-input"
      )
    ) {

      box.url =
        event.target.value.trim();

      saveState();
    }
  }
);


/* =========================================
   RICH TOOLBAR
========================================= */

$("#boxes").addEventListener(
  "mousedown",
  event => {

    const button =
      event.target.closest(
        ".tool-btn"
      );

    if (!button) return;

    event.preventDefault();

    const editor =
      button
        .closest(".editor-toolbar")
        ?.nextElementSibling;

    if (!editor) return;

    editor.focus();

    const command =
      button.dataset.command;

    if (command === "code") {

      document.execCommand(
        "formatBlock",
        false,
        "pre"
      );

    } else if (
      command === "blockquote"
    ) {

      document.execCommand(
        "formatBlock",
        false,
        "blockquote"
      );

    } else if (
      command.startsWith("formatBlock:")
    ) {

      document.execCommand(
        "formatBlock",
        false,
        command.split(":")[1]
      );

    } else if (command === "link") {

      const url =
        window.prompt
          ? null
          : null;

      const link =
        safeURL(
          promptForLink()
        );

      if (link) {

        document.execCommand(
          "createLink",
          false,
          link
        );
      }

    } else {

      document.execCommand(
        command,
        false,
        null
      );
    }

    const boxEl =
      button.closest(".box");

    if (boxEl) {

      const box =
        getBox(boxEl.dataset.id);

      if (box) {

        box.content =
          sanitizeHTML(
            editor.innerHTML
          );

        saveState();
      }
    }
  }
);


function promptForLink() {

  /*
   * Rich text link uses the browser's
   * input only as a tiny fallback.
   *
   * Main application popups remain custom.
   */

  return window.prompt(
    "Link URL",
    "https://"
  ) || "";
}


/* =========================================
   DRAGGING
========================================= */

let drag = null;

$("#boxes").addEventListener(
  "pointerdown",
  event => {

    const header =
      event.target.closest(
        ".box-header"
      );

    if (!header) return;

    if (
      event.target.closest(
        ".box-btn"
      )
    ) return;

    const boxEl =
      header.closest(".box");

    const box =
      getBox(boxEl.dataset.id);

    if (!box) return;

    event.preventDefault();

    const startX =
      event.clientX;

    const startY =
      event.clientY;

    const original = [];

    const space = activeSpace();

    const moving =
      new Set([
        box.id,
        ...getDescendants(
          space,
          box.id
        )
      ]);

    moving.forEach(id => {

      const target =
        getBox(id);

      if (!target) return;

      original.push({
        id,
        x: target.x,
        y: target.y
      });
    });

    drag = {
      boxEl,
      startX,
      startY,
      original,
      moving
    };

    boxEl.classList.add(
      "dragging"
    );

    boxEl.setPointerCapture(
      event.pointerId
    );
  }
);


$("#boxes").addEventListener(
  "pointermove",
  event => {

    if (!drag) return;

    const dx =
      event.clientX -
      drag.startX;

    const dy =
      event.clientY -
      drag.startY;

    const space =
      activeSpace();

    drag.original.forEach(item => {

      const box =
        getBox(item.id);

      if (!box) return;

      box.x =
        Math.max(
          0,
          Math.round(item.x + dx)
        );

      box.y =
        Math.max(
          0,
          Math.round(item.y + dy)
        );

      const element =
        $(
          `.box[data-id="${CSS.escape(box.id)}"]`
        );

      if (element) {

        element.style.left =
          `${box.x}px`;

        element.style.top =
          `${box.y}px`;
      }
    });

    updateCanvasSize();

    renderConnections();
  }
);


$("#boxes").addEventListener(
  "pointerup",
  event => {

    if (!drag) return;

    drag.boxEl.classList.remove(
      "dragging"
    );

    saveState();

    drag = null;
  }
);


$("#boxes").addEventListener(
  "pointercancel",
  () => {

    if (!drag) return;

    drag.boxEl.classList.remove(
      "dragging"
    );

    drag = null;

    renderBoxes();
  }
);


/* =========================================
   CONNECTIONS
========================================= */

function renderConnections() {

  const svg =
    $("#connections");

  if (!svg) return;

  svg.replaceChildren();

  const space =
    activeSpace();

  if (!space) return;

  space.boxes.forEach(child => {

    if (!child.parentId) return;

    const parent =
      getBox(child.parentId);

    if (!parent) return;

    const childEl =
      $(
        `.box[data-id="${CSS.escape(child.id)}"]`
      );

    const parentEl =
      $(
        `.box[data-id="${CSS.escape(parent.id)}"]`
      );

    if (!childEl || !parentEl) return;

    const childX =
      child.x +
      childEl.offsetWidth / 2;

    const childY =
      child.y;

    const parentX =
      parent.x +
      parentEl.offsetWidth / 2;

    const parentY =
      parent.y +
      parentEl.offsetHeight;

    const middleY =
      (childY + parentY) / 2;

    const path =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );

    path.classList.add(
      "connection-path"
    );

    path.setAttribute(
      "d",
      `
      M ${parentX} ${parentY}
      C ${parentX} ${middleY},
        ${childX} ${middleY},
        ${childX} ${childY}
      `
    );

    svg.appendChild(path);

    const dot =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );

    dot.classList.add(
      "connection-dot"
    );

    dot.setAttribute(
      "cx",
      childX
    );

    dot.setAttribute(
      "cy",
      childY
    );

    dot.setAttribute(
      "r",
      "3"
    );

    svg.appendChild(dot);
  });
}


function updateCanvasSize() {

  const space =
    activeSpace();

  if (!space) return;

  const inner =
    $("#canvasInner");

  if (!inner) return;

  let width = 2400;
  let height = 1600;

  space.boxes.forEach(box => {

    width =
      Math.max(
        width,
        box.x + 500
      );

    height =
      Math.max(
        height,
        box.y + 400
      );
  });

  inner.style.width =
    `${width}px`;

  inner.style.height =
    `${height}px`;
}


/* =========================================
   SPACE SCROLL
========================================= */

$("#canvas").addEventListener(
  "scroll",
  () => {

    const space =
      activeSpace();

    if (!space) return;

    space.scrollX =
      $("#canvas").scrollLeft;

    space.scrollY =
      $("#canvas").scrollTop;

    saveState();
  }
);


/* =========================================
   SPACE MODALS
========================================= */

$("#addSpaceBtn").addEventListener(
  "click",
  () => {

    openModal({
      title: "New Space",
      icon: "fa-solid fa-plus",
      text: "Give your new Space a name.",
      input: true,
      placeholder: "Space name",
      buttons: [
        {
          label: "Cancel",
          className: "ghost",
          close: true
        },
        {
          label: "Create",
          className: "primary",
          action: value => {

            const name =
              value.trim() ||
              `Space ${
                state.spaces.length + 1
              }`;

            const space =
              createSpace(name);

            state.spaces.push(space);

            state.activeSpaceId =
              space.id;

            saveState();
            render();

            showToast(
              "Space created."
            );
          }
        }
      ]
    });
  }
);


function renameSpace(id) {

  const space =
    state.spaces.find(
      item => item.id === id
    );

  if (!space) return;

  openModal({
    title: "Rename Space",
    icon: "fa-solid fa-pen",
    text: "Choose a new name for this Space.",
    input: true,
    value: space.name,
    placeholder: "Space name",
    buttons: [
      {
        label: "Cancel",
        className: "ghost",
        close: true
      },
      {
        label: "Save",
        className: "primary",
        action: value => {

          const name =
            value.trim();

          if (!name) {
            showToast(
              "Name cannot be empty.",
              true
            );
            return false;
          }

          space.name =
            name.slice(0, 80);

          saveState();
          render();

          showToast(
            "Space renamed."
          );
        }
      }
    ]
  });
}


/* =========================================
   BOX MODALS
========================================= */

function renameBox(id) {

  const box = getBox(id);

  if (!box) return;

  openModal({
    title: "Rename Box",
    icon: "fa-solid fa-pen",
    text: "Choose a name for this box.",
    input: true,
    value: box.title,
    placeholder: "Box name",
    buttons: [
      {
        label: "Cancel",
        className: "ghost",
        close: true
      },
      {
        label: "Save",
        className: "primary",
        action: value => {

          const name =
            value.trim();

          if (!name) {
            showToast(
              "Name cannot be empty.",
              true
            );
            return false;
          }

          box.title =
            name.slice(0, 120);

          saveState();
          renderBoxes();

          showToast(
            "Box renamed."
          );
        }
      }
    ]
  });
}


function deleteBox(id) {

  const space =
    activeSpace();

  const box =
    getBox(id);

  if (!box) return;

  openModal({
    title: "Delete Box",
    icon: "fa-solid fa-trash",
    text:
      `Delete "${box.title}"? This cannot be undone.`,
    buttons: [
      {
        label: "Cancel",
        className: "ghost",
        close: true
      },
      {
        label: "Continue",
        className: "danger",
        action: () => {

          space.boxes =
            space.boxes.filter(
              item => item.id !== id
            );

          space.boxes.forEach(item => {

            if (
              item.parentId === id
            ) {
              item.parentId = null;
            }
          });

          saveState();
          render();

          showToast(
            "Box deleted."
          );
        }
      }
    ]
  });
}


/* =========================================
   DELETE SPACE - MULTI STEP
========================================= */

function deleteSpace(id) {

  if (state.spaces.length <= 1) {

    showToast(
      "You must keep at least one Space.",
      true
    );

    return;
  }

  const space =
    state.spaces.find(
      item => item.id === id
    );

  if (!space) return;

  openModal({
    title: "Delete Space",
    icon: "fa-solid fa-triangle-exclamation",
    step: "Step 1 of 3",
    text:
      `You're about to delete "${space.name}". All boxes inside it will be removed.`,
    buttons: [
      {
        label: "Cancel",
        className: "ghost",
        close: true
      },
      {
        label: "Continue",
        className: "danger",
        action: () => {

          openModal({
            title: "Confirm Space",
            icon: "fa-solid fa-shield-halved",
            step: "Step 2 of 3",
            text:
              "This action cannot be undone. Continue to the final confirmation?",
            buttons: [
              {
                label: "Cancel",
                className: "ghost",
                close: true
              },
              {
                label: "Continue",
                className: "danger",
                action: () => {

                  openModal({
                    title: "Final Confirmation",
                    icon: "fa-solid fa-trash-can",
                    step: "Step 3 of 3",
                    text:
                      `Final confirmation: permanently delete "${space.name}"?`,
                    buttons: [
                      {
                        label: "Keep Space",
                        className: "ghost",
                        close: true
                      },
                      {
                        label: "Delete Permanently",
                        className: "danger",
                        action: () => {

                          state.spaces =
                            state.spaces.filter(
                              item =>
                                item.id !== id
                            );

                          state.activeSpaceId =
                            state.spaces[0].id;

                          saveState();
                          render();

                          showToast(
                            "Space deleted."
                          );
                        }
                      }
                    ]
                  });
                }
              }
            ]
          });
        }
      }
    ]
  });
}


/* =========================================
   CUSTOM MODAL
========================================= */

let activeModalCleanup = null;

function openModal(options) {

  closeModal();

  const root =
    $("#modalRoot");

  const modal =
    document.createElement("div");

  modal.className = "modal";

  const card =
    document.createElement("div");

  card.className =
    "modal-card";

  const head =
    document.createElement("div");

  head.className =
    "modal-head";

  const icon =
    document.createElement("div");

  icon.className =
    "modal-icon";

  icon.innerHTML =
    `<i class="${options.icon || "fa-solid fa-window-maximize"}"></i>`;

  const titleWrap =
    document.createElement("div");

  const title =
    document.createElement("div");

  title.className =
    "modal-title";

  title.textContent =
    options.title || "Space Chi";

  titleWrap.appendChild(title);

  if (options.step) {

    const step =
      document.createElement("div");

    step.className =
      "modal-step";

    step.textContent =
      options.step;

    titleWrap.appendChild(step);
  }

  head.append(
    icon,
    titleWrap
  );


  const body =
    document.createElement("div");

  body.className =
    "modal-body";

  const text =
    document.createElement("div");

  text.className =
    "modal-text";

  text.textContent =
    options.text || "";

  body.appendChild(text);


  let input = null;

  if (options.input) {

    input =
      document.createElement("input");

    input.className =
      "modal-input";

    input.type =
      "text";

    input.placeholder =
      options.placeholder || "";

    input.value =
      options.value || "";

    body.appendChild(input);
  }


  const actions =
    document.createElement("div");

  actions.className =
    "modal-actions";


  (options.buttons || [])
    .forEach(buttonData => {

      const button =
        document.createElement("button");

      button.className =
        `btn ${
          buttonData.className || ""
        }`;

      button.textContent =
        buttonData.label;

      button.addEventListener(
        "click",
        () => {

          let result;

          if (buttonData.action) {

            result =
              buttonData.action(
                input?.value || ""
              );
          }

          if (
            buttonData.close !== false &&
            result !== false
          ) {
            closeModal();
          }
        }
      );

      actions.appendChild(button);
    });


  card.append(
    head,
    body,
    actions
  );

  modal.appendChild(card);

  root.appendChild(modal);

  const closeOnEscape =
    event => {

      if (
        event.key === "Escape"
      ) {
        closeModal();
      }
    };

  document.addEventListener(
    "keydown",
    closeOnEscape
  );

  activeModalCleanup = () => {
    document.removeEventListener(
      "keydown",
      closeOnEscape
    );
  };

  if (input) {

    requestAnimationFrame(() => {

      input.focus();

      input.select();
    });
  }
}


function closeModal() {

  if (activeModalCleanup) {
    activeModalCleanup();
    activeModalCleanup = null;
  }

  $("#modalRoot")
    .replaceChildren();
}


/* =========================================
   IMPORT / EXPORT
========================================= */

$("#exportBtn").addEventListener(
  "click",
  () => {

    const data = {
      ...state,

      exportedAt:
        new Date().toISOString(),

      application:
        "Space Chi"
    };

    downloadJSON(
      data,
      "space-chi-workspace.json"
    );

    showToast(
      "Workspace exported."
    );
  }
);


function downloadJSON(data, filename) {

  const blob =
    new Blob(
      [
        JSON.stringify(
          data,
          null,
          2
        )
      ],
      {
        type:
          "application/json"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);

  a.click();

  a.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}


$("#importBtn").addEventListener(
  "click",
  () => {

    $("#importInput").click();
  }
);


$("#importInput").addEventListener(
  "change",
  event => {

    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      file.size >
      8 * 1024 * 1024
    ) {

      showToast(
        "JSON file is too large.",
        true
      );

      event.target.value = "";

      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {

      try {

        const parsed =
          JSON.parse(
            reader.result
          );

        const imported =
          normalizeState(parsed);

        const boxCount =
          imported.spaces.reduce(
            (sum, space) =>
              sum + space.boxes.length,
            0
          );

        openImportChoice(
          imported,
          boxCount
        );

      } catch {

        showToast(
          "Invalid JSON workspace.",
          true
        );
      }

      event.target.value = "";
    };

    reader.readAsText(file);
  }
);


function openImportChoice(
  imported,
  boxCount
) {

  openModal({
    title: "Import Workspace",
    icon: "fa-solid fa-file-import",
    step: "Step 1 of 2",
    text:
      `Found ${imported.spaces.length} Space(s) and ${boxCount} box(es). Choose how to import them.`,
    buttons: [
      {
        label: "Cancel",
        className: "ghost",
        close: true
      },
      {
        label: "Add Spaces",
        className: "",
        action: () => {

          openModal({
            title: "Add Imported Spaces",
            icon: "fa-solid fa-layer-group",
            step: "Step 2 of 2",
            text:
              "Imported Spaces will be added to your existing workspace.",
            buttons: [
              {
                label: "Cancel",
                className: "ghost",
                close: true
              },
              {
                label: "Add",
                className: "primary",
                action: () => {

                  const existing =
                    new Set(
                      state.spaces.map(
                        space =>
                          space.id
                      )
                    );

                  imported.spaces.forEach(
                    space => {

                      if (
                        existing.has(
                          space.id
                        )
                      ) {
                        space.id =
                          uid("space");
                      }

                      space.boxes.forEach(
                        box => {

                          if (
                            existing.has(
                              box.id
                            )
                          ) {
                            box.id =
                              uid("box");
                          }
                        }
                      );

                      state.spaces.push(
                        space
                      );
                    }
                  );

                  state.activeSpaceId =
                    imported.spaces[0].id;

                  saveState();
                  render();

                  showToast(
                    "Spaces imported."
                  );
                }
              }
            ]
          });
        }
      },
      {
        label: "Replace",
        className: "danger",
        action: () => {

          openModal({
            title: "Replace Workspace",
            icon: "fa-solid fa-triangle-exclamation",
            step: "Step 2 of 2",
            text:
              "Your current workspace will be replaced by the imported JSON. Continue?",
            buttons: [
              {
                label: "Cancel",
                className: "ghost",
                close: true
              },
              {
                label: "Replace",
                className: "danger",
                action: () => {

                  Object.assign(
                    state,
                    imported
                  );

                  saveState();
                  render();

                  showToast(
                    "Workspace replaced."
                  );
                }
              }
            ]
          });
        }
      }
    ]
  });
}


/* =========================================
   THEME
========================================= */

function applyTheme() {

  document.documentElement
    .dataset.theme =
      state.theme;

  const button =
    $("#themeBtn");

  if (!button) return;

  button.innerHTML =
    state.theme === "dark"
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';

  button.title =
    state.theme === "dark"
      ? "Switch to Light"
      : "Switch to Dark";
}


$("#themeBtn").addEventListener(
  "click",
  () => {

    state.theme =
      state.theme === "dark"
        ? "light"
        : "dark";

    saveState();
    applyTheme();
  }
);


/* =========================================
   FULLSCREEN
========================================= */

$("#fullscreenBtn").addEventListener(
  "click",
  toggleFullscreen
);


async function toggleFullscreen() {

  try {

    if (!document.fullscreenElement) {

      await document.documentElement
        .requestFullscreen();

    } else {

      await document.exitFullscreen();
    }

  } catch {

    showToast(
      "Fullscreen is not available.",
      true
    );
  }
}


document.addEventListener(
  "fullscreenchange",
  () => {

    const button =
      $("#fullscreenBtn");

    if (!button) return;

    const active =
      Boolean(
        document.fullscreenElement
      );

    button.innerHTML =
      active
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';

    button.title =
      active
        ? "Exit Fullscreen"
        : "Fullscreen";
  }
);


/* =========================================
   MOBILE MORE
========================================= */

$("#mobileMoreBtn").addEventListener(
  "click",
  () => {

    openModal({
      title: "Space Chi",
      icon: "fa-solid fa-ellipsis",
      text:
        "Workspace actions",
      buttons: [
        {
          label: "Import JSON",
          action: () => {
            $("#importInput").click();
          }
        },
        {
          label: "Export JSON",
          action: () => {
            $("#exportBtn").click();
          }
        },
        {
          label:
            "Toggle Theme",
          action: () => {
            $("#themeBtn").click();
          }
        },
        {
          label:
            "Fullscreen",
          action: () => {
            toggleFullscreen();
          }
        }
      ]
    });
  }
);


/* =========================================
   TOAST
========================================= */

let toastTimer = null;

function showToast(
  message,
  error = false
) {

  const toast =
    $("#toast");

  toast.textContent =
    message;

  toast.classList.toggle(
    "error",
    error
  );

  toast.classList.add(
    "show"
  );

  clearTimeout(toastTimer);

  toastTimer =
    setTimeout(
      () => {
        toast.classList.remove(
          "show"
        );
      },
      2200
    );
}


/* =========================================
   KEYBOARD
========================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "e"
    ) {

      event.preventDefault();

      $("#exportBtn").click();
    }

    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "o"
    ) {

      event.preventDefault();

      $("#importBtn").click();
    }

    if (
      event.key === "Escape" &&
      document.fullscreenElement
    ) {

      document.exitFullscreen();
    }
  }
);


/* =========================================
   INITIALIZE
========================================= */

loadState();

render();

window.addEventListener(
  "resize",
  () => {
    updateCanvasSize();
    renderConnections();
  }
);

console.log(
  "Space Chi initialized."
);
