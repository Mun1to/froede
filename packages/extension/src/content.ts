/// <reference path="./types.d.ts" />
// Content script: element picker, resize handles + style panel, and inline
// text editing. Talks ONLY to the background worker (never to the
// companion directly - see background.ts).
(() => {
  const STYLE_ID = "froede-style";
  let picking = false;
  // true while text-editing or mid-drag: suppresses hover/select/Escape so
  // those flows own the mouse/keyboard until they finish.
  let paused = false;
  let hoverEl: Element | null = null;
  let selectedEl: HTMLElement | null = null;
  let overlayRoot: HTMLElement | null = null;
  let currentReposition: (() => void) | null = null;
  // Set right after a drag so the click that follows the mouseup doesn't
  // re-select or deselect the element we just moved.
  let suppressClick = false;
  let guideV: HTMLElement | null = null;
  let guideH: HTMLElement | null = null;

  chrome.runtime.onMessage.addListener(
    (message: FroedeToggleMessage, _sender, sendResponse) => {
      if (message.kind === "froede-toggle") {
        if (picking) {
          disable();
        } else {
          enable();
        }
        sendResponse({ enabled: picking });
      }
    },
  );

  function enable(): void {
    picking = true;
    paused = false;
    injectStyle();
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    toast(
      "froede: edit mode ON - click to select, drag to move, double-click text to edit, drag a corner to resize, Backspace to delete (Esc to exit)",
      4600,
    );
  }

  function disable(): void {
    picking = false;
    clearHover();
    deselect();
    hideGuides();
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("dblclick", onDblClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onReposition, true);
    window.removeEventListener("resize", onReposition);
    toast("froede: edit mode off");
  }

  function injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .froede-hover { outline: 2px solid #6366f1 !important; outline-offset: 1px; cursor: pointer; }
      .froede-selected { outline: 2px solid #f59e0b !important; outline-offset: 1px; }
      .froede-editing { outline: 2px solid #f59e0b !important; outline-offset: 1px; }
      .froede-ok { outline: 2px solid #22c55e !important; outline-offset: 1px; transition: outline-color .6s; }
      .froede-err { outline: 2px solid #ef4444 !important; outline-offset: 1px; }
      .froede-toast {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        background: #1e1b4b; color: #e0e7ff; font: 13px/1.4 system-ui, sans-serif;
        padding: 10px 14px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.35);
        max-width: 360px; pointer-events: none;
      }
      .froede-handle {
        position: fixed; width: 10px; height: 10px; z-index: 2147483647;
        background: #f59e0b; border: 2px solid #1e1b4b; border-radius: 3px;
        box-shadow: 0 1px 4px rgba(0,0,0,.5);
        cursor: nwse-resize;
      }
      .froede-handle-ne, .froede-handle-sw { cursor: nesw-resize; }
      .froede-guide {
        position: fixed; z-index: 2147483646; background: #e5006e;
        pointer-events: none; display: none;
      }
      .froede-guide-v { width: 1px; top: 0; bottom: 0; }
      .froede-guide-h { height: 1px; left: 0; right: 0; }

      .froede-panel, .froede-panel * { box-sizing: border-box; }
      .froede-panel {
        position: fixed; z-index: 2147483647; width: 236px;
        background: rgba(30, 27, 75, 0.88);
        backdrop-filter: blur(14px) saturate(160%);
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        color: #e0e7ff; font: 12px/1.4 -apple-system, system-ui, sans-serif;
        border-radius: 14px; padding: 12px;
        border: 1px solid rgba(129, 140, 248, 0.35);
        box-shadow: 0 16px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.2);
      }
      .froede-panel-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 10px; padding-bottom: 8px;
        border-bottom: 1px solid rgba(129, 140, 248, 0.2);
      }
      .froede-panel-tag {
        font-weight: 700; font-size: 11px; letter-spacing: .06em;
        text-transform: uppercase; color: #a5b4fc;
      }
      .froede-panel-close {
        width: 20px; height: 20px; border-radius: 50%; border: none;
        background: rgba(255,255,255,.08); color: #9ca3af; cursor: pointer;
        font: 13px/1 system-ui, sans-serif;
        display: flex; align-items: center; justify-content: center; padding: 0;
      }
      .froede-panel-close:hover { background: rgba(255,255,255,.18); color: #f1f5f9; }

      .froede-section + .froede-section { margin-top: 10px; }
      .froede-section-label {
        font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
        color: #7c83a6; margin-bottom: 6px;
      }
      .froede-row { display: flex; align-items: center; gap: 8px; }
      .froede-row + .froede-row { margin-top: 6px; }
      .froede-field { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
      .froede-field label { color: #9ca3af; flex-shrink: 0; width: 32px; }

      .froede-row input[type="number"], .froede-row input[type="text"] {
        width: 100%; min-width: 0;
        background: rgba(255,255,255,.05); border: 1px solid rgba(129,140,248,.3);
        color: #e0e7ff; border-radius: 7px; padding: 5px 7px; font: inherit;
      }
      .froede-row input[type="number"]:focus, .froede-row input[type="text"]:focus {
        outline: none; border-color: #818cf8; background: rgba(255,255,255,.09);
      }
      .froede-row input[type="color"] {
        -webkit-appearance: none; appearance: none;
        width: 26px; height: 26px; padding: 0; flex-shrink: 0;
        border-radius: 50%; border: 2px solid rgba(255,255,255,.25);
        cursor: pointer; background: none;
      }
      .froede-row input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; border-radius: 50%; }
      .froede-row input[type="color"]::-webkit-color-swatch { border: none; border-radius: 50%; }
      .froede-row input[type="checkbox"] {
        width: 17px; height: 17px; flex-shrink: 0; accent-color: #6366f1; cursor: pointer;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function toast(text: string, ms = 2600): void {
    const el = document.createElement("div");
    el.className = "froede-toast";
    el.setAttribute("data-froede-ui", "");
    el.textContent = text;
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function isUiEl(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest("[data-froede-ui]") !== null;
  }

  /** Anything selectable for style edits - broader than what's text-editable. */
  function selectableEl(raw: EventTarget | null): HTMLElement | null {
    if (!(raw instanceof HTMLElement)) return null;
    if (isUiEl(raw)) return null;
    if (/^(HTML|BODY|HEAD|SCRIPT|STYLE|IFRAME)$/.test(raw.tagName)) return null;
    return raw;
  }

  /** A leaf whose only meaningful content is one text node - text-editable. */
  function textEditableEl(el: HTMLElement): boolean {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
    if (el.children.length > 0) return false;
    return (el.textContent ?? "").trim() !== "";
  }

  function resolveTarget(el: HTMLElement): FroedeEditTarget | null {
    const loc = el.getAttribute("data-froede-loc");
    if (loc) {
      // "src/App.tsx:12:4" - path is forward-slash relative, so the last
      // two colon-separated fields are always line and column.
      const parts = loc.split(":");
      if (parts.length < 3) return null;
      const column = Number(parts.pop());
      const line = Number(parts.pop());
      const file = parts.join(":");
      if (!file || !Number.isInteger(line) || !Number.isInteger(column)) return null;
      return { kind: "react", file, line, column };
    }
    // A page annotated by the vite plugin is a React page; an element there
    // without the attribute is not mapped to source (component internals,
    // portals, etc.) and cannot be edited safely.
    if (document.querySelector("[data-froede-loc]")) return null;

    const domPath: number[] = [];
    let node: Element = el;
    while (node !== document.documentElement) {
      const parent = node.parentElement;
      if (!parent) return null;
      domPath.unshift(Array.prototype.indexOf.call(parent.children, node));
      node = parent;
    }
    return { kind: "static-html", urlPath: location.pathname, domPath };
  }

  // ---- hover -------------------------------------------------------------

  function onMouseOver(event: Event): void {
    if (paused) return;
    const el = selectableEl(event.target);
    if (el === selectedEl) {
      clearHover();
      return;
    }
    clearHover();
    if (el) {
      hoverEl = el;
      el.classList.add("froede-hover");
    }
  }

  function onMouseOut(): void {
    if (paused) return;
    clearHover();
  }

  function clearHover(): void {
    hoverEl?.classList.remove("froede-hover");
    hoverEl = null;
  }

  // ---- keyboard ------------------------------------------------------------

  function onKeyDown(event: KeyboardEvent): void {
    if (paused) return; // text-edit / drag own their keys

    if (event.key === "Backspace" || event.key === "Delete") {
      // Only when an element is selected, and never while typing in a field
      // (panel inputs, a contenteditable) so Backspace still edits text there.
      if (!selectedEl || isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      deleteSelected(selectedEl);
      return;
    }

    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (selectedEl) {
      deselect();
      return;
    }
    disable();
  }

  function isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return true;
    return t.isContentEditable;
  }

  function deleteSelected(el: HTMLElement): void {
    const target = resolveTarget(el);
    if (!target) {
      toast(
        "froede: this element is not mapped to source (no data-froede-loc - is vite-plugin-froede installed?)",
      );
      return;
    }
    const previousTag = el.tagName.toLowerCase();
    // Optimistic: swap the element for a placeholder comment now, restore it if
    // the companion write fails. The comment holds the slot without counting as
    // an element child, so sibling domPaths stay valid until it's confirmed.
    const placeholder = document.createComment("froede-deleted");
    deselect();
    clearHover();
    el.replaceWith(placeholder);
    chrome.runtime.sendMessage(
      {
        kind: "froede-delete",
        target,
        previousTag,
      } satisfies FroedeRuntimeMessage,
      (response: FroedeWriteResponse | undefined) => {
        if (response?.ok) {
          placeholder.remove();
          toast(`froede: deleted <${previousTag}> from ${response.file ?? "source"}`);
        } else {
          placeholder.replaceWith(el);
          toast(
            `froede: ${response?.error ?? "no response from the extension background"}`,
            4200,
          );
        }
      },
    );
  }

  // ---- select / click ------------------------------------------------------

  function onClick(event: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (paused) return;
    if (isUiEl(event.target)) return;
    const el = selectableEl(event.target);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    select(el);
  }

  // ---- drag to move ---------------------------------------------------------

  function onMouseDown(event: MouseEvent): void {
    if (paused || event.button !== 0) return;
    if (isUiEl(event.target)) return; // handles and panel own their mousedown
    if (!selectedEl) return;
    const t = event.target;
    if (!(t instanceof Node) || !selectedEl.contains(t)) return;
    startMove(event, selectedEl);
  }

  function parseTranslate(transform: string): { x: number; y: number } {
    const m = transform.match(
      /translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/,
    );
    return m ? { x: parseFloat(m[1]!), y: parseFloat(m[2]!) } : { x: 0, y: 0 };
  }

  function startMove(event: MouseEvent, el: HTMLElement): void {
    const target = resolveTarget(el);
    if (!target) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const previousTransform = el.style.getPropertyValue("transform");
    const base = parseTranslate(previousTransform);
    const container = el.parentElement ?? document.body;
    const SNAP = 6;
    let moved = false;
    paused = true;

    const onMove = (e: MouseEvent): void => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // A few pixels of slop before it counts as a drag, so a plain click to
      // select doesn't nudge the element.
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      // Shift locks to the axis being dragged further, like the resize handles.
      const lockY = e.shiftKey && Math.abs(dx) >= Math.abs(dy);
      const lockX = e.shiftKey && !lockY;
      let nx = Math.round(base.x + (lockX ? 0 : dx));
      let ny = Math.round(base.y + (lockY ? 0 : dy));
      el.style.setProperty("transform", `translate(${nx}px, ${ny}px)`);

      // Snap the element's center to its container's center and show a guide,
      // like Canva/Figma. Hold Alt to move freely with no snapping.
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (!e.altKey) {
        const pr = container.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        const cxDiff = pr.left + pr.width / 2 - (er.left + er.width / 2);
        const cyDiff = pr.top + pr.height / 2 - (er.top + er.height / 2);
        if (!lockX && Math.abs(cxDiff) <= SNAP) {
          nx = Math.round(nx + cxDiff);
          guideX = pr.left + pr.width / 2;
        }
        if (!lockY && Math.abs(cyDiff) <= SNAP) {
          ny = Math.round(ny + cyDiff);
          guideY = pr.top + pr.height / 2;
        }
        if (guideX !== null || guideY !== null) {
          el.style.setProperty("transform", `translate(${nx}px, ${ny}px)`);
        }
      }
      showGuides(guideX, guideY);
      currentReposition?.();
    };

    const onUp = (): void => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      hideGuides();
      paused = false;
      if (!moved) return; // it was a click, not a drag - leave selection alone
      suppressClick = true;
      const value = el.style.getPropertyValue("transform");
      sendStyleWrite(
        el,
        target,
        { transform: value },
        { transform: previousTransform },
        () => {
          if (previousTransform) el.style.setProperty("transform", previousTransform);
          else el.style.removeProperty("transform");
          currentReposition?.();
        },
      );
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  }

  function ensureGuides(): void {
    if (!guideV) {
      guideV = document.createElement("div");
      guideV.className = "froede-guide froede-guide-v";
      guideV.setAttribute("data-froede-ui", "");
      document.documentElement.appendChild(guideV);
    }
    if (!guideH) {
      guideH = document.createElement("div");
      guideH.className = "froede-guide froede-guide-h";
      guideH.setAttribute("data-froede-ui", "");
      document.documentElement.appendChild(guideH);
    }
  }

  function showGuides(x: number | null, y: number | null): void {
    ensureGuides();
    if (x !== null) {
      guideV!.style.left = `${x}px`;
      guideV!.style.display = "block";
    } else {
      guideV!.style.display = "none";
    }
    if (y !== null) {
      guideH!.style.top = `${y}px`;
      guideH!.style.display = "block";
    } else {
      guideH!.style.display = "none";
    }
  }

  function hideGuides(): void {
    if (guideV) guideV.style.display = "none";
    if (guideH) guideH.style.display = "none";
  }

  function onDblClick(event: MouseEvent): void {
    if (paused) return;
    if (isUiEl(event.target)) return;
    const el = selectableEl(event.target);
    if (!el || !textEditableEl(el)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = resolveTarget(el);
    if (!target) {
      toast(
        "froede: this element is not mapped to source (no data-froede-loc - is vite-plugin-froede installed?)",
      );
      return;
    }
    deselect();
    startEdit(el, target);
  }

  function select(el: HTMLElement): void {
    if (selectedEl === el) return;
    const target = resolveTarget(el);
    if (!target) {
      toast(
        "froede: this element is not mapped to source (no data-froede-loc - is vite-plugin-froede installed?)",
      );
      return;
    }
    deselect();
    clearHover();
    selectedEl = el;
    el.classList.add("froede-selected");
    buildOverlay(el, target);
  }

  function deselect(): void {
    if (!selectedEl) return;
    selectedEl.classList.remove("froede-selected");
    selectedEl = null;
    currentReposition = null;
    overlayRoot?.remove();
    overlayRoot = null;
  }

  function onReposition(): void {
    currentReposition?.();
  }

  // ---- resize handles + property panel --------------------------------------

  function buildOverlay(el: HTMLElement, target: FroedeEditTarget): void {
    const root = document.createElement("div");
    root.setAttribute("data-froede-ui", "");
    document.documentElement.appendChild(root);
    overlayRoot = root;

    const corners = ["nw", "ne", "sw", "se"] as const;
    const handles: Record<(typeof corners)[number], HTMLElement> = {} as never;
    for (const corner of corners) {
      const handle = document.createElement("div");
      handle.className = `froede-handle froede-handle-${corner}`;
      handle.setAttribute("data-froede-ui", "");
      handle.addEventListener("mousedown", (e) => startResize(e, el, target, corner));
      root.appendChild(handle);
      handles[corner] = handle;
    }

    const panel = buildPanel(el, target);
    root.appendChild(panel);

    const reposition = (): void => positionOverlay(el, handles, panel);
    currentReposition = reposition;
    reposition();
  }

  function positionOverlay(
    el: HTMLElement,
    handles: Record<"nw" | "ne" | "sw" | "se", HTMLElement>,
    panel: HTMLElement,
  ): void {
    const r = el.getBoundingClientRect();
    const place = (h: HTMLElement, x: number, y: number): void => {
      h.style.left = `${x - 5}px`;
      h.style.top = `${y - 5}px`;
    };
    place(handles.nw, r.left, r.top);
    place(handles.ne, r.right, r.top);
    place(handles.sw, r.left, r.bottom);
    place(handles.se, r.right, r.bottom);

    const panelWidth = 236;
    // Real height when rendered (the Attributes section varies per element).
    const panelHeight = panel.offsetHeight || 300;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelWidth - 16));
    const belowFits = r.bottom + panelHeight + 16 < window.innerHeight;
    panel.style.left = `${left}px`;
    panel.style.top = belowFits ? `${r.bottom + 8}px` : `${Math.max(8, r.top - panelHeight - 6)}px`;
  }

  function toHex(rgbOrHex: string): string {
    if (rgbOrHex.startsWith("#")) return rgbOrHex;
    const nums = rgbOrHex.match(/\d+(\.\d+)?/g);
    if (!nums || nums.length < 3) return "#000000";
    const [r, g, b] = nums.map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))));
    return (
      "#" +
      [r, g, b]
        .map((n) => (n ?? 0).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function cssPropFor(key: string): string {
    return key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  }

  function buildPanel(el: HTMLElement, target: FroedeEditTarget): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "froede-panel";
    panel.setAttribute("data-froede-ui", "");
    panel.addEventListener("mousedown", (e) => e.stopPropagation());
    panel.addEventListener("click", (e) => e.stopPropagation());
    panel.addEventListener("dblclick", (e) => e.stopPropagation());

    const rect = el.getBoundingClientRect();
    const computed = getComputedStyle(el);
    const isBold = parseInt(computed.fontWeight, 10) >= 700;

    const field = (labelText: string, inner: string): string =>
      `<div class="froede-field"><label>${labelText}</label>${inner}</div>`;
    const numberInput = (key: string, value: number, min: number): string =>
      `<input data-k="${key}" type="number" min="${min}" value="${value}">`;

    panel.innerHTML = `
      <div class="froede-panel-header">
        <span class="froede-panel-tag">&lt;${el.tagName.toLowerCase()}&gt;</span>
        <button type="button" class="froede-panel-close" data-froede-ui aria-label="Deselect">&times;</button>
      </div>
      <div class="froede-section">
        <div class="froede-section-label">Size</div>
        <div class="froede-row">
          ${field("W", numberInput("width", Math.round(rect.width), 1))}
          ${field("H", numberInput("height", Math.round(rect.height), 1))}
        </div>
      </div>
      <div class="froede-section">
        <div class="froede-section-label">Color</div>
        <div class="froede-row">
          ${field("Text", `<input data-k="color" type="color" value="${toHex(computed.color)}">`)}
          ${field("Fill", `<input data-k="backgroundColor" type="color" value="${toHex(computed.backgroundColor)}">`)}
        </div>
      </div>
      <div class="froede-section">
        <div class="froede-section-label">Type</div>
        <div class="froede-row">
          ${field("Size", numberInput("fontSize", Math.round(parseFloat(computed.fontSize) || 16), 1))}
          ${field("Bold", `<input data-k="fontWeight" type="checkbox" ${isBold ? "checked" : ""}>`)}
        </div>
      </div>
      <div class="froede-section">
        <div class="froede-section-label">Spacing</div>
        <div class="froede-row">
          ${field("Pad", numberInput("padding", Math.round(parseFloat(computed.paddingTop) || 0), 0))}
          ${field("Gap", numberInput("margin", Math.round(parseFloat(computed.marginTop) || 0), 0))}
        </div>
      </div>
      ${attrSection(el)}
    `;

    panel.querySelector(".froede-panel-close")?.addEventListener("click", () => deselect());

    panel.querySelectorAll<HTMLInputElement>("input[data-k]").forEach((input) => {
      const key = input.dataset.k;
      if (!key) return;
      input.addEventListener("change", () => commitStyleField(el, target, key, input));
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") input.blur();
      });
    });

    panel.querySelectorAll<HTMLInputElement>("input[data-attr]").forEach((input) => {
      const name = input.dataset.attr as FroedeAttrName | undefined;
      if (!name) return;
      input.addEventListener("change", () => commitAttrField(el, target, name, input));
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") input.blur();
      });
    });

    return panel;
  }

  /** Which allowlisted attributes make sense to offer for this element. */
  function relevantAttrs(el: HTMLElement): FroedeAttrName[] {
    const attrs: FroedeAttrName[] = [];
    const tag = el.tagName;
    if (tag === "A") attrs.push("href");
    if (tag === "IMG") attrs.push("src", "alt");
    if (tag === "INPUT" || tag === "TEXTAREA") attrs.push("placeholder");
    for (const extra of ["title", "alt", "href", "placeholder", "src"] as const) {
      if (!attrs.includes(extra) && el.hasAttribute(extra)) attrs.push(extra);
    }
    return attrs;
  }

  function escapeAttrForHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function attrSection(el: HTMLElement): string {
    const attrs = relevantAttrs(el);
    if (attrs.length === 0) return "";
    const rows = attrs
      .map(
        (name) => `
        <div class="froede-row">
          <div class="froede-field">
            <label>${name}</label>
            <input data-attr="${name}" type="text" value="${escapeAttrForHtml(el.getAttribute(name) ?? "")}">
          </div>
        </div>`,
      )
      .join("");
    return `
      <div class="froede-section">
        <div class="froede-section-label">Attributes</div>
        ${rows}
      </div>
    `;
  }

  function commitAttrField(
    el: HTMLElement,
    target: FroedeEditTarget,
    name: FroedeAttrName,
    input: HTMLInputElement,
  ): void {
    const previousValue = el.getAttribute(name) ?? "";
    const newValue = input.value;
    if (newValue === previousValue) return;
    el.setAttribute(name, newValue);
    chrome.runtime.sendMessage(
      {
        kind: "froede-write-attr",
        target,
        name,
        previousValue,
        newValue,
      } satisfies FroedeRuntimeMessage,
      (response: FroedeWriteResponse | undefined) => {
        if (response?.ok) {
          el.classList.add("froede-ok");
          setTimeout(() => el.classList.remove("froede-ok"), 900);
          toast(`froede: saved to ${response.file ?? "source"}`);
        } else {
          if (previousValue) el.setAttribute(name, previousValue);
          else el.removeAttribute(name);
          input.value = previousValue;
          el.classList.add("froede-err");
          setTimeout(() => el.classList.remove("froede-err"), 1200);
          toast(
            `froede: ${response?.error ?? "no response from the extension background"}`,
            4200,
          );
        }
      },
    );
  }

  function commitStyleField(
    el: HTMLElement,
    target: FroedeEditTarget,
    key: string,
    input: HTMLInputElement,
  ): void {
    let value: string;
    if (input.type === "checkbox") {
      value = input.checked ? "bold" : "normal";
    } else if (input.type === "color") {
      value = input.value;
    } else {
      const n = Number(input.value);
      if (!Number.isFinite(n) || n < 0) {
        toast("froede: invalid value");
        return;
      }
      value = `${Math.round(n)}px`;
    }
    const cssProp = cssPropFor(key);
    const previous = el.style.getPropertyValue(cssProp);
    el.style.setProperty(cssProp, value);
    currentReposition?.();
    sendStyleWrite(el, target, { [key]: value }, { [key]: previous }, () => {
      if (previous) el.style.setProperty(cssProp, previous);
      else el.style.removeProperty(cssProp);
      currentReposition?.();
    });
  }

  const MAX_MIN_PROPS = ["maxWidth", "maxHeight", "minWidth", "minHeight"] as const;

  function startResize(
    event: MouseEvent,
    el: HTMLElement,
    target: FroedeEditTarget,
    corner: "nw" | "ne" | "sw" | "se",
  ): void {
    event.preventDefault();
    event.stopPropagation();
    paused = true;
    const startRect = el.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const previousWidth = el.style.getPropertyValue("width");
    const previousHeight = el.style.getPropertyValue("height");
    const growX = corner === "ne" || corner === "se" ? 1 : -1;
    const growY = corner === "sw" || corner === "se" ? 1 : -1;

    // If a CSS class already caps this element (e.g. `.lead { max-width }`),
    // an inline width/height alone gets silently overridden by the cascade -
    // dragging looks like it "only works in one direction". Neutralize any
    // constraint that isn't already permissive, alongside the resize.
    const computed = getComputedStyle(el);
    const freeValue: Record<(typeof MAX_MIN_PROPS)[number], string> = {
      maxWidth: "none",
      maxHeight: "none",
      minWidth: "0px",
      minHeight: "0px",
    };
    const constraints = MAX_MIN_PROPS.filter((prop) => {
      const current = computed[prop];
      return prop.startsWith("max") ? current !== "none" : parseFloat(current) > 0;
    });
    const previousConstraint: Partial<Record<(typeof MAX_MIN_PROPS)[number], string>> = {};
    for (const prop of constraints) previousConstraint[prop] = el.style.getPropertyValue(cssPropFor(prop));

    function onMove(e: MouseEvent): void {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Shift locks to whichever axis is dragging further, like Figma.
      const lockY = e.shiftKey && Math.abs(dx) >= Math.abs(dy);
      const lockX = e.shiftKey && !lockY;
      const w = lockX ? startRect.width : Math.max(1, Math.round(startRect.width + dx * growX));
      const h = lockY ? startRect.height : Math.max(1, Math.round(startRect.height + dy * growY));
      el.style.setProperty("width", `${Math.round(w)}px`);
      el.style.setProperty("height", `${Math.round(h)}px`);
      for (const prop of constraints) el.style.setProperty(cssPropFor(prop), freeValue[prop]);
      currentReposition?.();
    }

    function onUp(): void {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      paused = false;
      const style: Record<string, string> = {
        width: el.style.getPropertyValue("width"),
        height: el.style.getPropertyValue("height"),
      };
      const previousStyle: Record<string, string> = {
        width: previousWidth,
        height: previousHeight,
      };
      for (const prop of constraints) {
        style[prop] = freeValue[prop];
        previousStyle[prop] = previousConstraint[prop] ?? "";
      }
      sendStyleWrite(el, target, style, previousStyle, () => {
        if (previousWidth) el.style.setProperty("width", previousWidth);
        else el.style.removeProperty("width");
        if (previousHeight) el.style.setProperty("height", previousHeight);
        else el.style.removeProperty("height");
        for (const prop of constraints) {
          const prev = previousConstraint[prop];
          if (prev) el.style.setProperty(cssPropFor(prop), prev);
          else el.style.removeProperty(cssPropFor(prop));
        }
        currentReposition?.();
      });
      if (selectedEl === el) select(el); // refresh the panel's W/H fields
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  }

  function sendStyleWrite(
    el: HTMLElement,
    target: FroedeEditTarget,
    style: Record<string, string>,
    previousStyle: Record<string, string>,
    onFail: () => void,
  ): void {
    chrome.runtime.sendMessage(
      {
        kind: "froede-write-style",
        target,
        previousStyle,
        style,
      } satisfies FroedeRuntimeMessage,
      (response: FroedeWriteResponse | undefined) => {
        if (response?.ok) {
          el.classList.add("froede-ok");
          setTimeout(() => el.classList.remove("froede-ok"), 900);
          toast(`froede: saved to ${response.file ?? "source"}`);
        } else {
          onFail();
          el.classList.add("froede-err");
          setTimeout(() => el.classList.remove("froede-err"), 1200);
          toast(
            `froede: ${response?.error ?? "no response from the extension background"}`,
            4200,
          );
        }
      },
    );
  }

  // ---- text editing (double-click) ------------------------------------------

  function startEdit(el: HTMLElement, target: FroedeEditTarget): void {
    paused = true;
    clearHover();
    const originalText = el.textContent ?? "";
    el.classList.add("froede-editing");
    try {
      (el as HTMLElement & { contentEditable: string }).contentEditable =
        "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const finish = (): void => {
      el.removeEventListener("keydown", onEditKey, true);
      el.removeEventListener("blur", onBlur, true);
      el.contentEditable = "false";
      el.removeAttribute("contenteditable");
      el.classList.remove("froede-editing");
      window.getSelection()?.removeAllRanges();
    };

    const cancel = (): void => {
      finish();
      el.textContent = originalText;
      paused = false;
    };

    const commit = (): void => {
      finish();
      const newText = el.textContent ?? "";
      const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();
      if (normalize(newText) === normalize(originalText)) {
        paused = false;
        return;
      }
      chrome.runtime.sendMessage(
        {
          kind: "froede-write",
          target,
          previousText: originalText,
          newText,
        } satisfies FroedeRuntimeMessage,
        (response: FroedeWriteResponse | undefined) => {
          if (response?.ok) {
            el.classList.add("froede-ok");
            setTimeout(() => el.classList.remove("froede-ok"), 900);
            toast(`froede: saved to ${response.file ?? "source"}`);
          } else {
            el.textContent = originalText;
            el.classList.add("froede-err");
            setTimeout(() => el.classList.remove("froede-err"), 1200);
            toast(
              `froede: ${response?.error ?? "no response from the extension background"}`,
              4200,
            );
          }
          paused = false;
        },
      );
    };

    const onEditKey = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };
    const onBlur = (): void => commit();

    el.addEventListener("keydown", onEditKey, true);
    el.addEventListener("blur", onBlur, true);
  }
})();
