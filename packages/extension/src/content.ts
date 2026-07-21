/// <reference path="./types.d.ts" />
// Content script: element picker, resize handles + style panel, and inline
// text editing. Talks ONLY to the background worker (never to the
// companion directly - see background.ts).
(() => {
  const STYLE_ID = "froede-style";
  /**
   * How far the pointer must travel before a press counts as a drag. A plain
   * click carries a pixel or two of hand tremor, and writing that to disk
   * produced real diffs like `transform: translate(2px, 0px)` from a click
   * that never meant to move anything.
   */
  const DRAG_DEAD_ZONE = 5;
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
    (message: FroedeContentMessage, _sender, sendResponse) => {
      if (message.kind === "froede-toggle") {
        if (picking) {
          disable();
        } else {
          enable();
        }
        sendResponse({ enabled: picking });
      }
      if (message.kind === "froede-state") {
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
    removeHistoryBadge();
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
      .froede-guide-v { width: 1px; }
      .froede-guide-h { height: 1px; }
      .froede-badge {
        position: fixed; left: 16px; bottom: 16px; z-index: 2147483646;
        background: rgba(30,27,75,.9); color: #c7d2fe;
        font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
        padding: 6px 10px; border-radius: 999px;
        border: 1px solid rgba(129,140,248,.35);
        pointer-events: none;
      }

      .froede-confirm {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(15, 12, 41, .55);
        display: flex; align-items: center; justify-content: center;
      }
      .froede-confirm-box {
        max-width: 380px; background: #1e1b4b; color: #e0e7ff;
        font: 13px/1.5 -apple-system, system-ui, sans-serif; padding: 16px 18px;
        border-radius: 12px; border: 1px solid rgba(129,140,248,.4);
        box-shadow: 0 20px 50px rgba(0,0,0,.55);
      }
      .froede-confirm-box p { margin: 0 0 14px; }
      .froede-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
      .froede-confirm-actions button {
        padding: 6px 12px; border: 0; border-radius: 7px; cursor: pointer;
        font: inherit; background: rgba(255,255,255,.1); color: #e0e7ff;
      }
      .froede-confirm-actions .froede-confirm-ok { background: #4f46e5; }
      .froede-confirm-actions .froede-confirm-only { background: #b45309; }

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

  /**
   * Text blocks size themselves to their content. Pinning their height only
   * clips or stretches them, and it is never what "make this a bit wider"
   * meant, so froede leaves height alone for them.
   */
  function isTextBlock(el: HTMLElement): boolean {
    if (/^(P|H1|H2|H3|H4|H5|H6|SPAN|A|LI|BLOCKQUOTE|LABEL|FIGCAPTION|STRONG|EM)$/.test(el.tagName)) {
      return true;
    }
    return el.children.length === 0 && (el.textContent ?? "").trim() !== "";
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

  // ---- loop instances ------------------------------------------------------

  /**
   * How many live DOM nodes come from the same source location. The vite
   * plugin stamps the JSX TEMPLATE, so every element rendered by a `.map()`
   * shares one data-froede-loc: on screen they look independent, but in the
   * file they are a single line. Editing "one" of them rewrites that line and
   * changes all of them, which is never what the click meant.
   */
  function sharedNodeList(el: HTMLElement): NodeListOf<Element> | null {
    const loc = el.getAttribute("data-froede-loc");
    if (!loc) return null;
    const escaped = loc.replace(/["\\]/g, "\\$&");
    return document.querySelectorAll(`[data-froede-loc="${escaped}"]`);
  }

  function sharedInstances(el: HTMLElement): number {
    return sharedNodeList(el)?.length ?? 1;
  }

  /**
   * This occurrence's position among the shared-location nodes, in DOM order -
   * which matches the array's iteration order for a plain top-to-bottom
   * .map(), so it doubles as the loop index to isolate on the companion side.
   */
  function instanceIndex(el: HTMLElement): number {
    const list = sharedNodeList(el);
    return list ? Array.prototype.indexOf.call(list, el) : 0;
  }

  type SharedChoice = "all" | "only" | "cancel";

  function confirmSharedEdit(
    count: number,
    what: string,
    allowIsolate: boolean,
  ): Promise<SharedChoice> {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "froede-confirm";
      wrap.setAttribute("data-froede-ui", "");
      const box = document.createElement("div");
      box.className = "froede-confirm-box";
      const text = document.createElement("p");
      text.textContent = allowIsolate
        ? `This element is rendered ${count} times from the same line of source (a loop). Change just this one, or all ${count}?`
        : `This element is rendered ${count} times from the same line of source (a loop), so ${what} will affect all ${count}.`;
      const actions = document.createElement("div");
      actions.className = "froede-confirm-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.setAttribute("data-froede-ui", "");
      const all = document.createElement("button");
      all.type = "button";
      all.className = "froede-confirm-ok";
      all.textContent = `Change all ${count}`;
      all.setAttribute("data-froede-ui", "");
      actions.append(cancel);
      let only: HTMLButtonElement | null = null;
      if (allowIsolate) {
        only = document.createElement("button");
        only.type = "button";
        only.className = "froede-confirm-only";
        only.textContent = "Change only this one";
        only.setAttribute("data-froede-ui", "");
        actions.append(only);
      }
      actions.append(all);
      box.append(text, actions);
      wrap.appendChild(box);
      document.documentElement.appendChild(wrap);
      const done = (value: SharedChoice): void => {
        wrap.remove();
        resolve(value);
      };
      cancel.addEventListener("click", () => done("cancel"));
      only?.addEventListener("click", () => done("only"));
      all.addEventListener("click", () => done("all"));
      wrap.addEventListener("click", (e) => {
        if (e.target === wrap) done("cancel");
      });
      (only ?? all).focus();
    });
  }

  /**
   * Runs `proceed`, unless this element is one of N loop instances and the
   * user backs out - then `onCancel` undoes whatever was applied
   * optimistically. When the user picks "only this one", `proceed` receives
   * this occurrence's index so the companion can isolate the edit to it;
   * `allowIsolate=false` (used for delete) drops that third choice entirely,
   * since isolating a delete would mean hiding one iteration rather than
   * actually removing anything, a different and more confusing guarantee.
   */
  async function guardShared(
    el: HTMLElement,
    what: string,
    proceed: (onlyInstance?: number) => void,
    onCancel: () => void,
    allowIsolate = true,
  ): Promise<void> {
    const count = sharedInstances(el);
    if (count <= 1) {
      proceed(undefined);
      return;
    }
    const choice = await confirmSharedEdit(count, what, allowIsolate);
    if (choice === "cancel") {
      onCancel();
      return;
    }
    proceed(choice === "only" ? instanceIndex(el) : undefined);
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

  // ---- history (undo / redo) -----------------------------------------------

  let historyBadge: HTMLElement | null = null;

  /** Shows how many steps are available, so undo is not a leap of faith. */
  function updateHistoryBadge(undo?: number, redo?: number): void {
    if (undo === undefined && redo === undefined) return;
    if (!picking) return;
    if (!historyBadge) {
      historyBadge = document.createElement("div");
      historyBadge.className = "froede-badge";
      historyBadge.setAttribute("data-froede-ui", "");
      document.documentElement.appendChild(historyBadge);
    }
    historyBadge.textContent = `froede: ${undo ?? 0} undo / ${redo ?? 0} redo`;
  }

  function removeHistoryBadge(): void {
    historyBadge?.remove();
    historyBadge = null;
  }

  function sendHistory(kind: "froede-undo" | "froede-redo"): void {
    chrome.runtime.sendMessage(
      { kind } satisfies FroedeRuntimeMessage,
      (response: FroedeWriteResponse | undefined) => {
        if (response?.ok) {
          // The file just changed on disk and HMR will re-render, so any
          // selection we still hold may point at a node about to be replaced.
          deselect();
          clearHover();
          toast(
            `froede: ${kind === "froede-undo" ? "undid" : "redid"} an edit in ${response.file ?? "source"}`,
          );
        } else {
          toast(
            `froede: ${response?.error ?? "no response from the extension background"}`,
            4200,
          );
        }
        updateHistoryBadge(response?.undoDepth, response?.redoDepth);
      },
    );
  }

  // ---- keyboard ------------------------------------------------------------

  function onKeyDown(event: KeyboardEvent): void {
    if (paused) return; // text-edit / drag own their keys

    // Ctrl/Cmd+Z and Ctrl+Shift+Z / Ctrl+Y drive froede's own history. While
    // editing text in place `paused` is true, so the browser keeps its native
    // undo inside the field, which is exactly where the user expects it.
    if ((event.ctrlKey || event.metaKey) && !isTypingTarget(event.target)) {
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        event.stopPropagation();
        sendHistory(key === "y" || event.shiftKey ? "froede-redo" : "froede-undo");
        return;
      }
    }

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
    // Asked BEFORE anything is touched: deleting one of N loop instances
    // deletes the line that renders all of them.
    void guardShared(
      el,
      "deleting it",
      () => {
        // Optimistic: swap the element for a placeholder comment now, restore it
        // if the companion write fails. The comment holds the slot without
        // counting as an element child, so sibling domPaths stay valid.
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
      },
      () => {},
      // Isolating a delete would mean HIDING one iteration, not removing
      // anything - a different guarantee than the others, so not offered here.
      false,
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
    // Measured once: none of the candidates can move while we drag, so there
    // is no reason to re-measure the DOM on every frame.
    const snapTargets = collectSnapTargets(el);
    const SNAP = 7;
    let moved = false;
    paused = true;

    const onMove = (e: MouseEvent): void => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Straight-line distance, not |dx|+|dy|: the sum trips at 2px+2px of
      // diagonal tremor, which is still firmly "this was a click".
      if (!moved && Math.hypot(dx, dy) < DRAG_DEAD_ZONE) return;
      moved = true;
      // Shift locks to the axis being dragged further, like the resize handles.
      const lockY = e.shiftKey && Math.abs(dx) >= Math.abs(dy);
      const lockX = e.shiftKey && !lockY;
      let nx = Math.round(base.x + (lockX ? 0 : dx));
      let ny = Math.round(base.y + (lockY ? 0 : dy));
      el.style.setProperty("transform", `translate(${nx}px, ${ny}px)`);

      // Align against the OTHER elements on screen (their edges and centres),
      // like Figma, plus the parent's inner box. The guide is drawn spanning
      // both, so it is obvious WHO it is lining up with. Alt = no snapping.
      let guideX: SnapHit | null = null;
      let guideY: SnapHit | null = null;
      if (!e.altKey) {
        const er = el.getBoundingClientRect();
        if (!lockX) {
          guideX = bestSnap(
            {
              start: er.left,
              end: er.right,
              centre: er.left + er.width / 2,
              crossStart: er.top,
              crossEnd: er.bottom,
            },
            snapTargets,
            "x",
            SNAP,
          );
          if (guideX) nx = Math.round(nx + guideX.delta);
        }
        if (!lockY) {
          guideY = bestSnap(
            {
              start: er.top,
              end: er.bottom,
              centre: er.top + er.height / 2,
              crossStart: er.left,
              crossEnd: er.right,
            },
            snapTargets,
            "y",
            SNAP,
          );
          if (guideY) ny = Math.round(ny + guideY.delta);
        }
        if (guideX || guideY) {
          el.style.setProperty("transform", `translate(${nx}px, ${ny}px)`);
        }
      }
      showGuides(guideX, guideY);
      currentReposition?.();
    };

    const onUp = (e: MouseEvent): void => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      hideGuides();
      paused = false;
      if (!moved) return; // it was a click, not a drag - leave selection alone
      suppressClick = true;
      // Crossing the dead zone and drifting back is still a click. The entry
      // check alone left `moved` latched on, so a tremor wrote its residue.
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_DEAD_ZONE) {
        if (previousTransform) el.style.setProperty("transform", previousTransform);
        else el.style.removeProperty("transform");
        currentReposition?.();
        return;
      }
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

  // ---- smart alignment ------------------------------------------------------

  interface SnapBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
    cx: number;
    cy: number;
  }

  /**
   * Boxes worth aligning to, measured ONCE when a drag begins. Measuring in
   * every mousemove would force a full layout per frame; nothing here moves
   * while dragging anyway. Only what is on screen counts, which is also the
   * only thing the user can see themselves lining up with.
   */
  function collectSnapTargets(moving: HTMLElement): SnapBox[] {
    const boxes: SnapBox[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const push = (left: number, top: number, width: number, height: number): void => {
      boxes.push({
        left,
        top,
        right: left + width,
        bottom: top + height,
        cx: left + width / 2,
        cy: top + height / 2,
      });
    };

    // The parent's INNER box (padding excluded) is what people align to most
    // of the time, so it goes in first.
    const parent = moving.parentElement;
    if (parent) {
      const pr = parent.getBoundingClientRect();
      const cs = getComputedStyle(parent);
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pt = parseFloat(cs.paddingTop) || 0;
      const pr2 = parseFloat(cs.paddingRight) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      push(pr.left + pl, pr.top + pt, pr.width - pl - pr2, pr.height - pt - pb);
    }

    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      if (boxes.length > 400) break; // hard cap; this runs per drag, not per frame
      if (el === moving || el.contains(moving) || moving.contains(el)) continue;
      if (isUiEl(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) continue;
      push(r.left, r.top, r.width, r.height);
    }
    return boxes;
  }

  interface SnapHit {
    /** How far to shift the element so it lands on the guide. */
    delta: number;
    /** Where the guide line sits, in viewport coordinates. */
    at: number;
    /** Span of the line, so it visibly connects BOTH elements. */
    from: number;
    to: number;
  }

  interface MovingEdges {
    start: number;
    end: number;
    centre: number;
    crossStart: number;
    crossEnd: number;
  }

  /** Best alignment on one axis: our edges/centre against every candidate. */
  function bestSnap(
    moving: MovingEdges,
    targets: SnapBox[],
    axis: "x" | "y",
    tolerance: number,
  ): SnapHit | null {
    let best: SnapHit | null = null;
    for (const box of targets) {
      const tStart = axis === "x" ? box.left : box.top;
      const tEnd = axis === "x" ? box.right : box.bottom;
      const tCentre = axis === "x" ? box.cx : box.cy;
      const crossStart = axis === "x" ? box.top : box.left;
      const crossEnd = axis === "x" ? box.bottom : box.right;
      // Edge-to-edge both ways, plus centre-to-centre: the same pairs Figma
      // offers, which is what makes the snapping feel predictable.
      const pairs: Array<[number, number]> = [
        [moving.start, tStart],
        [moving.start, tEnd],
        [moving.end, tEnd],
        [moving.end, tStart],
        [moving.centre, tCentre],
      ];
      for (const [mine, theirs] of pairs) {
        const delta = theirs - mine;
        if (Math.abs(delta) > tolerance) continue;
        if (best && Math.abs(delta) >= Math.abs(best.delta)) continue;
        best = {
          delta,
          at: theirs,
          from: Math.min(crossStart, moving.crossStart),
          to: Math.max(crossEnd, moving.crossEnd),
        };
      }
    }
    return best;
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

  function showGuides(x: SnapHit | null, y: SnapHit | null): void {
    ensureGuides();
    if (x) {
      guideV!.style.left = `${x.at}px`;
      guideV!.style.top = `${x.from}px`;
      guideV!.style.height = `${Math.max(1, x.to - x.from)}px`;
      guideV!.style.display = "block";
    } else {
      guideV!.style.display = "none";
    }
    if (y) {
      guideH!.style.top = `${y.at}px`;
      guideH!.style.left = `${y.from}px`;
      guideH!.style.width = `${Math.max(1, y.to - y.from)}px`;
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
    const revert = (): void => {
      if (previousValue) el.setAttribute(name, previousValue);
      else el.removeAttribute(name);
      input.value = previousValue;
    };
    void guardShared(
      el,
      `this ${name} change`,
      (onlyInstance) => {
        chrome.runtime.sendMessage(
          {
            kind: "froede-write-attr",
            target,
            name,
            previousValue,
            newValue,
            onlyInstance,
          } satisfies FroedeRuntimeMessage,
          (response: FroedeWriteResponse | undefined) => {
            if (response?.ok) {
              el.classList.add("froede-ok");
              setTimeout(() => el.classList.remove("froede-ok"), 900);
              toast(`froede: saved to ${response.file ?? "source"}`);
            } else {
              revert();
              el.classList.add("froede-err");
              setTimeout(() => el.classList.remove("froede-err"), 1200);
              toast(
                `froede: ${response?.error ?? "no response from the extension background"}`,
                4200,
              );
            }
          },
        );
      },
      revert,
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
    let resized = false;
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
      // Same dead zone as drag-to-move. Without it, a click that merely
      // grazes a handle serialized the element's MEASURED box as a fixed
      // width/height in px, freezing a fluid (grid/Tailwind) block.
      if (!resized && Math.hypot(dx, dy) < DRAG_DEAD_ZONE) return;
      resized = true;
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
      // Never write a size the user did not actually drag. The panel's W/H
      // are MEASURED values, so writing them back on a stray click is what
      // pinned fluid elements to px in the first place.
      if (!resized) return;

      // A hard px width is precisely what breaks a fluid layout on a phone,
      // so express the result against the parent whenever there is one.
      const parentWidth = el.parentElement?.getBoundingClientRect().width ?? 0;
      const widthPx = parseFloat(el.style.getPropertyValue("width")) || 0;
      const width =
        parentWidth > 0 && widthPx > 0
          ? `${Math.round((widthPx / parentWidth) * 1000) / 10}%`
          : el.style.getPropertyValue("width");
      el.style.setProperty("width", width);

      const style: Record<string, string> = { width };
      const previousStyle: Record<string, string> = { width: previousWidth };
      if (isTextBlock(el)) {
        // Let it keep growing with its content instead of freezing it.
        el.style.removeProperty("height");
      } else {
        style.height = el.style.getPropertyValue("height");
        previousStyle.height = previousHeight;
      }
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
    void guardShared(
      el,
      "this style change",
      (onlyInstance) => sendStyleWriteNow(el, target, style, previousStyle, onFail, onlyInstance),
      onFail,
    );
  }

  function sendStyleWriteNow(
    el: HTMLElement,
    target: FroedeEditTarget,
    style: Record<string, string>,
    previousStyle: Record<string, string>,
    onFail: () => void,
    onlyInstance?: number,
  ): void {
    chrome.runtime.sendMessage(
      {
        kind: "froede-write-style",
        target,
        previousStyle,
        style,
        onlyInstance,
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
        updateHistoryBadge(response?.undoDepth, response?.redoDepth);
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
      void guardShared(
        el,
        "this text change",
        (onlyInstance) => {
          chrome.runtime.sendMessage(
            {
              kind: "froede-write",
              target,
              previousText: originalText,
              newText,
              onlyInstance,
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
              updateHistoryBadge(response?.undoDepth, response?.redoDepth);
              paused = false;
            },
          );
        },
        () => {
          el.textContent = originalText;
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
