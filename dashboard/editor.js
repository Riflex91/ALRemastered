export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_GRID_ROW_PX = 48;
export const DASHBOARD_MIN_COLUMNS = 3;
export const DASHBOARD_MIN_HEIGHT_PX = 96;

export function snapToGrid(value, step) {
  const numeric = Number(value);
  const grid = Number(step);
  if (!Number.isFinite(numeric) || !Number.isFinite(grid) || grid <= 0) return 0;
  return Math.max(0, Math.round(numeric / grid) * grid);
}

export function clampWidgetColumns(value) {
  const numeric = Number.isFinite(Number(value)) ? Math.round(Number(value)) : DASHBOARD_GRID_COLUMNS;
  return Math.min(DASHBOARD_GRID_COLUMNS, Math.max(DASHBOARD_MIN_COLUMNS, numeric));
}

export function moveWidgetOrder(order, sourceId, targetId) {
  const next = [...order];
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return next;
  next.splice(sourceIndex, 1);
  const nextTargetIndex = next.indexOf(targetId);
  next.splice(nextTargetIndex, 0, sourceId);
  return next;
}

function widgetLabel(element, index) {
  const heading = element.querySelector("h2, h3, [aria-label]");
  const text = heading?.textContent?.trim() || heading?.getAttribute?.("aria-label")?.trim();
  return text || element.id || `Dashboard widget ${index + 1}`;
}

function safeWidgetId(element, index) {
  if (element.dataset.dashboardWidget) return element.dataset.dashboardWidget;
  if (element.id) return element.id;
  const base = widgetLabel(element, index)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base ? `widget-${base}` : `dashboard-widget-${index + 1}`;
}

export class DashboardEditor {
  constructor({ document, root, onChange } = {}) {
    this.document = document ?? globalThis.document;
    this.root = root ?? this.document?.querySelector?.("main.shell");
    this.onChange = typeof onChange === "function" ? onChange : () => {};
    this.grid = null;
    this.widgets = new Map();
    this.removed = new Set();
    this.enabled = false;
    this.draggedId = null;
    this.resizeSession = null;
  }

  init() {
    if (this.grid || !this.document || !this.root) return this;
    const candidates = [...this.root.children].filter((element) =>
      element.tagName === "SECTION" &&
      !element.hidden &&
      !element.classList.contains("update-banner") &&
      !element.classList.contains("dashboard-editor-exempt")
    );

    const grid = this.document.createElement("div");
    grid.id = "dashboard-widget-grid";
    grid.className = "dashboard-widget-grid";
    const first = candidates[0] ?? null;
    this.root.insertBefore(grid, first);

    candidates.forEach((widget, index) => {
      const id = safeWidgetId(widget, index);
      widget.dataset.dashboardWidget = id;
      widget.dataset.widgetColumns = String(DASHBOARD_GRID_COLUMNS);
      widget.style.setProperty("--dashboard-widget-columns", String(DASHBOARD_GRID_COLUMNS));
      this.widgets.set(id, {
        element: widget,
        label: widgetLabel(widget, index),
      });
      grid.append(widget);
      this.#installWidgetControls(id, widget);
      this.#installDragTarget(id, widget);
    });

    this.grid = grid;
    this.document.body.dataset.dashboardEditMode = "false";
    return this;
  }

  widgetIds() {
    if (!this.grid) return [];
    return [...this.grid.querySelectorAll("[data-dashboard-widget]")]
      .map((element) => element.dataset.dashboardWidget)
      .filter(Boolean);
  }

  removedWidgets() {
    return [...this.removed]
      .map((id) => ({ id, label: this.widgets.get(id)?.label ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  enable() {
    this.init();
    this.enabled = true;
    this.root?.classList.add("dashboard-editing");
    if (this.document?.body) this.document.body.dataset.dashboardEditMode = "true";
    this.onChange();
  }

  disable() {
    this.enabled = false;
    this.draggedId = null;
    this.#finishResize();
    this.root?.classList.remove("dashboard-editing");
    if (this.document?.body) this.document.body.dataset.dashboardEditMode = "false";
    this.onChange();
  }

  toggle() {
    if (this.enabled) this.disable();
    else this.enable();
    return this.enabled;
  }

  moveWidget(sourceId, targetId) {
    if (!this.grid || sourceId === targetId) return false;
    const order = moveWidgetOrder(this.widgetIds(), sourceId, targetId);
    if (order.length === 0) return false;
    for (const id of order) {
      const widget = this.widgets.get(id)?.element;
      if (widget) this.grid.append(widget);
    }
    this.onChange();
    return true;
  }

  resizeWidget(id, columns, heightPx) {
    const widget = this.widgets.get(id)?.element;
    if (!widget) return false;
    const snappedColumns = clampWidgetColumns(columns);
    const snappedHeight = Math.max(
      DASHBOARD_MIN_HEIGHT_PX,
      snapToGrid(heightPx, DASHBOARD_GRID_ROW_PX),
    );
    widget.dataset.widgetColumns = String(snappedColumns);
    widget.dataset.widgetHeight = String(snappedHeight);
    widget.style.setProperty("--dashboard-widget-columns", String(snappedColumns));
    widget.style.setProperty("--dashboard-widget-height", `${snappedHeight}px`);
    this.onChange();
    return true;
  }

  removeWidget(id) {
    const widget = this.widgets.get(id)?.element;
    if (!widget || this.removed.has(id)) return false;
    this.removed.add(id);
    widget.dataset.editorRemoved = "true";
    widget.hidden = true;
    this.onChange();
    return true;
  }

  addWidget(id) {
    const widget = this.widgets.get(id)?.element;
    if (!widget || !this.removed.has(id)) return false;
    this.removed.delete(id);
    delete widget.dataset.editorRemoved;
    widget.hidden = false;
    this.onChange();
    return true;
  }

  snapshot() {
    const sizes = {};
    for (const [id, { element }] of this.widgets) {
      sizes[id] = {
        columns: Number(element.dataset.widgetColumns || DASHBOARD_GRID_COLUMNS),
        height: element.dataset.widgetHeight ? Number(element.dataset.widgetHeight) : null,
      };
    }
    return {
      enabled: this.enabled,
      order: this.widgetIds(),
      removed: [...this.removed],
      sizes,
    };
  }

  restore(snapshot) {
    if (!snapshot || !this.grid) return false;
    for (const id of snapshot.order ?? []) {
      const widget = this.widgets.get(id)?.element;
      if (widget) this.grid.append(widget);
    }
    this.removed = new Set(snapshot.removed ?? []);
    for (const [id, { element }] of this.widgets) {
      const removed = this.removed.has(id);
      if (removed) {
        element.dataset.editorRemoved = "true";
        element.hidden = true;
      } else {
        delete element.dataset.editorRemoved;
        element.hidden = false;
      }
      const size = snapshot.sizes?.[id];
      const columns = clampWidgetColumns(size?.columns ?? DASHBOARD_GRID_COLUMNS);
      element.dataset.widgetColumns = String(columns);
      element.style.setProperty("--dashboard-widget-columns", String(columns));
      if (size?.height) {
        const height = Math.max(DASHBOARD_MIN_HEIGHT_PX, snapToGrid(size.height, DASHBOARD_GRID_ROW_PX));
        element.dataset.widgetHeight = String(height);
        element.style.setProperty("--dashboard-widget-height", `${height}px`);
      } else {
        delete element.dataset.widgetHeight;
        element.style.removeProperty("--dashboard-widget-height");
      }
    }
    if (snapshot.enabled) this.enable();
    else this.disable();
    this.onChange();
    return true;
  }

  #installWidgetControls(id, widget) {
    const controls = this.document.createElement("div");
    controls.className = "dashboard-widget-controls";
    controls.setAttribute("aria-label", "Dashboard widget edit controls");

    const drag = this.document.createElement("button");
    drag.type = "button";
    drag.className = "dashboard-drag-handle";
    drag.textContent = "Drag";
    drag.draggable = true;
    drag.addEventListener("dragstart", (event) => {
      if (!this.enabled) {
        event.preventDefault();
        return;
      }
      this.draggedId = id;
      event.dataTransfer?.setData("text/plain", id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      widget.dataset.dragging = "true";
    });
    drag.addEventListener("dragend", () => {
      this.draggedId = null;
      delete widget.dataset.dragging;
    });

    const resize = this.document.createElement("button");
    resize.type = "button";
    resize.className = "dashboard-resize-handle";
    resize.textContent = "Resize";
    resize.addEventListener("pointerdown", (event) => this.#beginResize(event, id));

    const remove = this.document.createElement("button");
    remove.type = "button";
    remove.className = "dashboard-remove-widget";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      if (this.enabled) this.removeWidget(id);
    });

    controls.append(drag, resize, remove);
    widget.append(controls);
  }

  #installDragTarget(id, widget) {
    widget.addEventListener("dragover", (event) => {
      if (!this.enabled || !this.draggedId || this.draggedId === id) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    widget.addEventListener("drop", (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      const sourceId = this.draggedId || event.dataTransfer?.getData("text/plain");
      if (sourceId) this.moveWidget(sourceId, id);
      this.draggedId = null;
    });
  }

  #beginResize(event, id) {
    if (!this.enabled || !this.grid) return;
    event.preventDefault();
    const widget = this.widgets.get(id)?.element;
    if (!widget) return;
    const bounds = widget.getBoundingClientRect();
    this.resizeSession = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startColumns: Number(widget.dataset.widgetColumns || DASHBOARD_GRID_COLUMNS),
      startHeight: bounds.height,
    };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    this.document.addEventListener("pointermove", this.#handleResizeMove);
    this.document.addEventListener("pointerup", this.#handleResizeEnd, { once: true });
    this.document.addEventListener("pointercancel", this.#handleResizeEnd, { once: true });
  }

  #handleResizeMove = (event) => {
    const session = this.resizeSession;
    if (!session || !this.grid) return;
    const gridWidth = Math.max(1, this.grid.getBoundingClientRect().width);
    const columnWidth = gridWidth / DASHBOARD_GRID_COLUMNS;
    const columns = session.startColumns + Math.round((event.clientX - session.startX) / columnWidth);
    const height = session.startHeight + (event.clientY - session.startY);
    this.resizeWidget(session.id, columns, height);
  };

  #handleResizeEnd = () => {
    this.#finishResize();
  };

  #finishResize() {
    if (!this.document) return;
    this.document.removeEventListener("pointermove", this.#handleResizeMove);
    this.document.removeEventListener("pointerup", this.#handleResizeEnd);
    this.document.removeEventListener("pointercancel", this.#handleResizeEnd);
    this.resizeSession = null;
  }
}

export async function runDashboardEditorVerification(editor) {
  const snapshot = editor.snapshot();
  const candidateIds = editor.widgetIds().filter((id) => id !== "current-verification-panel");
  if (candidateIds.length < 2) {
    throw new Error("Dashboard edit verification requires at least two dashboard widgets.");
  }

  const sourceId = candidateIds[1];
  const targetId = candidateIds[0];
  const steps = [];
  try {
    editor.enable();
    steps.push({
      key: "edit-mode-toggle",
      outcome: editor.enabled && editor.document.body.dataset.dashboardEditMode === "true" ? "passed" : "failed",
    });

    const beforeMove = editor.widgetIds();
    editor.moveWidget(sourceId, targetId);
    const afterMove = editor.widgetIds();
    steps.push({
      key: "drag-and-drop",
      outcome: beforeMove.join("|") !== afterMove.join("|") && afterMove.indexOf(sourceId) < afterMove.indexOf(targetId)
        ? "passed"
        : "failed",
    });

    editor.resizeWidget(targetId, 7, 173);
    const target = editor.widgets.get(targetId)?.element;
    const snappedHeight = Number(target?.dataset.widgetHeight);
    steps.push({
      key: "resize",
      outcome: target?.dataset.widgetColumns === "7" && snappedHeight === 192 ? "passed" : "failed",
    });
    steps.push({
      key: "grid-snapping",
      outcome: snapToGrid(173, DASHBOARD_GRID_ROW_PX) === 192 ? "passed" : "failed",
    });

    const removed = editor.removeWidget(sourceId);
    const hiddenAfterRemove = editor.widgets.get(sourceId)?.element.hidden === true;
    const added = editor.addWidget(sourceId);
    const visibleAfterAdd = editor.widgets.get(sourceId)?.element.hidden === false;
    steps.push({
      key: "add-remove-widgets",
      outcome: removed && hiddenAfterRemove && added && visibleAfterAdd ? "passed" : "failed",
    });

    editor.disable();
    steps.push({
      key: "normal-mode",
      outcome: !editor.enabled && editor.document.body.dataset.dashboardEditMode === "false" ? "passed" : "failed",
    });

    return {
      outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
      steps,
      grid: {
        columns: DASHBOARD_GRID_COLUMNS,
        rowPx: DASHBOARD_GRID_ROW_PX,
      },
      persistence: false,
      gameplayMutation: false,
      rawSocketAccess: false,
      userScriptTouched: false,
    };
  } finally {
    editor.restore(snapshot);
  }
}
