"use strict";


/* =====================================================
   SPACE CHI
   Local Workspace Engine
===================================================== */


/* =====================================================
   CONSTANTS
===================================================== */

const STORAGE_KEY = "spacechi_state_v1";


/* =====================================================
   DEFAULT DATA
===================================================== */

const defaultState = {

  spaces: [

    {
      id: createId(),
      name: "فضای من",

      boxes: [

        {
          id: createId(),
          type: "note",
          title: "به Space Chi خوش اومدی",
          content:
            "اینجا می‌تونی یادداشت‌ها، کارها، لینک‌ها و پوشه‌هات رو کنار هم نگه داری.",
          parentId: null,
          createdAt: Date.now()
        },

        {
          id: createId(),
          type: "task",
          title: "شروع کار با Space Chi",
          tasks: [
            {
              id: createId(),
              text: "ساخت اولین Space",
              done: false
            },
            {
              id: createId(),
              text: "ساخت اولین یادداشت",
              done: false
            }
          ],
          parentId: null,
          createdAt: Date.now()
        }

      ]
    }

  ],

  activeSpaceId: null,

  currentFolderId: null,

  filter: "all",

  sort: "newest",

  search: ""

};


defaultState.activeSpaceId =
  defaultState.spaces[0].id;



/* =====================================================
   STATE
===================================================== */

let state = loadState();

let selectedType = "note";

let editingBoxId = null;

let toastTimer = null;



/* =====================================================
   DOM
===================================================== */

const spacesEl =
  document.getElementById("spaces");

const boxesEl =
  document.getElementById("boxes");

const emptyState =
  document.getElementById("emptyState");

const breadcrumbEl =
  document.getElementById("breadcrumb");

const searchPanel =
  document.getElementById("searchPanel");

const searchInput =
  document.getElementById("searchInput");

const boxModal =
  document.getElementById("boxModal");

const spaceModal =
  document.getElementById("spaceModal");

const editModal =
  document.getElementById("editModal");

const formFields =
  document.getElementById("formFields");

const boxForm =
  document.getElementById("boxForm");

const spaceForm =
  document.getElementById("spaceForm");

const editForm =
  document.getElementById("editForm");

const editFields =
  document.getElementById("editFields");



/* =====================================================
   HELPERS
===================================================== */

function createId() {

  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2, 8)
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


function truncate(value = "", length = 140) {

  const text = String(value);

  if (text.length <= length)
    return text;

  return text.slice(0, length) + "…";

}


function formatDate(timestamp) {

  return new Intl.DateTimeFormat(
    "fa-IR",
    {
      month: "short",
      day: "numeric"
    }
  ).format(timestamp);

}


function getActiveSpace() {

  return state.spaces.find(
    space =>
      space.id === state.activeSpaceId
  ) || state.spaces[0];

}


function getCurrentFolder() {

  const space = getActiveSpace();

  if (!space || !state.currentFolderId)
    return null;

  return space.boxes.find(
    box =>
      box.id === state.currentFolderId &&
      box.type === "folder"
  ) || null;

}


function saveState() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );

}


function loadState() {

  try {

    const saved =
      localStorage.getItem(STORAGE_KEY);

    if (!saved)
      return defaultState;

    const parsed =
      JSON.parse(saved);

    if (
      !parsed.spaces ||
      !Array.isArray(parsed.spaces)
    ) {
      return defaultState;
    }

    return {
      ...defaultState,
      ...parsed
    };

  } catch (error) {

    console.error(error);

    return defaultState;

  }

}


function showToast(message) {

  const toast =
    document.getElementById("toast");

  toast.querySelector("span").textContent =
    message;

  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {

    toast.classList.remove("show");

  }, 2200);

}



/* =====================================================
   ICONS
===================================================== */

function getTypeIcon(type) {

  const icons = {

    note:
      "fa-regular fa-note-sticky",

    task:
      "fa-regular fa-square-check",

    link:
      "fa-solid fa-link",

    folder:
      "fa-regular fa-folder"

  };

  return icons[type] || icons.note;

}


function getTypeName(type) {

  const names = {

    note: "NOTE",

    task: "TASK",

    link: "LINK",

    folder: "FOLDER"

  };

  return names[type] || "BOX";

}



/* =====================================================
   RENDER ALL
===================================================== */

function render() {

  renderSpaces();

  renderBreadcrumb();

  renderBoxes();

  updateFilterButtons();

}



/* =====================================================
   RENDER SPACES
===================================================== */

function renderSpaces() {

  spacesEl.innerHTML = "";

  state.spaces.forEach(space => {

    const tab =
      document.createElement("div");

    tab.className =
      "space-tab" +
      (
        space.id === state.activeSpaceId
          ? " active"
          : ""
      );

    tab.dataset.id = space.id;

    tab.innerHTML = `

      <i class="fa-solid fa-layer-group"></i>

      <span class="space-tab-name">
        ${escapeHTML(space.name)}
      </span>

      ${
        state.spaces.length > 1
          ? `
            <span
              class="space-tab-close"
              data-close-space="${space.id}"
            >
              <i class="fa-solid fa-xmark"></i>
            </span>
          `
          : ""
      }

    `;

    spacesEl.appendChild(tab);

  });

}



/* =====================================================
   BREADCRUMB
===================================================== */

function renderBreadcrumb() {

  const space =
    getActiveSpace();

  const folder =
    getCurrentFolder();

  breadcrumbEl.innerHTML = `

    <div class="breadcrumb-item">

      <i class="fa-solid fa-layer-group"></i>

      ${escapeHTML(space?.name || "Space")}

    </div>

  `;


  if (folder) {

    breadcrumbEl.innerHTML += `

      <span class="breadcrumb-separator">
        <i class="fa-solid fa-chevron-left"></i>
      </span>

      <div class="breadcrumb-item current">

        <i class="fa-regular fa-folder"></i>

        ${escapeHTML(folder.title)}

      </div>

    `;

  }

}



/* =====================================================
   GET VISIBLE BOXES
===================================================== */

function getVisibleBoxes() {

  const space =
    getActiveSpace();

  if (!space)
    return [];


  let boxes =
    space.boxes.filter(
      box =>
        box.parentId ===
        state.currentFolderId
    );


  if (state.filter !== "all") {

    boxes =
      boxes.filter(
        box =>
          box.type === state.filter
      );

  }


  const search =
    state.search.trim().toLowerCase();


  if (search) {

    boxes =
      boxes.filter(box => {

        const title =
          String(box.title || "")
            .toLowerCase();

        const content =
          String(box.content || "")
            .toLowerCase();

        return (
          title.includes(search) ||
          content.includes(search)
        );

      });

  }


  boxes.sort((a, b) => {

    if (state.sort === "oldest") {

      return a.createdAt - b.createdAt;

    }


    if (state.sort === "alphabetical") {

      return String(a.title)
        .localeCompare(
          String(b.title),
          "fa"
        );

    }


    return b.createdAt - a.createdAt;

  });


  return boxes;

}



/* =====================================================
   RENDER BOXES
===================================================== */

function renderBoxes() {

  const boxes =
    getVisibleBoxes();

  boxesEl.innerHTML = "";

  if (!boxes.length) {

    boxesEl.hidden = true;

    emptyState.hidden = false;

    return;

  }


  boxesEl.hidden = false;

  emptyState.hidden = true;


  boxes.forEach(box => {

    boxesEl.appendChild(
      createBoxElement(box)
    );

  });

}



/* =====================================================
   CREATE BOX ELEMENT
===================================================== */

function createBoxElement(box) {

  const card =
    document.createElement("article");

  card.className =
    "box-card" +
    (
      box.type === "folder"
        ? " folder-card"
        : ""
    );

  card.dataset.id = box.id;


  if (box.type === "folder") {

    card.innerHTML =
      renderFolder(box);

  }

  else if (box.type === "note") {

    card.innerHTML =
      renderNote(box);

  }

  else if (box.type === "task") {

    card.innerHTML =
      renderTask(box);

  }

  else if (box.type === "link") {

    card.innerHTML =
      renderLink(box);

  }


  return card;

}



/* =====================================================
   CARD PARTS
===================================================== */

function cardTop(type, id) {

  return `

    <div class="card-top">

      <div class="card-type">

        <i class="${getTypeIcon(type)}"></i>

        ${getTypeName(type)}

      </div>

      <button
        class="card-menu"
        data-edit="${id}"
        title="ویرایش"
      >
        <i class="fa-solid fa-ellipsis"></i>
      </button>

    </div>

  `;

}


function cardFooter(box) {

  return `

    <div class="card-footer">

      <span>
        <i class="fa-regular fa-clock"></i>
        ${formatDate(box.createdAt)}
      </span>

      <span>
        ${getTypeName(box.type)}
      </span>

    </div>

  `;

}



/* =====================================================
   NOTE
===================================================== */

function renderNote(box) {

  const content =
    escapeHTML(box.content || "")
      .replace(/\n/g, "<br>");


  return `

    ${cardTop("note", box.id)}

    <div class="card-body">

      <h3 class="card-title">
        ${escapeHTML(box.title)}
      </h3>

      <div class="note-content">
        ${truncateHTML(content, 260)}
      </div>

    </div>

    ${cardFooter(box)}

  `;

}


function truncateHTML(html, length) {

  if (html.length <= length)
    return html;

  return html.slice(0, length) + "…";

}



/* =====================================================
   TASK
===================================================== */

function renderTask(box) {

  const tasks =
    Array.isArray(box.tasks)
      ? box.tasks
      : [];


  const visible =
    tasks.slice(0, 4);


  return `

    ${cardTop("task", box.id)}

    <div class="card-body">

      <h3 class="card-title">
        ${escapeHTML(box.title)}
      </h3>

      <div class="task-list">

        ${
          visible.length

          ? visible.map(task => `

              <label class="task-row ${
                task.done ? "done" : ""
              }">

                <input
                  type="checkbox"
                  data-task="${box.id}"
                  data-task-id="${task.id}"
                  ${task.done ? "checked" : ""}
                >

                <span>
                  ${escapeHTML(task.text)}
                </span>

              </label>

          `).join("")

          : `
            <span class="card-text">
              هنوز کاری اضافه نشده.
            </span>
          `
        }

      </div>

    </div>

    ${cardFooter(box)}

  `;

}



/* =====================================================
   LINK
===================================================== */

function renderLink(box) {

  let hostname = "";

  try {

    hostname =
      new URL(box.url).hostname;

  } catch {

    hostname =
      box.url || "";

  }


  return `

    ${cardTop("link", box.id)}

    <div class="card-body">

      <h3 class="card-title">
        ${escapeHTML(box.title)}
      </h3>

      ${
        box.description
          ? `
            <div class="card-text">
              ${escapeHTML(
                truncate(
                  box.description,
                  100
                )
              )}
            </div>
          `
          : ""
      }

      <a
        class="link-preview"
        href="${escapeHTML(box.url)}"
        target="_blank"
        rel="noopener noreferrer"
        onclick="event.stopPropagation()"
      >

        <div class="link-preview-icon">

          <i class="fa-solid fa-arrow-up-right-from-square"></i>

        </div>

        <div class="link-url">

          ${escapeHTML(hostname)}

        </div>

      </a>

    </div>

    ${cardFooter(box)}

  `;

}



/* =====================================================
   FOLDER
===================================================== */

function renderFolder(box) {

  const space =
    getActiveSpace();

  const count =
    space.boxes.filter(
      item =>
        item.parentId === box.id
    ).length;


  return `

    ${cardTop("folder", box.id)}

    <div class="card-body">

      <div class="folder-icon">

        <i class="fa-regular fa-folder"></i>

      </div>

      <div>

        <h3 class="card-title">

          ${escapeHTML(box.title)}

        </h3>

        <div class="folder-count">

          ${count} item${count !== 1 ? "s" : ""}

        </div>

      </div>

    </div>

    ${cardFooter(box)}

  `;

}



/* =====================================================
   MODALS
===================================================== */

function openModal(modal) {

  modal.hidden = false;

  document.body.style.overflow =
    "hidden";

}


function closeModal(modal) {

  modal.hidden = true;

  document.body.style.overflow =
    "";

}


function closeAllModals() {

  [
    boxModal,
    spaceModal,
    editModal
  ].forEach(modal => {

    modal.hidden = true;

  });

  document.body.style.overflow =
    "";

}



/* =====================================================
   BOX FORM
===================================================== */

function renderBoxFields(
  type = selectedType,
  data = {}
) {

  if (type === "note") {

    formFields.innerHTML = `

      <label class="field">

        <span>عنوان</span>

        <input
          name="title"
          type="text"
          maxlength="100"
          placeholder="عنوان یادداشت"
          value="${escapeHTML(
            data.title || ""
          )}"
          required
        >

      </label>


      <label class="field">

        <span>متن</span>

        <textarea
          name="content"
          placeholder="هر چیزی که می‌خوای اینجا بنویس..."
        >${escapeHTML(
          data.content || ""
        )}</textarea>

      </label>

    `;

  }


  else if (type === "task") {

    const tasks =
      data.tasks || [
        {
          text: "",
          done: false
        }
      ];


    formFields.innerHTML = `

      <label class="field">

        <span>عنوان لیست</span>

        <input
          name="title"
          type="text"
          maxlength="100"
          placeholder="مثلاً کارهای امروز"
          value="${escapeHTML(
            data.title || ""
          )}"
          required
        >

      </label>


      <label class="field">

        <span>کارها</span>

        <textarea
          name="tasks"
          placeholder="هر کار را در یک خط بنویس..."
        >${escapeHTML(
          tasks
            .map(t => t.text || "")
            .join("\n")
        )}</textarea>

      </label>

      <div class="form-hint">
        هر خط تبدیل به یک Task جدا می‌شود.
      </div>

    `;

  }


  else if (type === "link") {

    formFields.innerHTML = `

      <label class="field">

        <span>عنوان</span>

        <input
          name="title"
          type="text"
          maxlength="100"
          placeholder="عنوان لینک"
          value="${escapeHTML(
            data.title || ""
          )}"
          required
        >

      </label>


      <label class="field">

        <span>آدرس</span>

        <input
          name="url"
          type="url"
          placeholder="https://example.com"
          value="${escapeHTML(
            data.url || ""
          )}"
          required
        >

      </label>


      <label class="field">

        <span>توضیح کوتاه</span>

        <textarea
          name="description"
          placeholder="اختیاری..."
        >${escapeHTML(
          data.description || ""
        )}</textarea>

      </label>

    `;

  }


  else if (type === "folder") {

    formFields.innerHTML = `

      <label class="field">

        <span>نام پوشه</span>

        <input
          name="title"
          type="text"
          maxlength="80"
          placeholder="مثلاً پروژه‌ها"
          value="${escapeHTML(
            data.title || ""
          )}"
          required
        >

      </label>


      <div class="form-hint">
        بعد از ساخت پوشه، می‌تونی باکس‌ها رو داخلش قرار بدی.
      </div>

    `;

  }

}



/* =====================================================
   OPEN CREATE BOX
===================================================== */

function openCreateBox(type = "note") {

  selectedType = type;

  document
    .querySelectorAll(".type-card")
    .forEach(card => {

      card.classList.toggle(
        "selected",
        card.dataset.type === type
      );

    });


  renderBoxFields(type);

  openModal(boxModal);

}



/* =====================================================
   CREATE BOX
===================================================== */

boxForm.addEventListener(
  "submit",
  event => {

    event.preventDefault();

    const space =
      getActiveSpace();

    if (!space)
      return;


    const form =
      new FormData(boxForm);

    const title =
      String(
        form.get("title") || ""
      ).trim();


    if (!title)
      return;


    const box = {

      id: createId(),

      type: selectedType,

      title,

      parentId:
        state.currentFolderId,

      createdAt:
        Date.now()

    };


    if (selectedType === "note") {

      box.content =
        String(
          form.get("content") || ""
        ).trim();

    }


    if (selectedType === "task") {

      const raw =
        String(
          form.get("tasks") || ""
        );

      box.tasks =
        raw
          .split("\n")
          .map(text => text.trim())
          .filter(Boolean)
          .map(text => ({

            id: createId(),

            text,

            done: false

          }));

    }


    if (selectedType === "link") {

      box.url =
        String(
          form.get("url") || ""
        ).trim();

      box.description =
        String(
          form.get("description") || ""
        ).trim();

    }


    space.boxes.push(box);

    saveState();

    render();

    closeModal(boxModal);

    boxForm.reset();

    showToast("باکس ساخته شد");

  }
);



/* =====================================================
   TYPE SELECTOR
===================================================== */

document
  .querySelectorAll(".type-card")
  .forEach(card => {

    card.addEventListener(
      "click",
      () => {

        selectedType =
          card.dataset.type;

        document
          .querySelectorAll(".type-card")
          .forEach(item => {

            item.classList.toggle(
              "selected",
              item === card
            );

          });


        renderBoxFields(
          selectedType
        );

      }
    );

  });



/* =====================================================
   SPACE
===================================================== */

function openSpaceModal() {

  document
    .getElementById("spaceName")
    .value = "";

  openModal(spaceModal);

}


spaceForm.addEventListener(
  "submit",
  event => {

    event.preventDefault();

    const input =
      document.getElementById(
        "spaceName"
      );

    const name =
      input.value.trim();

    if (!name)
      return;


    const space = {

      id: createId(),

      name,

      boxes: []

    };


    state.spaces.push(space);

    state.activeSpaceId =
      space.id;

    state.currentFolderId =
      null;

    state.filter =
      "all";

    saveState();

    render();

    closeModal(spaceModal);

    showToast("Space جدید ساخته شد");

  }
);



/* =====================================================
   SPACE CLICK
===================================================== */

spacesEl.addEventListener(
  "click",
  event => {

    const close =
      event.target.closest(
        "[data-close-space]"
      );


    if (close) {

      event.stopPropagation();

      deleteSpace(
        close.dataset.closeSpace
      );

      return;

    }


    const tab =
      event.target.closest(
        ".space-tab"
      );


    if (!tab)
      return;


    state.activeSpaceId =
      tab.dataset.id;

    state.currentFolderId =
      null;

    state.filter =
      "all";

    state.search =
      "";

    saveState();

    render();

  }
);



/* =====================================================
   DELETE SPACE
===================================================== */

function deleteSpace(id) {

  if (state.spaces.length <= 1) {

    showToast(
      "حداقل یک Space باید وجود داشته باشه"
    );

    return;

  }


  const space =
    state.spaces.find(
      s => s.id === id
    );


  if (!space)
    return;


  const confirmed =
    confirm(
      `Space «${space.name}» حذف بشه؟`
    );


  if (!confirmed)
    return;


  state.spaces =
    state.spaces.filter(
      s => s.id !== id
    );


  if (state.activeSpaceId === id) {

    state.activeSpaceId =
      state.spaces[0].id;

  }


  state.currentFolderId =
    null;

  saveState();

  render();

  showToast("Space حذف شد");

}



/* =====================================================
   CARD CLICK
===================================================== */

boxesEl.addEventListener(
  "click",
  event => {

    const edit =
      event.target.closest(
        "[data-edit]"
      );


    if (edit) {

      event.stopPropagation();

      openEditModal(
        edit.dataset.edit
      );

      return;

    }


    const folder =
      event.target.closest(
        ".folder-card"
      );


    if (folder) {

      const space =
        getActiveSpace();

      const box =
        space.boxes.find(
          b => b.id === folder.dataset.id
        );


      if (!box)
        return;


      state.currentFolderId =
        box.id;

      state.filter =
        "all";

      saveState();

      render();

    }

  }
);



/* =====================================================
   TASK CLICK
===================================================== */

boxesEl.addEventListener(
  "change",
  event => {

    const checkbox =
      event.target.closest(
        "[data-task]"
      );


    if (!checkbox)
      return;


    const space =
      getActiveSpace();


    const box =
      space.boxes.find(
        b =>
          b.id === checkbox.dataset.task
      );


    if (!box)
      return;


    const task =
      box.tasks.find(
        t =>
          t.id ===
          checkbox.dataset.taskId
      );


    if (!task)
      return;


    task.done =
      checkbox.checked;


    saveState();

    render();

  }
);



/* =====================================================
   EDIT MODAL
===================================================== */

function openEditModal(id) {

  const space =
    getActiveSpace();


  const box =
    space.boxes.find(
      b => b.id === id
    );


  if (!box)
    return;


  editingBoxId = id;


  renderEditFields(box);

  openModal(editModal);

}


function renderEditFields(box) {

  if (box.type === "note") {

    editFields.innerHTML = `

      <label class="field">

        <span>عنوان</span>

        <input
          name="title"
          value="${escapeHTML(box.title)}"
          required
        >

      </label>


      <label class="field">

        <span>متن</span>

        <textarea name="content">${escapeHTML(
          box.content || ""
        )}</textarea>

      </label>

    `;

  }


  else if (box.type === "task") {

    editFields.innerHTML = `

      <label class="field">

        <span>عنوان</span>

        <input
          name="title"
          value="${escapeHTML(box.title)}"
          required
        >

      </label>


      <label class="field">

        <span>کارها</span>

        <textarea name="tasks">${escapeHTML(
          (box.tasks || [])
            .map(task => task.text)
            .join("\n")
        )}</textarea>

      </label>

    `;

  }


  else if (box.type === "link") {

    editFields.innerHTML = `

      <label class="field">

        <span>عنوان</span>

        <input
          name="title"
          value="${escapeHTML(box.title)}"
          required
        >

      </label>


      <label class="field">

        <span>آدرس</span>

        <input
          name="url"
          type="url"
          value="${escapeHTML(box.url || "")}"
          required
        >

      </label>


      <label class="field">

        <span>توضیح</span>

        <textarea name="description">${escapeHTML(
          box.description || ""
        )}</textarea>

      </label>

    `;

  }


  else if (box.type === "folder") {

    editFields.innerHTML = `

      <label class="field">

        <span>نام پوشه</span>

        <input
          name="title"
          value="${escapeHTML(box.title)}"
          required
        >

      </label>

    `;

  }

}



/* =====================================================
   SAVE EDIT
===================================================== */

editForm.addEventListener(
  "submit",
  event => {

    event.preventDefault();


    const space =
      getActiveSpace();


    const box =
      space.boxes.find(
        b => b.id === editingBoxId
      );


    if (!box)
      return;


    const form =
      new FormData(editForm);


    box.title =
      String(
        form.get("title") || ""
      ).trim();


    if (box.type === "note") {

      box.content =
        String(
          form.get("content") || ""
        ).trim();

    }


    if (box.type === "link") {

      box.url =
        String(
          form.get("url") || ""
        ).trim();

      box.description =
        String(
          form.get("description") || ""
        ).trim();

    }


    if (box.type === "task") {

      const oldTasks =
        box.tasks || [];


      const texts =
        String(
          form.get("tasks") || ""
        )
          .split("\n")
          .map(x => x.trim())
          .filter(Boolean);


      box.tasks =
        texts.map((text, index) => ({

          id:
            oldTasks[index]?.id ||
            createId(),

          text,

          done:
            oldTasks[index]?.done ||
            false

        }));

    }


    saveState();

    render();

    closeModal(editModal);

    showToast("تغییرات ذخیره شد");

  }
);



/* =====================================================
   DELETE EDITED BOX
===================================================== */

document
  .getElementById("deleteEditBtn")
  .addEventListener(
    "click",
    () => {

      const space =
        getActiveSpace();


      const box =
        space.boxes.find(
          b => b.id === editingBoxId
        );


      if (!box)
        return;


      const confirmed =
        confirm(
          `«${box.title}» حذف بشه؟`
        );


      if (!confirmed)
        return;


      deleteBox(
        editingBoxId
      );

      closeModal(editModal);

    }
  );



/* =====================================================
   DELETE BOX
===================================================== */

function deleteBox(id) {

  const space =
    getActiveSpace();


  const children =
    space.boxes.filter(
      box =>
        box.parentId === id
    );


  children.forEach(child => {

    child.parentId =
      state.currentFolderId;

  });


  space.boxes =
    space.boxes.filter(
      box =>
        box.id !== id
    );


  if (state.currentFolderId === id) {

    state.currentFolderId =
      null;

  }


  saveState();

  render();

  showToast("باکس حذف شد");

}



/* =====================================================
   FILTERS
===================================================== */

document
  .querySelectorAll(".filter")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        state.filter =
          button.dataset.filter;

        saveState();

        render();

      }
    );

  });


function updateFilterButtons() {

  document
    .querySelectorAll(".filter")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.filter ===
          state.filter
      );

    });

}



/* =====================================================
   SORT
===================================================== */

document
  .getElementById("sortBtn")
  .addEventListener(
    "click",
    () => {

      const modes = [
        "newest",
        "oldest",
        "alphabetical"
      ];


      const current =
        modes.indexOf(state.sort);


      state.sort =
        modes[
          (current + 1) %
          modes.length
        ];


      const names = {

        newest:
          "جدیدترین",

        oldest:
          "قدیمی‌ترین",

        alphabetical:
          "الفبایی"

      };


      saveState();

      render();

      showToast(
        `مرتب‌سازی: ${names[state.sort]}`
      );

    }
  );



/* =====================================================
   SEARCH
===================================================== */

function openSearch() {

  searchPanel.classList.add("open");

  setTimeout(
    () =>
      searchInput.focus(),
    100
  );

}


function closeSearch() {

  searchPanel.classList.remove("open");

  searchInput.value =
    state.search;

}


document
  .getElementById("searchBtn")
  .addEventListener(
    "click",
    openSearch
  );


document
  .getElementById("closeSearch")
  .addEventListener(
    "click",
    closeSearch
  );


searchInput.addEventListener(
  "input",
  () => {

    state.search =
      searchInput.value;

    render();

  }
);


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "/" &&
      document.activeElement.tagName !==
        "INPUT" &&
      document.activeElement.tagName !==
        "TEXTAREA"
    ) {

      event.preventDefault();

      openSearch();

    }


    if (event.key === "Escape") {

      closeSearch();

      closeAllModals();

    }

  }
);



/* =====================================================
   ADD BUTTONS
===================================================== */

document
  .getElementById("newBoxBtn")
  .addEventListener(
    "click",
    () =>
      openCreateBox()
  );


document
  .getElementById("emptyAddBtn")
  .addEventListener(
    "click",
    () =>
      openCreateBox()
  );


document
  .getElementById("addSpaceBtn")
  .addEventListener(
    "click",
    openSpaceModal
  );



/* =====================================================
   MODAL CLOSE
===================================================== */

document.addEventListener(
  "click",
  event => {

    if (
      event.target.matches(
        "[data-close-modal]"
      )
    ) {

      closeAllModals();

    }


    if (
      event.target.classList.contains(
        "modal-overlay"
      )
    ) {

      closeAllModals();

    }

  }
);



/* =====================================================
   MOBILE NAV
===================================================== */

document
  .querySelectorAll(".mobile-nav-item")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const action =
          button.dataset.mobile;


        document
          .querySelectorAll(
            ".mobile-nav-item"
          )
          .forEach(item => {

            item.classList.remove(
              "active"
            );

          });


        if (
          action !== "add"
        ) {

          button.classList.add(
            "active"
          );

        }


        if (action === "search") {

          openSearch();

        }


        if (action === "add") {

          openCreateBox();

        }


        if (action === "spaces") {

          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });


          showToast(
            "Spaceها از نوار بالایی قابل انتخاب هستن"
          );

        }


        if (action === "settings") {

          exportData();

        }

      }
    );

  });



/* =====================================================
   EXPORT
===================================================== */

function exportData() {

  const data =
    JSON.stringify(
      state,
      null,
      2
    );


  const blob =
    new Blob(
      [data],
      {
        type:
          "application/json"
      }
    );


  const url =
    URL.createObjectURL(blob);


  const link =
    document.createElement("a");


  link.href = url;

  link.download =
    "space-chi-backup.json";


  link.click();


  URL.revokeObjectURL(url);

  showToast("نسخه پشتیبان ساخته شد");

}


document
  .getElementById("exportBtn")
  .addEventListener(
    "click",
    exportData
  );



/* =====================================================
   IMPORT
===================================================== */

const importFile =
  document.getElementById(
    "importFile"
  );


document
  .getElementById("importBtn")
  .addEventListener(
    "click",
    () =>
      importFile.click()
  );


importFile.addEventListener(
  "change",
  event => {

    const file =
      event.target.files[0];

    if (!file)
      return;


    const reader =
      new FileReader();


    reader.onload = () => {

      try {

        const imported =
          JSON.parse(
            reader.result
          );


        if (
          !imported.spaces ||
          !Array.isArray(
            imported.spaces
          )
        ) {

          throw new Error(
            "Invalid backup"
          );

        }


        const confirmed =
          confirm(
            "اطلاعات فعلی با این نسخه پشتیبان جایگزین بشه؟"
          );


        if (!confirmed)
          return;


        state = imported;

        saveState();

        render();

        showToast(
          "نسخه پشتیبان وارد شد"
        );

      } catch (error) {

        console.error(error);

        showToast(
          "فایل معتبر نیست"
        );

      }

    };


    reader.readAsText(file);

    importFile.value = "";

  }
);



/* =====================================================
   FOLDER NAVIGATION
===================================================== */

breadcrumbEl.addEventListener(
  "click",
  event => {

    const item =
      event.target.closest(
        ".breadcrumb-item"
      );


    if (!item)
      return;


    const items =
      breadcrumbEl.querySelectorAll(
        ".breadcrumb-item"
      );


    if (
      item === items[0]
    ) {

      state.currentFolderId =
        null;

      saveState();

      render();

    }

  }
);



/* =====================================================
   INITIALIZE
===================================================== */

if (
  !state.activeSpaceId &&
  state.spaces.length
) {

  state.activeSpaceId =
    state.spaces[0].id;

}


if (!Array.isArray(state.spaces)) {

  state.spaces =
    defaultState.spaces;

}


saveState();

render();
