"use strict";

/*
  Space Chi
  Lightweight workspace engine
*/

const STORAGE_KEY = "spacechi_state_v5";

const MIN_W = 240;
const MIN_H = 130;
const MAX_W = 900;
const MAX_H = 700;

const state = {
  version: 5,
  theme: "dark",
  spaces: [],
  activeSpaceId: null
};

let dragState = null;
let resizeState = null;
let toastTimer = null;

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

const canvas = $("#canvas");
const boxesLayer = $("#boxesLayer");
const connections = $("#connections");
const emptyState = $("#emptyState");
const tabs = $("#tabs");
const modalRoot = $("#modalRoot");
const toast = $("#toast");
const viewport = $("#spaceViewport");


/* =========================
   UTILITIES
========================= */

function uid(prefix = "id") {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activeSpace() {
  return state.spaces.find(
    space => space.id === state.activeSpaceId
  ) || null;
}

function getBox(id) {
  const space = activeSpace();

  return space?.boxes.find(
    box => box.id === id
  ) || null;
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch {
    showToast("Could not save workspace.");
  }
}

function showToast(message) {
  clearTimeout(toastTimer);

  toast.textContent = message;
  toast.classList.add("show");

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}


/* =========================
   NORMALIZATION
========================= */

function normalizeHTML(html) {
  const source = document.createElement("div");
  source.innerHTML = String(html || "");

  const allowed = new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "S",
    "H2",
    "H3",
    "P",
    "BR",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "A"
  ]);

  const walker = document.createTreeWalker(
    source,
    NodeFilter.SHOW_ELEMENT
  );

  const elements = [];

  while (walker.nextNode()) {
    elements.push(walker.currentNode);
  }

  for (const element of elements) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(
        ...Array.from(element.childNodes)
      );
      continue;
    }

    for (const attr of [...element.attributes]) {
      if (attr.name !== "href") {
        element.removeAttribute(attr.name);
      }
    }

    if (element.tagName === "A") {
      const href = element.getAttribute("href") || "";

      if (!/^https?:\/\//i.test(href)) {
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
  }

  return source.innerHTML;
}

function normalizeChart(chart) {
  const input = chart || {};

  const labels = Array.isArray(input.labels)
    ? input.labels.map(
        value => String(value).slice(0, 80)
      )
    : [];

  const values = Array.isArray(input.values)
    ? input.values.map(
        value => Number(value) || 0
      )
    : [];

  const count = Math.min(
    labels.length,
    values.length
  );

  return {
    kind:
      ["bar", "line", "pie"].includes(input.kind)
        ? input.kind
        : "bar",

    description:
      String(input.description || "").slice(0, 300),

    labels: labels.slice(0, count),

    values: values.slice(0, count)
  };
}

function normalizeBox(box) {
  const type =
    ["text", "parent", "task", "link", "chart"]
      .includes(box?.type)
      ? box.type
      : "text";

  return {
    id: String(box?.id || uid("box")),
    type,

    title:
      String(box?.title || "Untitled")
        .slice(0, 100),

    content:
      normalizeHTML(box?.content || ""),

    url:
      String(box?.url || "")
        .slice(0, 2000),

    tasks:
      Array.isArray(box?.tasks)
        ? box.tasks.map(task => ({
            id: String(task?.id || uid("task")),
            text:
              String(task?.text || "")
                .slice(0, 500),
            done: Boolean(task?.done)
          }))
        : [],

    chart: normalizeChart(box?.chart),

    parentId:
      box?.parentId
        ? String(box.parentId)
        : null,

    x: Number.isFinite(Number(box?.x))
      ? Number(box.x)
      : 120,

    y: Number.isFinite(Number(box?.y))
      ? Number(box.y)
      : 120,

    width:
      clamp(
        Number(box?.width) || 340,
        MIN_W,
        MAX_W
      ),

    height:
      clamp(
        Number(box?.height) || 220,
        MIN_H,
        MAX_H
      ),

    z:
      Number.isFinite(Number(box?.z))
        ? Number(box.z)
        : 10
  };
}

function normalizeSpace(space, index) {
  const boxes = Array.isArray(space?.boxes)
    ? space.boxes.map(normalizeBox)
    : [];

  const ids = new Set(
    boxes.map(box => box.id)
  );

  for (const box of boxes) {
    if (
      !box.parentId ||
      !ids.has(box.parentId) ||
      box.parentId === box.id
    ) {
      box.parentId = null;
    }
  }

  return {
    id: String(space?.id || uid("space")),
    name:
      String(space?.name || `Space ${index + 1}`)
        .slice(0, 80),
    boxes
  };
}


/* =========================
   INITIAL STATE
========================= */

function createInitialState() {
  state.version = 5;
  state.theme = "dark";

  const space = {
    id: uid("space"),
    name: "Space 1",
    boxes: []
  };

  state.spaces = [space];
  state.activeSpaceId = space.id;
}

function loadState() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      createInitialState();
      return;
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      !Array.isArray(parsed.spaces)
    ) {
      throw new Error("Invalid workspace");
    }

    state.theme =
      parsed.theme === "light"
        ? "light"
        : "dark";

    state.spaces =
      parsed.spaces.length
        ? parsed.spaces.map(normalizeSpace)
        : [];

    if (!state.spaces.length) {
      createInitialState();
      return;
    }

    state.activeSpaceId =
      state.spaces.some(
        space => space.id === parsed.activeSpaceId
      )
        ? parsed.activeSpaceId
        : state.spaces[0].id;

  } catch {
    createInitialState();
    showToast("Workspace was reset.");
  }
}


/* =========================
   THEME
========================= */

function applyTheme() {
  document.documentElement.dataset.theme =
    state.theme;

  const icon = $("#themeBtn i");

  if (icon) {
    icon.className =
      state.theme === "dark"
        ? "fa-solid fa-sun"
        : "fa-solid fa-moon";
  }
}

function toggleTheme() {
  state.theme =
    state.theme === "dark"
      ? "light"
      : "dark";

  applyTheme();
  saveState();
}


/* =========================
   TABS
========================= */

function renderTabs() {
  tabs.replaceChildren();

  for (const space of state.spaces) {
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
      <span class="tab-name"></span>
      <button class="tab-menu" title="Space options">
        <i class="fa-solid fa-ellipsis"></i>
      </button>
    `;

    $(".tab-name", tab).textContent =
      space.name;

    tabs.appendChild(tab);
  }
}


/* =========================
   SPACE RENDER
========================= */

function renderActiveSpace() {
  const space = activeSpace();

  boxesLayer.replaceChildren();

  if (!space) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.toggle(
    "hidden",
    space.boxes.length !== 0
  );

  for (const box of space.boxes) {
    boxesLayer.appendChild(
      createBoxElement(box)
    );
  }

  renderConnections();
}


/* =========================
   BOX CREATION
========================= */

function createBoxElement(box) {
  const el =
    document.createElement("article");

  el.className = `box box-${box.type}`;

  el.dataset.boxId = box.id;

  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.zIndex = String(box.z);

  const icons = {
    text: "fa-font",
    parent: "fa-folder",
    task: "fa-list-check",
    link: "fa-link",
    chart: "fa-chart-simple"
  };

  el.innerHTML = `
    <header class="box-header">
      <span class="box-type">
        <i class="fa-solid ${icons[box.type]}"></i>
      </span>

      <span class="box-title"></span>

      <div class="box-actions">

        <button
          class="box-btn edit-box"
          title="Edit"
        >
          <i class="fa-solid fa-pen"></i>
        </button>

        <button
          class="box-btn delete delete-box"
          title="Delete"
        >
          <i class="fa-solid fa-trash"></i>
        </button>

      </div>
    </header>

    <div class="box-body"></div>

    <div
      class="box-resize"
      title="Resize"
    ></div>
  `;

  $(".box-title", el).textContent =
    box.title;

  const body = $(".box-body", el);

  switch (box.type) {
    case "text":
      renderTextBox(box, body);
      break;

    case "parent":
      renderParentBox(box, body);
      break;

    case "task":
      renderTaskBox(box, body);
      break;

    case "link":
      renderLinkBox(box, body);
      break;

    case "chart":
      renderChartBox(box, body);
      break;
  }

  return el;
}


/* =========================
   TEXT
========================= */

function renderTextBox(box, body) {
  body.innerHTML = `
    <div class="text-editor">

      <div class="rich-toolbar">

        <button class="rich-tool" data-command="bold">
          <i class="fa-solid fa-bold"></i>
        </button>

        <button class="rich-tool" data-command="italic">
          <i class="fa-solid fa-italic"></i>
        </button>

        <button class="rich-tool" data-command="underline">
          <i class="fa-solid fa-underline"></i>
        </button>

        <button class="rich-tool" data-command="formatBlock" data-value="H2">
          H2
        </button>

        <button class="rich-tool" data-command="formatBlock" data-value="H3">
          H3
        </button>

        <button class="rich-tool" data-command="insertUnorderedList">
          <i class="fa-solid fa-list"></i>
        </button>

        <button class="rich-tool" data-command="insertOrderedList">
          <i class="fa-solid fa-list-ol"></i>
        </button>

        <button class="rich-tool" data-command="formatBlock" data-value="BLOCKQUOTE">
          <i class="fa-solid fa-quote-left"></i>
        </button>

        <button class="rich-tool" data-rich-link>
          <i class="fa-solid fa-link"></i>
        </button>

      </div>

      <div
        class="rich-content"
        contenteditable="true"
        spellcheck="true"
      ></div>

    </div>
  `;

  $(".rich-content", body).innerHTML =
    box.content || "";
}


/* =========================
   PARENT
========================= */

function renderParentBox(box, body) {
  const space = activeSpace();

  const children =
    space.boxes.filter(
      child => child.parentId === box.id
    );

  body.innerHTML = `
    <div class="folder-box">

      <div class="parent-description">
        ${children.length
          ? `${children.length} item${children.length > 1 ? "s" : ""} in this folder.`
          : "This folder is empty."
        }
      </div>

      <div class="child-list">
        ${
          children.length
            ? children.map(child => `
                <span class="child-tag">
                  ${escapeHTML(child.title)}
                </span>
              `).join("")
            : `<span class="no-children">No connected boxes</span>`
        }
      </div>

    </div>
  `;
}


/* =========================
   TASK
========================= */

function renderTaskBox(box, body) {
  body.innerHTML = `
    <div class="task-list">

      ${
        box.tasks.map(task => `
          <div
            class="task-row ${task.done ? "done" : ""}"
            data-task-id="${escapeHTML(task.id)}"
          >

            <button class="task-check">
              ${
                task.done
                  ? `<i class="fa-solid fa-check"></i>`
                  : ""
              }
            </button>

            <div
              class="task-text"
              contenteditable="true"
              spellcheck="true"
            >${escapeHTML(task.text)}</div>

            <button class="task-remove">
              <i class="fa-solid fa-xmark"></i>
            </button>

          </div>
        `).join("")
      }

      <button class="add-task">
        <i class="fa-solid fa-plus"></i>
        Add task
      </button>

    </div>
  `;
}


/* =========================
   LINK
========================= */

function normalizeURL(value) {
  const text =
    String(value || "").trim();

  try {
    const url = new URL(text);

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

function renderLinkBox(box, body) {
  body.innerHTML = `
    <div class="link-box">

      <div class="link-url">

        <input
          class="link-input"
          type="url"
          placeholder="https://example.com"
          autocomplete="off"
        >

        <button class="link-save">
          <i class="fa-solid fa-arrow-right"></i>
        </button>

      </div>

      <div class="link-preview"></div>

    </div>
  `;

  $(".link-input", body).value =
    box.url || "";

  updateLinkPreview(box, body);
}

function youtubeID(url) {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname.includes("youtube.com")
    ) {
      return parsed.searchParams.get("v");
    }

    if (
      parsed.hostname.includes("youtu.be")
    ) {
      return parsed.pathname.slice(1);
    }
  } catch {}

  return null;
}

function vimeoID(url) {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname.includes("vimeo.com")
    ) {
      const match =
        parsed.pathname.match(/\/(\d+)/);

      return match?.[1] || null;
    }
  } catch {}

  return null;
}

function updateLinkPreview(box, body) {
  const preview =
    $(".link-preview", body);

  preview.replaceChildren();

  if (!box.url) {
    preview.textContent =
      "Enter a URL to create a preview.";

    return;
  }

  const youtube =
    youtubeID(box.url);

  if (youtube) {
    const iframe =
      document.createElement("iframe");

    iframe.className = "embed";

    iframe.src =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtube)}`;

    iframe.loading = "lazy";
    iframe.referrerPolicy =
      "strict-origin-when-cross-origin";

    preview.appendChild(iframe);
    return;
  }

  const vimeo =
    vimeoID(box.url);

  if (vimeo) {
    const iframe =
      document.createElement("iframe");

    iframe.className = "embed";

    iframe.src =
      `https://player.vimeo.com/video/${encodeURIComponent(vimeo)}`;

    iframe.loading = "lazy";

    preview.appendChild(iframe);
    return;
  }

  const link =
    document.createElement("a");

  link.href = box.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = box.url;

  preview.appendChild(link);

  const small =
    document.createElement("small");

  small.textContent =
    "Open in a new tab";

  preview.appendChild(small);
}


/* =========================
   CHART
========================= */

function renderChartBox(box, body) {
  body.innerHTML = `
    <div class="chart-box">

      <div class="chart-meta">
        <span class="chart-kind">
          ${escapeHTML(
            box.chart.kind.toUpperCase()
          )}
        </span>

        <button
          class="box-btn edit-chart"
          title="Edit chart"
        >
          <i class="fa-solid fa-sliders"></i>
        </button>
      </div>

      <div class="chart-render"></div>

    </div>
  `;

  drawChart(
    box,
    $(".chart-render", body)
  );
}

function drawChart(box, target) {
  target.replaceChildren();

  const chart =
    normalizeChart(box.chart);

  if (!chart.labels.length) {
    const empty =
      document.createElement("div");

    empty.className = "chart-empty";
    empty.textContent =
      "No chart data.";

    target.appendChild(empty);
    return;
  }

  const width = 310;
  const height = 150;

  if (chart.kind === "pie") {
    drawPieChart(
      chart,
      target,
      width,
      height
    );
    return;
  }

  const svg =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );

  svg.classList.add("chart-svg");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const max =
    Math.max(
      1,
      ...chart.values
    );

  const left = 28;
  const right = 8;
  const top = 8;
  const bottom = 25;

  const graphW =
    width - left - right;

  const graphH =
    height - top - bottom;

  for (let i = 0; i <= 4; i++) {
    const y =
      top + graphH -
      (graphH * i / 4);

    const line =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );

    line.classList.add("chart-grid");

    line.setAttribute("x1", left);
    line.setAttribute("x2", width - right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);

    svg.appendChild(line);
  }

  if (chart.kind === "bar") {
    const slot =
      graphW / chart.values.length;

    const barWidth =
      Math.max(
        10,
        Math.min(42, slot * .58)
      );

    chart.values.forEach(
      (value, index) => {
        const x =
          left +
          slot * index +
          (slot - barWidth) / 2;

        const h =
          graphH *
          (Math.max(0, value) / max);

        const y =
          top + graphH - h;

        const rect =
          document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
          );

        rect.classList.add("chart-bar");

        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", barWidth);
        rect.setAttribute("height", h);
        rect.setAttribute("rx", 4);

        svg.appendChild(rect);

        const label =
          document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
          );

        label.classList.add("chart-label");

        label.setAttribute(
          "x",
          x + barWidth / 2
        );

        label.setAttribute(
          "y",
          height - 7
        );

        label.setAttribute(
          "text-anchor",
          "middle"
        );

        label.textContent =
          chart.labels[index].slice(0, 10);

        svg.appendChild(label);
      }
    );
  }

  if (chart.kind === "line") {
    const points = chart.values.map(
      (value, index) => {
        const x =
          chart.values.length === 1
            ? left + graphW / 2
            : left +
              graphW *
              (index / (chart.values.length - 1));

        const y =
          top +
          graphH -
          graphH *
          (Math.max(0, value) / max);

        return { x, y };
      }
    );

    const path =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );

    path.classList.add("chart-line");

    path.setAttribute(
      "d",
      points.map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
      ).join(" ")
    );

    svg.appendChild(path);

    points.forEach(
      (point, index) => {
        const circle =
          document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
          );

        circle.classList.add("chart-point");

        circle.setAttribute("cx", point.x);
        circle.setAttribute("cy", point.y);
        circle.setAttribute("r", 4);

        svg.appendChild(circle);

        const label =
          document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
          );

        label.classList.add("chart-label");

        label.setAttribute("x", point.x);
        label.setAttribute("y", height - 7);
        label.setAttribute("text-anchor", "middle");

        label.textContent =
          chart.labels[index].slice(0, 9);

        svg.appendChild(label);
      }
    );
  }

  target.appendChild(svg);
}

function drawPieChart(chart, target, width, height) {
  const svg =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );

  svg.classList.add("chart-svg");

  svg.setAttribute(
    "viewBox",
    `0 0 ${width} ${height}`
  );

  const total =
    chart.values.reduce(
      (sum, value) =>
        sum + Math.max(0, value),
      0
    );

  if (!total) {
    const empty =
      document.createElement("div");

    empty.className = "chart-empty";
    empty.textContent =
      "Values must be greater than zero.";

    target.appendChild(empty);
    return;
  }

  const cx = 85;
  const cy = 75;
  const radius = 58;

  let angle = -Math.PI / 2;

  const legend =
    document.createElement("div");

  legend.className =
    "chart-legend";

  chart.values.forEach(
    (value, index) => {
      const portion =
        Math.max(0, value) / total;

      const next =
        angle +
        portion * Math.PI * 2;

      const large =
        next - angle > Math.PI
          ? 1
          : 0;

      const x1 =
        cx + radius * Math.cos(angle);

      const y1 =
        cy + radius * Math.sin(angle);

      const x2 =
        cx + radius * Math.cos(next);

      const y2 =
        cy + radius * Math.sin(next);

      const path =
        document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );

      path.classList.add(
        "chart-pie-slice"
      );

      path.setAttribute(
        "d",
        `
          M ${cx} ${cy}
          L ${x1} ${y1}
          A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}
          Z
        `
      );

      svg.appendChild(path);

      const item =
        document.createElement("div");

      item.className =
        "legend-item";

      item.innerHTML = `
        <span class="legend-dot"></span>
        <span></span>
      `;

      item.querySelector("span:last-child")
        .textContent =
          `${chart.labels[index]} ${Math.round(portion * 100)}%`;

      legend.appendChild(item);

      angle = next;
    }
  );

  target.appendChild(svg);
  target.appendChild(legend);
}


/* =========================
   CONNECTIONS
========================= */

function renderConnections() {
  const space = activeSpace();

  connections.replaceChildren();

  if (!space) return;

  const byId = new Map(
    space.boxes.map(
      box => [box.id, box]
    )
  );

  for (const child of space.boxes) {
    if (!child.parentId) continue;

    const parent =
      byId.get(child.parentId);

    if (!parent) continue;

    const startX =
      parent.x + parent.width / 2;

    const startY =
      parent.y + parent.height;

    const endX =
      child.x + child.width / 2;

    const endY =
      child.y;

    const distance =
      Math.max(
        60,
        Math.abs(endY - startY) * .45
      );

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
        M ${startX} ${startY}
        C ${startX} ${startY + distance},
          ${endX} ${endY - distance},
          ${endX} ${endY}
      `
    );

    connections.appendChild(path);
  }
}


/* =========================
   BOX POSITION
========================= */

function applyBoxPosition(el, box) {
  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
}

function updateConnectionFast() {
  requestAnimationFrame(
    renderConnections
  );
}


/* =========================
   DRAG
========================= */

function startDrag(event, el) {
  if (event.button !== 0) return;

  const box =
    getBox(el.dataset.boxId);

  if (!box) return;

  if (
    event.target.closest("button") ||
    event.target.closest("input") ||
    event.target.closest("textarea") ||
    event.target.closest("[contenteditable='true']") ||
    event.target.closest(".box-resize")
  ) {
    return;
  }

  event.preventDefault();

  const descendants =
    collectDescendants(box.id);

  dragState = {
    pointerId: event.pointerId,

    boxId: box.id,

    startX: event.clientX,
    startY: event.clientY,

    boxes: [
      {
        box,
        x: box.x,
        y: box.y
      },

      ...descendants.map(child => ({
        box: child,
        x: child.x,
        y: child.y
      }))
    ]
  };

  el.classList.add("is-dragging");

  el.setPointerCapture(
    event.pointerId
  );

  el.style.zIndex = "100";
}

function moveDrag(event, el) {
  if (!dragState) return;

  if (
    event.pointerId !==
    dragState.pointerId
  ) {
    return;
  }

  const dx =
    event.clientX -
    dragState.startX;

  const dy =
    event.clientY -
    dragState.startY;

  for (const item of dragState.boxes) {
    item.box.x =
      Math.max(
        20,
        item.x + dx
      );

    item.box.y =
      Math.max(
        20,
        item.y + dy
      );

    const element =
      boxesLayer.querySelector(
        `[data-box-id="${CSS.escape(item.box.id)}"]`
      );

    if (element) {
      applyBoxPosition(
        element,
        item.box
      );
    }
  }

  updateConnectionFast();
}

function endDrag(event, el) {
  if (!dragState) return;

  if (
    event.pointerId !==
    dragState.pointerId
  ) {
    return;
  }

  el.classList.remove(
    "is-dragging"
  );

  el.releasePointerCapture?.(
    event.pointerId
  );

  el.style.zIndex =
    String(
      getBox(el.dataset.boxId)?.z || 10
    );

  dragState = null;

  saveState();
  renderConnections();
}

function collectDescendants(parentId) {
  const space = activeSpace();

  if (!space) return [];

  const result = [];

  function walk(id) {
    const children =
      space.boxes.filter(
        box => box.parentId === id
      );

    for (const child of children) {
      result.push(child);
      walk(child.id);
    }
  }

  walk(parentId);

  return result;
}


/* =========================
   RESIZE
========================= */

function startResize(event, el) {
  if (event.button !== 0) return;

  const box =
    getBox(el.dataset.boxId);

  if (!box) return;

  event.preventDefault();
  event.stopPropagation();

  resizeState = {
    pointerId: event.pointerId,

    box,

    element: el,

    startX: event.clientX,
    startY: event.clientY,

    width: box.width,
    height: box.height
  };

  el.classList.add(
    "is-dragging"
  );

  el.setPointerCapture(
    event.pointerId
  );

  el.style.zIndex = "100";
}

function moveResize(event) {
  if (!resizeState) return;

  if (
    event.pointerId !==
    resizeState.pointerId
  ) {
    return;
  }

  const box =
    resizeState.box;

  box.width =
    clamp(
      resizeState.width +
        event.clientX -
        resizeState.startX,

      MIN_W,
      MAX_W
    );

  box.height =
    clamp(
      resizeState.height +
        event.clientY -
        resizeState.startY,

      MIN_H,
      MAX_H
    );

  resizeState.element.style.width =
    `${box.width}px`;

  resizeState.element.style.height =
    `${box.height}px`;

  requestAnimationFrame(
    renderConnections
  );
}

function endResize(event) {
  if (!resizeState) return;

  if (
    event.pointerId !==
    resizeState.pointerId
  ) {
    return;
  }

  const el =
    resizeState.element;

  el.classList.remove(
    "is-dragging"
  );

  el.releasePointerCapture?.(
    event.pointerId
  );

  el.style.zIndex =
    String(resizeState.box.z || 10);

  resizeState = null;

  saveState();
  renderConnections();
}


/* =========================
   MODAL
========================= */

function closeModal() {
  modalRoot.replaceChildren();
  modalRoot.hidden = true;
}

function openModal({
  title,
  description = "",
  icon = "fa-window-maximize",
  bodyHTML = "",
  buttons = []
}) {
  modalRoot.hidden = false;

  const modal =
    document.createElement("div");

  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-head">

      <div class="modal-icon">
        <i class="fa-solid ${icon}"></i>
      </div>

      <div class="modal-title">
        <h2>${escapeHTML(title)}</h2>
        ${
          description
            ? `<p>${escapeHTML(description)}</p>`
            : ""
        }
      </div>

      <button class="modal-close">
        <i class="fa-solid fa-xmark"></i>
      </button>

    </div>

    <div class="modal-body">
      ${bodyHTML}
    </div>

    <div class="modal-foot"></div>
  `;

  const foot =
    $(".modal-foot", modal);

  for (const button of buttons) {
    const btn =
      document.createElement("button");

    btn.className =
      `btn ${button.className || ""}`;

    btn.textContent =
      button.label;

    btn.addEventListener(
      "click",
      () => {
        button.action?.(modal);
      }
    );

    foot.appendChild(btn);
  }

  $(".modal-close", modal)
    .addEventListener(
      "click",
      closeModal
    );

  modalRoot.replaceChildren(modal);
}


/* =========================
   SPACE ACTIONS
========================= */

function addSpace() {
  openModal({
    title: "New Space",
    description: "Create a new workspace.",
    icon: "fa-layer-group",

    bodyHTML: `
      <div class="modal-field">
        <label class="modal-label">
          Space name
        </label>

        <input
          class="modal-input"
          id="newSpaceName"
          value="New Space"
          maxlength="80"
          autofocus
        >
      </div>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Create",
        className: "primary",

        action: modal => {
          const name =
            $("#newSpaceName", modal)
              ?.value
              .trim();

          if (!name) return;

          const space = {
            id: uid("space"),
            name,
            boxes: []
          };

          state.spaces.push(space);
          state.activeSpaceId =
            space.id;

          saveState();
          renderTabs();
          renderActiveSpace();
          closeModal();
        }
      }
    ]
  });
}

function renameSpace(space) {
  openModal({
    title: "Rename Space",
    description: "Choose a new name.",
    icon: "fa-pen",

    bodyHTML: `
      <div class="modal-field">
        <label class="modal-label">
          Name
        </label>

        <input
          class="modal-input"
          id="renameSpaceInput"
          value="${escapeHTML(space.name)}"
          maxlength="80"
        >
      </div>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Save",
        className: "primary",

        action: modal => {
          const name =
            $("#renameSpaceInput", modal)
              ?.value
              .trim();

          if (!name) return;

          space.name = name;

          saveState();
          renderTabs();
          closeModal();
        }
      }
    ]
  });
}

function deleteSpace(space) {
  openModal({
    title: "Delete Space",
    description: "This action cannot be undone.",
    icon: "fa-trash",

    bodyHTML: `
      <p class="modal-note">
        You're about to delete
        <strong>${escapeHTML(space.name)}</strong>.
        All boxes inside this Space will be removed.
      </p>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Continue",
        className: "danger",

        action: () => {
          openDeleteConfirmation(space);
        }
      }
    ]
  });
}

function openDeleteConfirmation(space) {
  openModal({
    title: "Final confirmation",
    description: "Confirm the deletion.",
    icon: "fa-triangle-exclamation",

    bodyHTML: `
      <div class="modal-field">

        <label class="modal-label">
          Type the Space name
        </label>

        <input
          class="modal-input"
          id="deleteSpaceInput"
          placeholder="${escapeHTML(space.name)}"
          autocomplete="off"
        >

      </div>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Delete",
        className: "danger",

        action: modal => {
          const value =
            $("#deleteSpaceInput", modal)
              ?.value
              .trim();

          if (value !== space.name) {
            showToast("Name does not match.");
            return;
          }

          state.spaces =
            state.spaces.filter(
              item => item.id !== space.id
            );

          if (!state.spaces.length) {
            createInitialState();
          } else if (
            state.activeSpaceId === space.id
          ) {
            state.activeSpaceId =
              state.spaces[0].id;
          }

          saveState();
          renderTabs();
          renderActiveSpace();
          closeModal();
        }
      }
    ]
  });
}


/* =========================
   BOX ACTIONS
========================= */

function nextPosition() {
  const space = activeSpace();

  const count =
    space?.boxes.length || 0;

  return {
    x: 120 + (count % 4) * 60,
    y: 120 + (count % 5) * 50
  };
}

function createBox(type) {
  const space = activeSpace();

  if (!space) return;

  const pos =
    nextPosition();

  const box = {
    id: uid("box"),
    type,

    title:
      type === "text"
        ? "Text"
        : type === "parent"
          ? "Folder"
          : type === "task"
            ? "Tasks"
            : type === "link"
              ? "Link"
              : "Chart",

    content:
      type === "text"
        ? "<p></p>"
        : "",

    url: "",

    tasks:
      type === "task"
        ? [
            {
              id: uid("task"),
              text: "New task",
              done: false
            }
          ]
        : [],

    chart:
      type === "chart"
        ? {
            kind: "bar",
            description: "",
            labels: ["A", "B", "C"],
            values: [10, 20, 30]
          }
        : normalizeChart(),

    parentId: null,

    x: pos.x,
    y: pos.y,

    width:
      type === "chart"
        ? 380
        : 340,

    height:
      type === "chart"
        ? 300
        : 220,

    z: 10 + space.boxes.length
  };

  space.boxes.push(box);

  saveState();
  renderActiveSpace();

  requestAnimationFrame(() => {
    const el =
      boxesLayer.querySelector(
        `[data-box-id="${CSS.escape(box.id)}"]`
      );

    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
  });

  if (type === "chart") {
    openChartEditor(box);
  }
}

function editBox(box) {
  if (box.type === "chart") {
    openChartEditor(box);
    return;
  }

  openModal({
    title: "Edit Box",
    description: "Change the box title or parent.",
    icon: "fa-pen",

    bodyHTML: `
      <div class="modal-field">

        <label class="modal-label">
          Title
        </label>

        <input
          class="modal-input"
          id="editBoxTitle"
          value="${escapeHTML(box.title)}"
          maxlength="100"
        >

      </div>

      <div class="modal-field">

        <label class="modal-label">
          Parent folder
        </label>

        <select
          class="modal-select"
          id="editBoxParent"
        ></select>

      </div>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Save",
        className: "primary",

        action: modal => {
          const title =
            $("#editBoxTitle", modal)
              ?.value
              .trim();

          const parent =
            $("#editBoxParent", modal)
              ?.value;

          if (!title) return;

          box.title = title;
          box.parentId =
            parent || null;

          saveState();
          renderActiveSpace();
          closeModal();
        }
      }
    ]
  });

  const select =
    $("#editBoxParent");

  const space = activeSpace();

  const folders =
    space.boxes.filter(
      item =>
        item.type === "parent" &&
        item.id !== box.id &&
        !isDescendant(
          item.id,
          box.id
        )
    );

  const none =
    document.createElement("option");

  none.value = "";
  none.textContent = "No parent";

  select.appendChild(none);

  for (const folder of folders) {
    const option =
      document.createElement("option");

    option.value = folder.id;
    option.textContent =
      folder.title;

    option.selected =
      folder.id === box.parentId;

    select.appendChild(option);
  }
}

function isDescendant(id, ancestorId) {
  const space = activeSpace();

  let current =
    space.boxes.find(
      box => box.id === id
    );

  const seen = new Set();

  while (current?.parentId) {
    if (seen.has(current.id)) {
      return false;
    }

    seen.add(current.id);

    if (current.parentId === ancestorId) {
      return true;
    }

    current =
      space.boxes.find(
        box =>
          box.id === current.parentId
      );
  }

  return false;
}

function deleteBox(box) {
  const space = activeSpace();

  if (!space) return;

  openModal({
    title: "Delete Box",
    description: "Remove this box from the Space.",
    icon: "fa-trash",

    bodyHTML: `
      <p class="modal-note">
        Delete
        <strong>${escapeHTML(box.title)}</strong>?
        Child boxes will become independent.
      </p>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Delete",
        className: "danger",

        action: () => {
          for (const child of space.boxes) {
            if (child.parentId === box.id) {
              child.parentId = null;
            }
          }

          space.boxes =
            space.boxes.filter(
              item => item.id !== box.id
            );

          saveState();
          renderActiveSpace();
          closeModal();
        }
      }
    ]
  });
}


/* =========================
   CHART MODAL
========================= */

function openChartEditor(box) {
  const chart =
    normalizeChart(box.chart);

  openModal({
    title: "Chart",
    description: "Configure your chart.",
    icon: "fa-chart-simple",

    bodyHTML: `
      <div class="modal-field">

        <label class="modal-label">
          Title
        </label>

        <input
          class="modal-input"
          id="chartTitle"
          value="${escapeHTML(box.title)}"
          maxlength="100"
        >

      </div>

      <div class="chart-type-tabs">

        <button
          class="chart-type ${chart.kind === "bar" ? "active" : ""}"
          data-chart-kind="bar"
        >
          Bar
        </button>

        <button
          class="chart-type ${chart.kind === "line" ? "active" : ""}"
          data-chart-kind="line"
        >
          Line
        </button>

        <button
          class="chart-type ${chart.kind === "pie" ? "active" : ""}"
          data-chart-kind="pie"
        >
          Pie
        </button>

      </div>

      <div class="chart-data"></div>

      <button class="add-chart-row">
        <i class="fa-solid fa-plus"></i>
        Add data
      </button>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Save chart",
        className: "primary",

        action: modal => {
          const rows =
            $$(".chart-data-row", modal);

          const labels = [];
          const values = [];

          for (const row of rows) {
            const label =
              $(".chart-label-input", row)
                .value
                .trim();

            const value =
              Number(
                $(".chart-value-input", row)
                  .value
              );

            if (!label) continue;

            labels.push(label);
            values.push(
              Number.isFinite(value)
                ? value
                : 0
            );
          }

          box.title =
            $("#chartTitle", modal)
              .value
              .trim() ||
            "Chart";

          box.chart = {
            kind:
              modal.dataset.chartKind ||
              chart.kind,

            description: "",

            labels,
            values
          };

          saveState();
          renderActiveSpace();
          closeModal();
        }
      }
    ]
  });

  const modal = $(".modal");
  const data = $(".chart-data", modal);

  modal.dataset.chartKind =
    chart.kind;

  function renderRows() {
    data.replaceChildren();

    chart.labels.forEach(
      (label, index) => {
        addChartRow(
          data,
          label,
          chart.values[index]
        );
      }
    );
  }

  function addChartRow(
    container,
    label = "",
    value = 0
  ) {
    const row =
      document.createElement("div");

    row.className =
      "chart-data-row";

    row.innerHTML = `
      <input
        class="chart-label-input"
        placeholder="Label"
        value="${escapeHTML(label)}"
        maxlength="80"
      >

      <input
        class="chart-value-input"
        type="number"
        placeholder="Value"
        value="${Number(value) || 0}"
      >

      <button
        class="remove-chart-row"
        title="Remove"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    container.appendChild(row);
  }

  renderRows();

  $$(".chart-type", modal)
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          $$(".chart-type", modal)
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

          button.classList.add("active");

          modal.dataset.chartKind =
            button.dataset.chartKind;
        }
      );
    });

  $(".add-chart-row", modal)
    .addEventListener(
      "click",
      () => addChartRow(data)
    );
}


/* =========================
   EXPORT
========================= */

function exportJSON() {
  const output = {
    version: state.version,
    theme: state.theme,
    spaces: state.spaces,
    activeSpaceId:
      state.activeSpaceId
  };

  const blob =
    new Blob(
      [
        JSON.stringify(
          output,
          null,
          2
        )
      ],
      {
        type: "application/json"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download =
    `space-chi-${Date.now()}.json`;

  link.click();

  URL.revokeObjectURL(url);

  showToast("JSON exported.");
}


/* =========================
   IMPORT
========================= */

function importJSON(file) {
  const reader =
    new FileReader();

  reader.onload = () => {
    try {
      const parsed =
        JSON.parse(
          String(reader.result)
        );

      if (
        !parsed ||
        !Array.isArray(parsed.spaces)
      ) {
        throw new Error();
      }

      const imported =
        parsed.spaces.map(
          normalizeSpace
        );

      const boxCount =
        imported.reduce(
          (sum, space) =>
            sum + space.boxes.length,
          0
        );

      openModal({
        title: "Import JSON",
        description: "Choose how to import this workspace.",
        icon: "fa-file-import",

        bodyHTML: `
          <p class="modal-note">
            Found
            <strong>${imported.length}</strong>
            Space(s) and
            <strong>${boxCount}</strong>
            box(es).
          </p>
        `,

        buttons: [
          {
            label: "Cancel",
            action: closeModal
          },

          {
            label: "Add Spaces",

            action: () => {
              const remapped =
                remapImportedSpaces(
                  imported
                );

              state.spaces.push(
                ...remapped
              );

              state.activeSpaceId =
                remapped[0]?.id ||
                state.activeSpaceId;

              saveState();
              renderTabs();
              renderActiveSpace();
              closeModal();

              showToast(
                "Spaces imported."
              );
            }
          },

          {
            label: "Replace",
            className: "danger",

            action: () => {
              const remapped =
                remapImportedSpaces(
                  imported
                );

              state.spaces =
                remapped;

              state.activeSpaceId =
                remapped[0]?.id ||
                null;

              if (!state.spaces.length) {
                createInitialState();
              }

              saveState();
              renderTabs();
              renderActiveSpace();
              closeModal();

              showToast(
                "Workspace replaced."
              );
            }
          }
        ]
      });

    } catch {
      showToast(
        "Invalid JSON file."
      );
    }
  };

  reader.readAsText(file);
}

function remapImportedSpaces(spaces) {
  return spaces.map(space => {
    const oldToNew =
      new Map();

    const newSpace = {
      ...space,
      id: uid("space"),
      boxes: []
    };

    for (const box of space.boxes) {
      oldToNew.set(
        box.id,
        uid("box")
      );
    }

    for (const oldBox of space.boxes) {
      const box =
        normalizeBox(oldBox);

      box.id =
        oldToNew.get(
          oldBox.id
        );

      box.parentId =
        oldBox.parentId
          ? oldToNew.get(
              oldBox.parentId
            ) || null
          : null;

      newSpace.boxes.push(box);
    }

    return newSpace;
  });
}


/* =========================
   FULLSCREEN
========================= */

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
      "Fullscreen is unavailable."
    );
  }
}

function updateFullscreenButton() {
  const icon =
    $("#fullscreenBtn i");

  if (!icon) return;

  icon.className =
    document.fullscreenElement
      ? "fa-solid fa-compress"
      : "fa-solid fa-expand";
}


/* =========================
   EVENTS
========================= */

function setupEvents() {

  $("#addSpaceBtn")
    .addEventListener(
      "click",
      addSpace
    );

  $("#themeBtn")
    .addEventListener(
      "click",
      toggleTheme
    );

  $("#fullscreenBtn")
    .addEventListener(
      "click",
      toggleFullscreen
    );

  $("#exportBtn")
    .addEventListener(
      "click",
      exportJSON
    );

  $("#importBtn")
    .addEventListener(
      "click",
      () =>
        $("#fileInput").click()
    );

  $("#fileInput")
    .addEventListener(
      "change",
      event => {
        const file =
          event.target.files?.[0];

        if (file) {
          importJSON(file);
        }

        event.target.value = "";
      }
    );

  document.addEventListener(
    "fullscreenchange",
    updateFullscreenButton
  );


  /* Add boxes */

  document.addEventListener(
    "click",
    event => {
      const add =
        event.target.closest(
          "[data-add]"
        );

      if (add) {
        createBox(
          add.dataset.add
        );
      }
    }
  );


  /* Tabs */

  tabs.addEventListener(
    "click",
    event => {
      const tab =
        event.target.closest(".tab");

      if (!tab) return;

      const space =
        state.spaces.find(
          item =>
            item.id ===
            tab.dataset.spaceId
        );

      if (!space) return;

      if (
        event.target.closest(".tab-menu")
      ) {
        openSpaceMenu(space);
        return;
      }

      state.activeSpaceId =
        space.id;

      saveState();

      renderTabs();
      renderActiveSpace();
    }
  );


  /* Double click tab rename */

  tabs.addEventListener(
    "dblclick",
    event => {
      const tab =
        event.target.closest(".tab");

      if (!tab) return;

      const space =
        state.spaces.find(
          item =>
            item.id ===
            tab.dataset.spaceId
        );

      if (space) {
        renameSpace(space);
      }
    }
  );


  /* Box events */

  boxesLayer.addEventListener(
    "pointerdown",
    event => {
      const resize =
        event.target.closest(
          ".box-resize"
        );

      if (resize) {
        const box =
          resize.closest(".box");

        if (box) {
          startResize(
            event,
            box
          );
        }

        return;
      }

      const header =
        event.target.closest(
          ".box-header"
        );

      if (!header) return;

      const box =
        header.closest(".box");

      if (!box) return;

      startDrag(
        event,
        box
      );
    }
  );


  boxesLayer.addEventListener(
    "pointermove",
    event => {

      if (dragState) {
        const box =
          boxesLayer.querySelector(
            `[data-box-id="${CSS.escape(dragState.boxId)}"]`
          );

        if (box) {
          moveDrag(
            event,
            box
          );
        }

        return;
      }

      if (resizeState) {
        moveResize(event);
      }

    }
  );


  boxesLayer.addEventListener(
    "pointerup",
    event => {

      if (dragState) {
        const box =
          boxesLayer.querySelector(
            `[data-box-id="${CSS.escape(dragState.boxId)}"]`
          );

        if (box) {
          endDrag(
            event,
            box
          );
        }

        return;
      }

      if (resizeState) {
        endResize(event);
      }

    }
  );


  boxesLayer.addEventListener(
    "pointercancel",
    event => {

      if (dragState) {
        const box =
          boxesLayer.querySelector(
            `[data-box-id="${CSS.escape(dragState.boxId)}"]`
          );

        if (box) {
          endDrag(
            event,
            box
          );
        }
      }

      if (resizeState) {
        endResize(event);
      }

    }
  );


  /* Box buttons */

  boxesLayer.addEventListener(
    "click",
    event => {

      const boxEl =
        event.target.closest(".box");

      if (!boxEl) return;

      const box =
        getBox(
          boxEl.dataset.boxId
        );

      if (!box) return;


      if (
        event.target.closest(
          ".delete-box"
        )
      ) {
        deleteBox(box);
        return;
      }


      if (
        event.target.closest(
          ".edit-box"
        )
      ) {
        editBox(box);
        return;
      }


      if (
        event.target.closest(
          ".edit-chart"
        )
      ) {
        openChartEditor(box);
        return;
      }


      if (
        event.target.closest(
          ".add-task"
        )
      ) {
        box.tasks.push({
          id: uid("task"),
          text: "New task",
          done: false
        });

        saveState();

        const body =
          $(".box-body", boxEl);

        renderTaskBox(
          box,
          body
        );

        return;
      }


      if (
        event.target.closest(
          ".task-check"
        )
      ) {
        const row =
          event.target.closest(
            ".task-row"
          );

        const task =
          box.tasks.find(
            item =>
              item.id ===
              row.dataset.taskId
          );

        if (task) {
          task.done = !task.done;

          saveState();

          renderTaskBox(
            box,
            $(".box-body", boxEl)
          );
        }

        return;
      }


      if (
        event.target.closest(
          ".task-remove"
        )
      ) {
        const row =
          event.target.closest(
            ".task-row"
          );

        box.tasks =
          box.tasks.filter(
            task =>
              task.id !==
              row.dataset.taskId
          );

        saveState();

        renderTaskBox(
          box,
          $(".box-body", boxEl)
        );

        return;
      }


      if (
        event.target.closest(
          ".link-save"
        )
      ) {
        const input =
          $(".link-input", boxEl);

        const url =
          normalizeURL(
            input.value
          );

        if (!url) {
          showToast(
            "Enter a valid HTTP or HTTPS URL."
          );
          return;
        }

        box.url = url;

        saveState();

        updateLinkPreview(
          box,
          $(".box-body", boxEl)
        );

        return;
      }

    }
  );


  /* Rich text */

  boxesLayer.addEventListener(
    "mousedown",
    event => {
      const button =
        event.target.closest(
          ".rich-tool"
        );

      if (!button) return;

      event.preventDefault();

      const boxEl =
        button.closest(".box");

      const box =
        getBox(
          boxEl.dataset.boxId
        );

      if (!box) return;

      if (
        button.hasAttribute(
          "data-rich-link"
        )
      ) {
        openRichLinkModal(
          boxEl
        );

        return;
      }

      const editor =
        $(".rich-content", boxEl);

      editor.focus();

      document.execCommand(
        button.dataset.command,
        false,
        button.dataset.value || null
      );

      box.content =
        normalizeHTML(
          editor.innerHTML
        );

      saveState();
    }
  );


  boxesLayer.addEventListener(
    "input",
    event => {

      const boxEl =
        event.target.closest(".box");

      if (!boxEl) return;

      const box =
        getBox(
          boxEl.dataset.boxId
        );

      if (!box) return;


      if (
        event.target.matches(
          ".rich-content"
        )
      ) {
        box.content =
          normalizeHTML(
            event.target.innerHTML
          );

        saveState();
      }


      if (
        event.target.matches(
          ".task-text"
        )
      ) {
        const row =
          event.target.closest(
            ".task-row"
          );

        const task =
          box.tasks.find(
            item =>
              item.id ===
              row.dataset.taskId
          );

        if (task) {
          task.text =
            event.target.textContent
              .trim();

          saveState();
        }
      }

    }
  );


  /* Space viewport */

  viewport.addEventListener(
    "scroll",
    () => {
      /*
        Scroll itself does not alter box
        coordinates. No full render here.
      */
    },
    {
      passive: true
    }
  );


  /* Escape */

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        !modalRoot.hidden
      ) {
        closeModal();
      }
    }
  );

}


/* =========================
   SPACE MENU
========================= */

function openSpaceMenu(space) {
  openModal({
    title: space.name,
    description: "Space options.",
    icon: "fa-layer-group",

    bodyHTML: `
      <div
        style="
          display:grid;
          gap:7px;
        "
      >

        <button
          class="btn"
          id="menuRename"
        >
          <i class="fa-solid fa-pen"></i>
          Rename Space
        </button>

        <button
          class="btn"
          id="menuDelete"
        >
          <i class="fa-solid fa-trash"></i>
          Delete Space
        </button>

      </div>
    `,

    buttons: [
      {
        label: "Close",
        action: closeModal
      }
    ]
  });

  $("#menuRename")
    .addEventListener(
      "click",
      () => renameSpace(space)
    );

  $("#menuDelete")
    .addEventListener(
      "click",
      () => deleteSpace(space)
    );
}


/* =========================
   RICH LINK MODAL
========================= */

function openRichLinkModal(boxEl) {
  const box =
    getBox(
      boxEl.dataset.boxId
    );

  if (!box) return;

  const editor =
    $(".rich-content", boxEl);

  openModal({
    title: "Insert Link",
    description: "Enter an HTTP or HTTPS URL.",
    icon: "fa-link",

    bodyHTML: `
      <div class="modal-field">

        <label class="modal-label">
          URL
        </label>

        <input
          class="modal-input"
          id="richLinkURL"
          placeholder="https://example.com"
          type="url"
        >

      </div>
    `,

    buttons: [
      {
        label: "Cancel",
        action: closeModal
      },

      {
        label: "Insert",
        className: "primary",

        action: modal => {
          const url =
            normalizeURL(
              $("#richLinkURL", modal)
                .value
            );

          if (!url) {
            showToast(
              "Enter a valid URL."
            );
            return;
          }

          editor.focus();

          document.execCommand(
            "createLink",
            false,
            url
          );

          box.content =
            normalizeHTML(
              editor.innerHTML
            );

          saveState();

          closeModal();
        }
      }
    ]
  });
}


/* =========================
   INIT
========================= */

function init() {
  loadState();

  applyTheme();

  renderTabs();
  renderActiveSpace();

  setupEvents();

  updateFullscreenButton();
}

init();
