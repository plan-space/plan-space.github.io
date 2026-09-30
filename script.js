"use strict";

/*
  CHI SPACE
  ----------
  Local-first workspace.

  Features:
  - Multiple Spaces
  - Text
  - Note
  - Task
  - Link
  - Folder
  - Dragging
  - Parent relationships
  - JSON export
  - LocalStorage persistence
*/


const STORAGE_KEY = "chi_space_v1";


/* =====================================================
   STATE
===================================================== */

let state = {
  spaces: [],
  activeSpaceId: null,
  counters: {
    space: 0,
    box: 0,
    task: 0
  }
};

let dragState = null;
let toastTimer = null;
let confirmAction = null;


/* =====================================================
   DOM
===================================================== */

const tabsEl = document.getElementById("tabs");
const workspaceEl = document.getElementById("workspace");
const toastEl = document.getElementById("toast");

const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmText = document.getElementById("confirmText");
const cancelConfirm = document.getElementById("cancelConfirm");
const acceptConfirm = document.getElementById("acceptConfirm");


/* =====================================================
   HELPERS
===================================================== */

function uid(prefix) {
  state.counters[prefix]++;

  return `${prefix}_${state.counters[prefix]}_${Date.now()
    .toString(36)
    .slice(-5)}`;
}


function activeSpace() {
  return state.spaces.find(
    space => space.id === state.activeSpaceId
  );
}


function getSpace(id) {
  return state.spaces.find(
    space => space.id === id
  );
}


function getBox(spaceId, boxId) {
  const space = getSpace(spaceId);

  return space?.boxes.find(
    box => box.id === boxId
  );
}


function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function showToast(message) {
  toastEl.textContent = message;

  toastEl.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 1800);
}


/* =====================================================
   STORAGE
===================================================== */

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}


function load() {

  try {

    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      createInitialState();
      return;
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      !Array.isArray(parsed.spaces)
    ) {
      createInitialState();
      return;
    }

    state = parsed;

    if (!state.counters) {
      state.counters = {
        space: 0,
        box: 0,
        task: 0
      };
    }

    if (!state.activeSpaceId && state.spaces.length) {
      state.activeSpaceId = state.spaces[0].id;
    }

  } catch {
    createInitialState();
  }
}


function createInitialState() {

  state = {
    spaces: [],
    activeSpaceId: null,

    counters: {
      space: 0,
      box: 0,
      task: 0
    }
  };

  createSpace("Space 1");
}


/* =====================================================
   SPACES
===================================================== */

function createSpace(name = null) {

  const id = uid("space");

  const space = {
    id,
    name: name || `Space ${state.spaces.length + 1}`,
    boxes: []
  };

  state.spaces.push(space);

  state.activeSpaceId = id;

  save();

  render();

  return id;
}


function renameSpace(spaceId) {

  const space = getSpace(spaceId);

  if (!space) return;

  const newName = prompt(
    "Space name:",
    space.name
  );

  if (newName === null) return;

  const clean = newName.trim();

  if (!clean) return;

  space.name = clean;

  save();

  render();
}


function requestDeleteSpace(spaceId) {

  const space = getSpace(spaceId);

  if (!space) return;

  if (state.spaces.length <= 1) {
    showToast("You need at least one Space");
    return;
  }

  openConfirm(
    "Delete Space",
    `Delete "${space.name}" and all of its boxes?`,
    () => deleteSpace(spaceId)
  );
}


function deleteSpace(spaceId) {

  const index = state.spaces.findIndex(
    space => space.id === spaceId
  );

  if (index === -1) return;

  state.spaces.splice(index, 1);

  if (state.activeSpaceId === spaceId) {

    const next =
      state.spaces[index] ||
      state.spaces[index - 1] ||
      state.spaces[0];

    state.activeSpaceId = next?.id || null;
  }

  save();

  render();

  showToast("Space deleted");
}


/* =====================================================
   BOX
===================================================== */

const TYPE_CONFIG = {

  text: {
    icon: "fa-align-left",
    label: "Text"
  },

  note: {
    icon: "fa-note-sticky",
    label: "Note"
  },

  task: {
    icon: "fa-list-check",
    label: "Task"
  },

  link: {
    icon: "fa-link",
    label: "Link"
  },

  folder: {
    icon: "fa-folder",
    label: "Folder"
  }

};


function addBox(type) {

  const space = activeSpace();

  if (!space) return;

  const box = {

    id: uid("box"),

    type,

    title: "",

    x: 80 + Math.random() * 400,

    y: 80 + Math.random() * 300,

    parentId: null,

    content: "",

    tasks: [],

    url: ""

  };

  space.boxes.push(box);

  save();

  renderSpace(space.id);

  requestAnimationFrame(() => {

    const el = document.getElementById(box.id);

    if (el) {

      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center"
      });

      const title =
        el.querySelector(".box-title");

      title?.focus();
    }

  });
}


function requestDeleteBox(spaceId, boxId) {

  openConfirm(
    "Delete Box",
    "This box and its content will be permanently removed.",
    () => deleteBox(spaceId, boxId)
  );
}


function deleteBox(spaceId, boxId) {

  const space = getSpace(spaceId);

  if (!space) return;

  space.boxes =
    space.boxes.filter(
      box => box.id !== boxId
    );

  /*
    Remove child relationships.
  */

  space.boxes.forEach(box => {

    if (box.parentId === boxId) {
      box.parentId = null;
    }

  });

  save();

  renderSpace(spaceId);

  showToast("Box deleted");
}


/* =====================================================
   RENDER
===================================================== */

function render() {

  renderTabs();

  renderWorkspace();
}


function renderTabs() {

  tabsEl.innerHTML = "";

  state.spaces.forEach(space => {

    const tab =
      document.createElement("div");

    tab.className =
      "tab" +
      (
        space.id === state.activeSpaceId
          ? " active"
          : ""
      );

    tab.dataset.spaceId = space.id;

    tab.innerHTML = `

      <i class="fa-regular fa-window-maximize tab-icon"></i>

      <span class="tab-name">
        ${escapeHTML(space.name)}
      </span>

      <div class="tab-actions">

        <button
          class="tab-action"
          data-action="rename"
          title="Rename"
        >
          <i class="fa-solid fa-pen"></i>
        </button>

        <button
          class="tab-action"
          data-action="export"
          title="Export"
        >
          <i class="fa-solid fa-download"></i>
        </button>

        <button
          class="tab-action delete"
          data-action="delete"
          title="Delete"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

      </div>
    `;

    tabsEl.appendChild(tab);
  });
}


function renderWorkspace() {

  workspaceEl.innerHTML = "";

  state.spaces.forEach(space => {

    const spaceEl =
      document.createElement("section");

    spaceEl.className =
      "space" +
      (
        space.id === state.activeSpaceId
          ? " active"
          : ""
      );

    spaceEl.id = `space-${space.id}`;

    spaceEl.innerHTML = `

      <div class="canvas" data-space="${space.id}">

        <div class="canvas-inner">

          ${
            space.boxes.length
              ? ""
              : `
                <div class="empty">
                  <div class="empty-icon">
                    <i class="fa-solid fa-layer-group"></i>
                  </div>

                  <div class="empty-text">
                    Add a box to start building this Space
                  </div>
                </div>
              `
          }

        </div>

      </div>
    `;

    workspaceEl.appendChild(spaceEl);

    renderBoxes(space);
  });
}


function renderSpace(spaceId) {

  const space = getSpace(spaceId);

  if (!space) return;

  const old =
    document.getElementById(
      `space-${spaceId}`
    );

  if (old) {
    old.remove();
  }

  const spaceEl =
    document.createElement("section");

  spaceEl.className =
    "space" +
    (
      space.id === state.activeSpaceId
        ? " active"
        : ""
    );

  spaceEl.id = `space-${space.id}`;

  spaceEl.innerHTML = `

    <div class="canvas" data-space="${space.id}">

      <div class="canvas-inner">

        ${
          space.boxes.length
            ? ""
            : `
              <div class="empty">

                <div class="empty-icon">
                  <i class="fa-solid fa-layer-group"></i>
                </div>

                <div class="empty-text">
                  Add a box to start building this Space
                </div>

              </div>
            `
        }

      </div>

    </div>
  `;

  workspaceEl.appendChild(spaceEl);

  renderBoxes(space);
}


function renderBoxes(space) {

  const inner =
    document.querySelector(
      `#space-${space.id} .canvas-inner`
    );

  if (!inner) return;

  space.boxes.forEach(box => {

    inner.appendChild(
      createBoxElement(
        space,
        box
      )
    );

  });

  updateAllParents(space.id);
}


/* =====================================================
   CREATE BOX
===================================================== */

function createBoxElement(space, box) {

  const el =
    document.createElement("article");

  el.className =
    "box" +
    (
      box.type === "folder"
        ? " folder"
        : ""
    );

  el.id = box.id;

  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;

  const config =
    TYPE_CONFIG[box.type] ||
    TYPE_CONFIG.text;


  let body = "";


  /* TEXT */

  if (box.type === "text") {

    body = `

      <div class="box-body">

        <div
          class="editor"
          contenteditable="true"
          data-editor="text"
        >${box.content || ""}</div>

      </div>

      <div class="toolbar">

        <button class="tool-btn" data-format="bold">
          <i class="fa-solid fa-bold"></i>
        </button>

        <button class="tool-btn" data-format="italic">
          <i class="fa-solid fa-italic"></i>
        </button>

        <button class="tool-btn" data-format="insertUnorderedList">
          <i class="fa-solid fa-list-ul"></i>
        </button>

        <button class="tool-btn" data-link>
          <i class="fa-solid fa-link"></i>
        </button>

      </div>
    `;
  }


  /* NOTE */

  else if (box.type === "note") {

    body = `

      <div class="box-body">

        <div
          class="note-editor"
          contenteditable="true"
          data-editor="note"
        >${escapeHTML(box.content || "")}</div>

      </div>
    `;
  }


  /* TASK */

  else if (box.type === "task") {

    body = `

      <div class="box-body">

        <div class="task-list"></div>

        <button class="add-task">
          <i class="fa-solid fa-plus"></i>
          Add task
        </button>

      </div>
    `;
  }


  /* LINK */

  else if (box.type === "link") {

    body = `

      <div class="box-body">

        <div class="link-row">

          <input
            class="link-input"
            type="url"
            placeholder="https://example.com"
            value="${escapeHTML(box.url || "")}"
          >

          <button class="link-go">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </button>

        </div>

        <div class="link-result"></div>

      </div>
    `;
  }


  /* FOLDER */

  else if (box.type === "folder") {

    body = `

      <div
        class="folder-children"
        data-children
      ></div>
    `;
  }


  const parentSelector =
    box.type !== "folder"
      ? `

        <div class="parent-row">

          <span>Folder</span>

          <select class="parent-select">

            <option value="">
              No folder
            </option>

          </select>

        </div>
      `
      : "";


  el.innerHTML = `

    <div class="box-header">

      <div class="box-type">

        <i class="fa-solid ${config.icon}"></i>

      </div>

      <div
        class="box-title"
        contenteditable="true"
      >${escapeHTML(box.title || "")}</div>

      <div class="box-actions">

        <button
          class="box-btn delete"
          title="Delete"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

      </div>

    </div>

    ${body}

    ${parentSelector}
  `;


  bindBoxEvents(
    el,
    space,
    box
  );


  if (box.type === "task") {
    renderTasks(el, box);
  }

  if (box.type === "link" && box.url) {
    renderLink(el, box);
  }


  return el;
}


/* =====================================================
   BOX EVENTS
===================================================== */

function bindBoxEvents(el, space, box) {

  const title =
    el.querySelector(".box-title");

  const header =
    el.querySelector(".box-header");


  /* TITLE */

  title.addEventListener(
    "input",
    () => {

      box.title =
        title.textContent;

      save();

      updateAllParents(
        space.id
      );
    }
  );


  /* DELETE */

  el.querySelector(
    ".box-btn.delete"
  )?.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      requestDeleteBox(
        space.id,
        box.id
      );
    }
  );


  /* TEXT EDITOR */

  const editor =
    el.querySelector(
      '[data-editor="text"]'
    );

  if (editor) {

    editor.addEventListener(
      "input",
      () => {

        box.content =
          editor.innerHTML;

        save();
      }
    );

    el.querySelectorAll(
      "[data-format]"
    ).forEach(button => {

      button.addEventListener(
        "mousedown",
        event => {
          event.preventDefault();
        }
      );

      button.addEventListener(
        "click",
        () => {

          document.execCommand(
            button.dataset.format,
            false,
            null
          );

          editor.focus();

          box.content =
            editor.innerHTML;

          save();
        }
      );

    });


    el.querySelector(
      "[data-link]"
    )?.addEventListener(
      "click",
      () => {

        const url =
          prompt("Link URL:");

        if (!url) return;

        document.execCommand(
          "createLink",
          false,
          url
        );

        box.content =
          editor.innerHTML;

        save();
      }
    );
  }


  /* NOTE */

  const note =
    el.querySelector(
      '[data-editor="note"]'
    );

  if (note) {

    note.addEventListener(
      "input",
      () => {

        box.content =
          note.textContent;

        save();
      }
    );
  }


  /* TASK */

  el.querySelector(
    ".add-task"
  )?.addEventListener(
    "click",
    () => {

      addTask(
        space.id,
        box.id
      );
    }
  );


  /* LINK */

  const linkInput =
    el.querySelector(
      ".link-input"
    );

  const linkGo =
    el.querySelector(
      ".link-go"
    );

  if (linkInput) {

    linkInput.addEventListener(
      "input",
      () => {

        box.url =
          linkInput.value.trim();

        save();
      }
    );

    linkInput.addEventListener(
      "keydown",
      event => {

        if (event.key === "Enter") {
          renderLink(el, box);
        }

      }
    );

    linkGo.addEventListener(
      "click",
      () => {

        box.url =
          linkInput.value.trim();

        save();

        renderLink(
          el,
          box
        );
      }
    );
  }


  /* PARENT */

  const select =
    el.querySelector(
      ".parent-select"
    );

  if (select) {

    select.addEventListener(
      "change",
      () => {

        box.parentId =
          select.value || null;

        save();

        updateAllParents(
          space.id
        );
      }
    );
  }


  /* DRAG */

  header.addEventListener(
    "mousedown",
    event => {

      if (
        event.target.closest(
          ".box-title,.box-actions"
        )
      ) {
        return;
      }

      startDrag(
        event,
        el,
        space,
        box
      );
    }
  );


  header.addEventListener(
    "touchstart",
    event => {

      if (
        event.target.closest(
          ".box-title,.box-actions"
        )
      ) {
        return;
      }

      startDrag(
        event.touches[0],
        el,
        space,
        box
      );

    },
    {
      passive: true
    }
  );
}


/* =====================================================
   TASKS
===================================================== */

function renderTasks(el, box) {

  const list =
    el.querySelector(
      ".task-list"
    );

  list.innerHTML = "";

  box.tasks ||= [];

  box.tasks.forEach(task => {

    const item =
      document.createElement("div");

    item.className = "task";

    item.dataset.id =
      task.id;

    item.innerHTML = `

      <button class="task-check">

        ${
          task.done
            ? '<i class="fa-solid fa-check"></i>'
            : ""
        }

      </button>

      <div
        class="task-text ${task.done ? "done" : ""}"
        contenteditable="true"
      >${escapeHTML(task.text || "")}</div>

      <button class="task-remove">

        <i class="fa-solid fa-xmark"></i>

      </button>
    `;


    const check =
      item.querySelector(
        ".task-check"
      );

    const text =
      item.querySelector(
        ".task-text"
      );

    const remove =
      item.querySelector(
        ".task-remove"
      );


    check.addEventListener(
      "click",
      () => {

        task.done =
          !task.done;

        check.classList.toggle(
          "checked",
          task.done
        );

        check.innerHTML =
          task.done
            ? '<i class="fa-solid fa-check"></i>'
            : "";

        text.classList.toggle(
          "done",
          task.done
        );

        save();
      }
    );


    text.addEventListener(
      "input",
      () => {

        task.text =
          text.textContent;

        save();
      }
    );


    remove.addEventListener(
      "click",
      () => {

        box.tasks =
          box.tasks.filter(
            t => t.id !== task.id
          );

        save();

        renderTasks(
          el,
          box
        );
      }
    );


    list.appendChild(item);
  });
}


function addTask(spaceId, boxId) {

  const box =
    getBox(
      spaceId,
      boxId
    );

  if (!box) return;

  box.tasks ||= [];

  box.tasks.push({

    id: uid("task"),

    text: "",

    done: false
  });

  save();

  const el =
    document.getElementById(
      boxId
    );

  if (el) {

    renderTasks(
      el,
      box
    );

    const last =
      el.querySelector(
        ".task-list .task:last-child .task-text"
      );

    last?.focus();
  }
}


/* =====================================================
   LINK
===================================================== */

function renderLink(el, box) {

  const result =
    el.querySelector(
      ".link-result"
    );

  if (!result) return;

  const url =
    (box.url || "").trim();

  if (!url) {

    result.innerHTML = "";

    return;
  }


  let parsed;

  try {
    parsed = new URL(url);
  } catch {

    result.innerHTML = "";

    showToast("Invalid URL");

    return;
  }


  /* YOUTUBE */

  const youtube =
    url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/i
    );

  if (youtube) {

    result.innerHTML = `

      <div class="embed">

        <iframe
          src="https://www.youtube.com/embed/${encodeURIComponent(youtube[1])}"
          allowfullscreen
        ></iframe>

      </div>
    `;

    return;
  }


  /* VIMEO */

  const vimeo =
    url.match(
      /vimeo\.com\/(\d+)/i
    );

  if (vimeo) {

    result.innerHTML = `

      <div class="embed">

        <iframe
          src="https://player.vimeo.com/video/${vimeo[1]}"
          allowfullscreen
        ></iframe>

      </div>
    `;

    return;
  }


  /* NORMAL */

  const domain =
    parsed.hostname.replace(
      /^www\./,
      ""
    );


  result.innerHTML = `

    <a
      class="link-preview"
      href="${escapeHTML(url)}"
      target="_blank"
      rel="noopener noreferrer"
    >

      <div class="link-preview-icon">

        <i class="fa-solid fa-arrow-up-right-from-square"></i>

      </div>

      <div>

        <div class="link-domain">
          ${escapeHTML(domain)}
        </div>

        <div class="link-url">
          ${escapeHTML(url)}
        </div>

      </div>

    </a>
  `;
}


/* =====================================================
   PARENT / FOLDER
===================================================== */

function updateAllParents(spaceId) {

  const space =
    getSpace(spaceId);

  if (!space) return;


  const folders =
    space.boxes.filter(
      box => box.type === "folder"
    );


  space.boxes.forEach(box => {

    if (box.type === "folder") {

      renderFolderChildren(
        space,
        box
      );

      return;
    }


    const el =
      document.getElementById(
        box.id
      );

    if (!el) return;


    const select =
      el.querySelector(
        ".parent-select"
      );

    if (!select) return;


    select.innerHTML =
      `<option value="">No folder</option>`;


    folders.forEach(folder => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        folder.id;

      option.textContent =
        folder.title.trim() ||
        "Untitled folder";

      option.selected =
        box.parentId === folder.id;

      select.appendChild(
        option
      );
    });
  });
}


function renderFolderChildren(
  space,
  folder
) {

  const el =
    document.getElementById(
      folder.id
    );

  if (!el) return;

  const container =
    el.querySelector(
      "[data-children]"
    );

  if (!container) return;


  const children =
    space.boxes.filter(
      box =>
        box.parentId === folder.id
    );


  if (!children.length) {

    container.innerHTML = `

      <span class="no-children">
        Empty folder
      </span>
    `;

    return;
  }


  container.innerHTML =
    children.map(
      child => `

        <span class="child-tag">

          <i class="fa-solid ${
            TYPE_CONFIG[child.type]?.icon ||
            "fa-square"
          }"></i>

          ${escapeHTML(
            child.title.trim() ||
            TYPE_CONFIG[child.type]?.label ||
            "Box"
          )}

        </span>
      `
    ).join("");
}


/* =====================================================
   DRAGGING
===================================================== */

function startDrag(
  event,
  el,
  space,
  box
) {

  const canvas =
    el.closest(".canvas");

  if (!canvas) return;

  const rect =
    canvas.getBoundingClientRect();


  dragState = {

    el,

    space,

    box,

    canvas,

    offsetX:
      event.clientX -
      rect.left -
      box.x +
      canvas.scrollLeft,

    offsetY:
      event.clientY -
      rect.top -
      box.y +
      canvas.scrollTop,

    children: []
  };


  if (box.type === "folder") {

    dragState.children =
      space.boxes
        .filter(
          child =>
            child.parentId === box.id
        )
        .map(
          child => ({
            box: child,

            dx:
              child.x - box.x,

            dy:
              child.y - box.y
          })
        );
  }


  el.classList.add("dragging");


  document.addEventListener(
    "mousemove",
    dragMove
  );

  document.addEventListener(
    "mouseup",
    endDrag
  );

  document.addEventListener(
    "touchmove",
    touchDragMove,
    {
      passive: false
    }
  );

  document.addEventListener(
    "touchend",
    endDrag
  );
}


function dragMove(event) {

  moveBox(
    event.clientX,
    event.clientY
  );
}


function touchDragMove(event) {

  if (!dragState) return;

  event.preventDefault();

  const touch =
    event.touches[0];

  moveBox(
    touch.clientX,
    touch.clientY
  );
}


function moveBox(
  clientX,
  clientY
) {

  if (!dragState) return;

  const {
    el,
    box,
    canvas,
    offsetX,
    offsetY,
    children
  } = dragState;


  const rect =
    canvas.getBoundingClientRect();


  box.x =
    Math.max(
      0,
      clientX -
      rect.left -
      offsetX +
      canvas.scrollLeft
    );


  box.y =
    Math.max(
      0,
      clientY -
      rect.top -
      offsetY +
      canvas.scrollTop
    );


  el.style.left =
    `${box.x}px`;

  el.style.top =
    `${box.y}px`;


  children.forEach(
    child => {

      child.box.x =
        box.x +
        child.dx;

      child.box.y =
        box.y +
        child.dy;


      const childEl =
        document.getElementById(
          child.box.id
        );

      if (childEl) {

        childEl.style.left =
          `${child.box.x}px`;

        childEl.style.top =
          `${child.box.y}px`;
      }

    }
  );
}


function endDrag() {

  if (!dragState) return;

  dragState.el.classList.remove(
    "dragging"
  );

  save();

  updateAllParents(
    dragState.space.id
  );

  dragState = null;


  document.removeEventListener(
    "mousemove",
    dragMove
  );

  document.removeEventListener(
    "mouseup",
    endDrag
  );

  document.removeEventListener(
    "touchmove",
    touchDragMove
  );

  document.removeEventListener(
    "touchend",
    endDrag
  );
}


/* =====================================================
   EXPORT
===================================================== */

function exportSpace(spaceId) {

  const space =
    getSpace(spaceId);

  if (!space) return;


  const data = {

    app: "Chi Space",

    version: 1,

    exportedAt:
      new Date().toISOString(),

    space: JSON.parse(
      JSON.stringify(space)
    )
  };


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
        type: "application/json"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement("a");

  a.href = url;

  a.download =
    `${safeFilename(space.name)}.json`;

  document.body.appendChild(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(url);

  showToast("Space exported");
}


function safeFilename(name) {

  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80)
    ||
    "space"
  );
}


/* =====================================================
   CONFIRM
===================================================== */

function openConfirm(
  title,
  text,
  action
) {

  confirmTitle.textContent =
    title;

  confirmText.textContent =
    text;

  confirmAction =
    action;

  confirmModal.classList.remove(
    "hidden"
  );
}


function closeConfirm() {

  confirmAction = null;

  confirmModal.classList.add(
    "hidden"
  );
}


cancelConfirm.addEventListener(
  "click",
  closeConfirm
);


acceptConfirm.addEventListener(
  "click",
  () => {

    const action =
      confirmAction;

    closeConfirm();

    if (action) {
      action();
    }

  }
);


confirmModal.addEventListener(
  "click",
  event => {

    if (
      event.target === confirmModal
    ) {
      closeConfirm();
    }

  }
);


/* =====================================================
   TAB EVENTS
===================================================== */

tabsEl.addEventListener(
  "click",
  event => {

    const tab =
      event.target.closest(".tab");

    if (!tab) return;

    const id =
      tab.dataset.spaceId;


    const action =
      event.target.closest(
        "[data-action]"
      );


    if (action) {

      const type =
        action.dataset.action;


      if (type === "rename") {
        renameSpace(id);
      }

      if (type === "export") {
        exportSpace(id);
      }

      if (type === "delete") {
        requestDeleteSpace(id);
      }

      return;
    }


    state.activeSpaceId =
      id;

    save();

    render();
  }
);


/* =====================================================
   SPACE CREATION
===================================================== */

document
  .getElementById("addSpaceBtn")
  .addEventListener(
    "click",
    () => createSpace()
  );


document
  .getElementById("mobileSpaceBtn")
  .addEventListener(
    "click",
    () => createSpace()
  );


/* =====================================================
   QUICK ACTIONS
===================================================== */

document
  .querySelectorAll(
    ".quick-btn"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        addBox(
          button.dataset.type
        );
      }
    );

  });


document
  .querySelectorAll(
    "[data-mobile-type]"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        addBox(
          button.dataset.mobileType
        );
      }
    );

  });


/* =====================================================
   KEYBOARD SHORTCUTS
===================================================== */

document.addEventListener(
  "keydown",
  event => {

    /*
      Don't trigger shortcuts
      while typing.
    */

    const target =
      event.target;

    if (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    ) {
      return;
    }


    if (
      event.ctrlKey &&
      event.shiftKey &&
      event.key.toLowerCase() === "n"
    ) {

      event.preventDefault();

      createSpace();
    }


    if (
      event.ctrlKey &&
      event.shiftKey &&
      event.key.toLowerCase() === "t"
    ) {

      event.preventDefault();

      addBox("text");
    }

  }
);


/* =====================================================
   INIT
===================================================== */

load();

render();
