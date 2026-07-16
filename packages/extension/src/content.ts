/// <reference path="./types.d.ts" />
// Content script: element picker + inline text editing. Talks ONLY to the
// background worker (never to the companion directly - see background.ts).
(() => {
  const STYLE_ID = "froede-style";
  let picking = false;
  let paused = false;
  let hoverEl: Element | null = null;

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
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    toast("froede: edit mode ON - click a text element (Esc to exit)");
  }

  function disable(): void {
    picking = false;
    clearHover();
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    toast("froede: edit mode off");
  }

  function injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .froede-hover { outline: 2px solid #6366f1 !important; outline-offset: 1px; cursor: pointer; }
      .froede-editing { outline: 2px solid #f59e0b !important; outline-offset: 1px; }
      .froede-ok { outline: 2px solid #22c55e !important; outline-offset: 1px; transition: outline-color .6s; }
      .froede-err { outline: 2px solid #ef4444 !important; outline-offset: 1px; }
      .froede-toast {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        background: #1e1b4b; color: #e0e7ff; font: 13px/1.4 system-ui, sans-serif;
        padding: 10px 14px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.35);
        max-width: 360px; pointer-events: none;
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

  /** An element qualifies when its only meaningful content is one text node. */
  function editableTextEl(raw: EventTarget | null): HTMLElement | null {
    if (!(raw instanceof HTMLElement)) return null;
    if (raw.closest("[data-froede-ui]")) return null;
    const tag = raw.tagName;
    if (/^(HTML|BODY|HEAD|SCRIPT|STYLE|IFRAME|INPUT|TEXTAREA|SELECT)$/.test(tag)) {
      return null;
    }
    if (raw.children.length > 0) return null;
    if (!(raw.textContent ?? "").trim()) return null;
    return raw;
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

  function onMouseOver(event: Event): void {
    if (paused) return;
    const el = editableTextEl(event.target);
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

  function onKeyDown(event: KeyboardEvent): void {
    if (paused) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      disable();
    }
  }

  function onClick(event: MouseEvent): void {
    if (paused) return;
    event.preventDefault();
    event.stopPropagation();
    const el = editableTextEl(event.target);
    if (!el) {
      toast("froede: not an editable text element (v0.1 edits plain text only)");
      return;
    }
    const target = resolveTarget(el);
    if (!target) {
      toast(
        "froede: this element is not mapped to source (no data-froede-loc - is @froede/vite-plugin installed?)",
      );
      return;
    }
    startEdit(el, target);
  }

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
