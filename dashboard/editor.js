export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_GRID_ROW_PX = 48;
export const DASHBOARD_MIN_COLUMNS = 3;
export const DASHBOARD_MIN_HEIGHT_PX = 96;
export const DASHBOARD_DISPLAY_MODES = ["standard", "compact", "spacious"];

export function normalizeDashboardDisplayMode(value) {
  return DASHBOARD_DISPLAY_MODES.includes(value) ? value : "standard";
}

function dashboardFieldLabel(element, index) {
  const heading = element.querySelector?.("h2, h3, [aria-label]");
  const text = heading?.textContent?.trim() || heading?.getAttribute?.("aria-label")?.trim();
  return text || element.getAttribute?.("aria-label")?.trim() || `Field ${index + 1}`;
}

function dashboardFieldKey(element, index) {
  const label = dashboardFieldLabel(element, index)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${label || "field"}-${index + 1}`;
}

function sanitizeDuplicateContent(element) {
  element.querySelectorAll(".dashboard-widget-controls, .dashboard-widget-config, .dashboard-widget-character-badge")
    .forEach((node) => node.remove());
  element.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  element.querySelectorAll("[data-verification-test]").forEach((node) => {
    node.removeAttribute("data-verification-test");
    node.hidden = true;
  });
  element.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = true;
    if ("readOnly" in control) control.readOnly = true;
  });
}

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
    this.characterOptions = [];
    this.activeConfigId = null;
    this.duplicateSequence = 0;
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
      grid.append(widget);
      this.#registerWidget(id, widget, {
        label: widgetLabel(widget, index),
        duplicateOf: null,
      });
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

  setCharacterOptions(characters = []) {
    this.characterOptions = characters
      .filter((character) => character && character.id)
      .map((character) => ({
        id: String(character.id),
        name: String(character.name || character.id),
      }));
    for (const [id, record] of this.widgets) {
      if (
        record.characterId &&
        !this.characterOptions.some((character) => character.id === record.characterId)
      ) {
        record.characterId = "";
        delete record.element.dataset.widgetCharacter;
      }
      this.#renderCharacterBadge(id);
      this.#syncConfigurationPanel(id);
    }
    this.onChange();
  }

  widgetFields(id) {
    const record = this.widgets.get(id);
    if (!record) return [];
    return record.fields
      .filter((field) => !field.baselineHidden)
      .map((field) => ({
        key: field.key,
        label: field.label,
        hidden: record.hiddenFields.has(field.key),
      }));
  }

  widgetConfiguration(id) {
    const record = this.widgets.get(id);
    if (!record) return null;
    return {
      characterId: record.characterId,
      hiddenFields: [...record.hiddenFields],
      displayMode: record.displayMode,
      duplicateOf: record.duplicateOf,
    };
  }

  configureWidget(id, configuration = {}, { notify = true } = {}) {
    const record = this.widgets.get(id);
    if (!record) return false;

    if (configuration.characterId !== undefined) {
      const characterId = String(configuration.characterId || "");
      record.characterId = this.characterOptions.some((character) => character.id === characterId)
        ? characterId
        : "";
      if (record.characterId) record.element.dataset.widgetCharacter = record.characterId;
      else delete record.element.dataset.widgetCharacter;
    }

    if (configuration.displayMode !== undefined) {
      record.displayMode = normalizeDashboardDisplayMode(configuration.displayMode);
      record.element.dataset.widgetDisplay = record.displayMode;
    }

    if (configuration.hiddenFields !== undefined) {
      const allowed = new Set(
        record.fields.filter((field) => !field.baselineHidden).map((field) => field.key),
      );
      record.hiddenFields = new Set(
        [...configuration.hiddenFields].filter((key) => allowed.has(key)),
      );
    }

    for (const field of record.fields) {
      field.element.hidden = field.baselineHidden || record.hiddenFields.has(field.key);
    }
    this.#renderCharacterBadge(id);
    this.#syncConfigurationPanel(id);
    if (notify) this.onChange();
    return true;
  }

  duplicateWidget(id) {
    const source = this.widgets.get(id);
    if (!source || !this.grid) return null;

    const duplicate = source.element.cloneNode(true);
    sanitizeDuplicateContent(duplicate);
    [...duplicate.children].forEach((child, index) => {
      const sourceField = source.fields[index];
      if (sourceField) child.hidden = sourceField.baselineHidden;
    });
    const duplicateId = `${id}-copy-${++this.duplicateSequence}`;
    duplicate.dataset.dashboardWidget = duplicateId;
    duplicate.dataset.dashboardDuplicateOf = id;
    duplicate.dataset.widgetColumns = source.element.dataset.widgetColumns || String(DASHBOARD_GRID_COLUMNS);
    duplicate.style.setProperty(
      "--dashboard-widget-columns",
      duplicate.dataset.widgetColumns,
    );
    if (source.element.dataset.widgetHeight) {
      duplicate.dataset.widgetHeight = source.element.dataset.widgetHeight;
      duplicate.style.setProperty(
        "--dashboard-widget-height",
        `${source.element.dataset.widgetHeight}px`,
      );
    } else {
      delete duplicate.dataset.widgetHeight;
      duplicate.style.removeProperty("--dashboard-widget-height");
    }

    this.grid.insertBefore(duplicate, source.element.nextSibling);
    this.#registerWidget(duplicateId, duplicate, {
      label: `${source.label} copy`,
      duplicateOf: id,
    });
    this.configureWidget(duplicateId, {
      characterId: source.characterId,
      hiddenFields: [...source.hiddenFields],
      displayMode: source.displayMode,
    }, { notify: false });
    this.onChange();
    return duplicateId;
  }

  openConfiguration(id) {
    if (!this.enabled || !this.widgets.has(id)) return false;
    this.activeConfigId = id;
    for (const [widgetId, record] of this.widgets) {
      record.configPanel.hidden = widgetId !== id;
    }
    this.#syncConfigurationPanel(id);
    return true;
  }

  closeConfiguration() {
    this.activeConfigId = null;
    for (const record of this.widgets.values()) record.configPanel.hidden = true;
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
    this.closeConfiguration();
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
    const configurations = {};
    for (const [id, { element }] of this.widgets) {
      sizes[id] = {
        columns: Number(element.dataset.widgetColumns || DASHBOARD_GRID_COLUMNS),
        height: element.dataset.widgetHeight ? Number(element.dataset.widgetHeight) : null,
      };
      configurations[id] = this.widgetConfiguration(id);
    }
    return {
      enabled: this.enabled,
      order: this.widgetIds(),
      existingIds: [...this.widgets.keys()],
      removed: [...this.removed],
      sizes,
      configurations,
      characterOptions: this.characterOptions.map((character) => ({ ...character })),
      duplicateSequence: this.duplicateSequence,
    };
  }

  restore(snapshot) {
    if (!snapshot || !this.grid) return false;

    const existingIds = new Set(snapshot.existingIds ?? snapshot.order ?? []);
    for (const [id, record] of [...this.widgets]) {
      if (existingIds.has(id)) continue;
      record.element.remove();
      this.widgets.delete(id);
      this.removed.delete(id);
    }

    this.characterOptions = (snapshot.characterOptions ?? []).map((character) => ({ ...character }));
    this.duplicateSequence = Number(snapshot.duplicateSequence ?? this.duplicateSequence);
    for (const id of snapshot.order ?? []) {
      const widget = this.widgets.get(id)?.element;
      if (widget) this.grid.append(widget);
    }
    this.removed = new Set(snapshot.removed ?? []);
    for (const [id, record] of this.widgets) {
      const { element } = record;
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
      this.configureWidget(id, snapshot.configurations?.[id] ?? {
        characterId: "",
        hiddenFields: [],
        displayMode: "standard",
      }, { notify: false });
    }
    if (snapshot.enabled) this.enable();
    else this.disable();
    this.onChange();
    return true;
  }

  #registerWidget(id, widget, { label, duplicateOf }) {
    const fields = [...widget.children]
      .filter((child) =>
        !child.classList.contains("dashboard-widget-controls") &&
        !child.classList.contains("dashboard-widget-config") &&
        !child.classList.contains("dashboard-widget-character-badge")
      )
      .map((element, index) => ({
        element,
        key: dashboardFieldKey(element, index),
        label: dashboardFieldLabel(element, index),
        baselineHidden: Boolean(element.hidden),
      }));

    const badge = this.document.createElement("span");
    badge.className = "dashboard-widget-character-badge";
    badge.hidden = true;
    widget.append(badge);

    const configPanel = this.document.createElement("div");
    configPanel.className = "dashboard-widget-config";
    configPanel.hidden = true;
    widget.append(configPanel);

    this.widgets.set(id, {
      element: widget,
      label,
      duplicateOf,
      fields,
      characterId: "",
      hiddenFields: new Set(),
      displayMode: "standard",
      badge,
      configPanel,
    });
    widget.dataset.widgetDisplay = "standard";
    this.#installWidgetControls(id, widget);
    this.#installDragTarget(id, widget);
    this.#buildConfigurationPanel(id);
  }

  #renderCharacterBadge(id) {
    const record = this.widgets.get(id);
    if (!record) return;
    const character = this.characterOptions.find((item) => item.id === record.characterId);
    record.badge.hidden = !character;
    record.badge.textContent = character ? `Character: ${character.name}` : "";
  }

  #buildConfigurationPanel(id) {
    const record = this.widgets.get(id);
    if (!record) return;
    const panel = record.configPanel;
    panel.replaceChildren();

    const titleRow = this.document.createElement("div");
    titleRow.className = "dashboard-widget-config-heading";
    const title = this.document.createElement("strong");
    title.textContent = "Widget configuration";
    const close = this.document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => this.closeConfiguration());
    titleRow.append(title, close);
    panel.append(titleRow);

    const characterLabel = this.document.createElement("label");
    const characterText = this.document.createElement("span");
    characterText.className = "label";
    characterText.textContent = "Character";
    const characterSelect = this.document.createElement("select");
    characterSelect.dataset.widgetConfigCharacter = id;
    characterSelect.addEventListener("change", () => {
      this.configureWidget(id, { characterId: characterSelect.value });
    });
    characterLabel.append(characterText, characterSelect);
    panel.append(characterLabel);

    const displayLabel = this.document.createElement("label");
    const displayText = this.document.createElement("span");
    displayText.className = "label";
    displayText.textContent = "Display";
    const displaySelect = this.document.createElement("select");
    displaySelect.dataset.widgetConfigDisplay = id;
    for (const mode of DASHBOARD_DISPLAY_MODES) {
      const option = this.document.createElement("option");
      option.value = mode;
      option.textContent = mode[0].toUpperCase() + mode.slice(1);
      displaySelect.append(option);
    }
    displaySelect.addEventListener("change", () => {
      this.configureWidget(id, { displayMode: displaySelect.value });
    });
    displayLabel.append(displayText, displaySelect);
    panel.append(displayLabel);

    const fields = this.document.createElement("fieldset");
    fields.className = "dashboard-widget-field-options";
    const legend = this.document.createElement("legend");
    legend.textContent = "Visible fields";
    fields.append(legend);
    for (const field of record.fields.filter((item) => !item.baselineHidden)) {
      const label = this.document.createElement("label");
      const input = this.document.createElement("input");
      input.type = "checkbox";
      input.checked = !record.hiddenFields.has(field.key);
      input.dataset.widgetFieldKey = field.key;
      input.addEventListener("change", () => {
        const hiddenFields = new Set(record.hiddenFields);
        if (input.checked) hiddenFields.delete(field.key);
        else hiddenFields.add(field.key);
        this.configureWidget(id, { hiddenFields: [...hiddenFields] });
      });
      const text = this.document.createElement("span");
      text.textContent = field.label;
      label.append(input, text);
      fields.append(label);
    }
    panel.append(fields);

    const duplicate = this.document.createElement("button");
    duplicate.type = "button";
    duplicate.className = "dashboard-duplicate-widget";
    duplicate.textContent = "Duplicate widget";
    duplicate.addEventListener("click", () => {
      const duplicateId = this.duplicateWidget(id);
      if (duplicateId) this.openConfiguration(duplicateId);
    });
    panel.append(duplicate);

    this.#syncConfigurationPanel(id);
  }

  #syncConfigurationPanel(id) {
    const record = this.widgets.get(id);
    if (!record) return;
    const characterSelect = record.configPanel.querySelector("[data-widget-config-character]");
    if (characterSelect) {
      const current = record.characterId;
      characterSelect.replaceChildren();
      const automatic = this.document.createElement("option");
      automatic.value = "";
      automatic.textContent = "Default / current";
      characterSelect.append(automatic);
      for (const character of this.characterOptions) {
        const option = this.document.createElement("option");
        option.value = character.id;
        option.textContent = character.name;
        characterSelect.append(option);
      }
      characterSelect.value = this.characterOptions.some((character) => character.id === current)
        ? current
        : "";
    }
    const displaySelect = record.configPanel.querySelector("[data-widget-config-display]");
    if (displaySelect) displaySelect.value = record.displayMode;
    for (const input of record.configPanel.querySelectorAll("[data-widget-field-key]")) {
      input.checked = !record.hiddenFields.has(input.dataset.widgetFieldKey);
    }
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

    const configure = this.document.createElement("button");
    configure.type = "button";
    configure.className = "dashboard-configure-widget";
    configure.textContent = "Configure";
    configure.addEventListener("click", () => {
      if (this.enabled) this.openConfiguration(id);
    });

    const remove = this.document.createElement("button");
    remove.type = "button";
    remove.className = "dashboard-remove-widget";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      if (this.enabled) this.removeWidget(id);
    });

    controls.append(drag, resize, configure, remove);
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

export async function runDashboardWidgetConfigurationVerification(editor) {
  const snapshot = editor.snapshot();
  const candidateId = editor.widgetIds().find((id) =>
    id !== "current-verification-panel" && editor.widgetFields(id).length > 0
  );
  if (!candidateId) {
    throw new Error("Dashboard widget configuration verification requires one configurable widget.");
  }

  const steps = [];
  try {
    editor.enable();
    editor.setCharacterOptions([
      { id: "slice92-character-a", name: "Verification Character A" },
      { id: "slice92-character-b", name: "Verification Character B" },
    ]);

    editor.configureWidget(candidateId, { characterId: "slice92-character-b" });
    const characterConfiguration = editor.widgetConfiguration(candidateId);
    const candidate = editor.widgets.get(candidateId)?.element;
    steps.push({
      key: "character-selection",
      outcome:
        characterConfiguration?.characterId === "slice92-character-b" &&
        candidate?.dataset.widgetCharacter === "slice92-character-b"
          ? "passed"
          : "failed",
    });

    const fields = editor.widgetFields(candidateId);
    const hiddenField = fields[0];
    editor.configureWidget(candidateId, { hiddenFields: [hiddenField.key] });
    const hiddenState = editor.widgetFields(candidateId).find((field) => field.key === hiddenField.key);
    steps.push({
      key: "field-visibility",
      outcome: hiddenState?.hidden === true ? "passed" : "failed",
    });

    editor.configureWidget(candidateId, { displayMode: "compact" });
    steps.push({
      key: "display-options",
      outcome:
        editor.widgetConfiguration(candidateId)?.displayMode === "compact" &&
        candidate?.dataset.widgetDisplay === "compact"
          ? "passed"
          : "failed",
    });

    const duplicateId = editor.duplicateWidget(candidateId);
    const duplicate = duplicateId ? editor.widgets.get(duplicateId) : null;
    steps.push({
      key: "duplicate-widget",
      outcome:
        Boolean(duplicateId) &&
        duplicate?.duplicateOf === candidateId &&
        duplicate?.element.dataset.dashboardDuplicateOf === candidateId
          ? "passed"
          : "failed",
    });

    if (duplicateId) {
      editor.configureWidget(duplicateId, {
        characterId: "slice92-character-a",
        hiddenFields: [],
        displayMode: "spacious",
      });
    }
    steps.push({
      key: "independent-configuration",
      outcome:
        Boolean(duplicateId) &&
        editor.widgetConfiguration(candidateId)?.characterId === "slice92-character-b" &&
        editor.widgetConfiguration(duplicateId)?.characterId === "slice92-character-a" &&
        editor.widgetConfiguration(duplicateId)?.displayMode === "spacious"
          ? "passed"
          : "failed",
    });

    editor.disable();
    steps.push({
      key: "normal-mode",
      outcome: !editor.enabled && editor.document.body.dataset.dashboardEditMode === "false"
        ? "passed"
        : "failed",
    });

    return {
      outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
      steps,
      persistence: false,
      gameplayMutation: false,
      actionGatewayRequests: 0,
      rawSocketAccess: false,
      userScriptTouched: false,
    };
  } finally {
    editor.restore(snapshot);
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
