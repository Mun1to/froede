/// <reference path="./types.d.ts" />
// Service worker: the ONLY piece that talks to the companion. Content
// scripts run in the page's context and would leak the page's Origin, so
// they must never open the WebSocket themselves; they message this worker
// via chrome.runtime instead (invisible to the page).
(() => {
  const DEFAULT_PORT = 4519;
  const PROTOCOL_VERSION = 1;
  const REQUEST_TIMEOUT_MS = 8000;

  let ws: WebSocket | null = null;
  let connecting: Promise<WebSocket> | null = null;
  const pending = new Map<string, (msg: Record<string, unknown>) => void>();

  async function getSettings(): Promise<{ port: number; token: string }> {
    const stored = await chrome.storage.local.get({
      port: DEFAULT_PORT,
      token: "",
    });
    return { port: Number(stored.port) || DEFAULT_PORT, token: String(stored.token) };
  }

  // Lazy connect: MV3 may unload this worker at any time, so the socket is
  // (re)opened on demand right before a message needs to go out.
  function connect(): Promise<WebSocket> {
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
    if (connecting) return connecting;
    connecting = (async () => {
      const { port, token } = await getSettings();
      if (!token) {
        throw new Error(
          "no token set - open the froede popup and paste the companion token",
        );
      }
      const sock = new WebSocket(
        `ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`,
      );
      await new Promise<void>((resolve, reject) => {
        sock.onopen = () => resolve();
        sock.onerror = () =>
          reject(
            new Error(
              `cannot reach the companion on 127.0.0.1:${port} - is it running? (token/port in the popup)`,
            ),
          );
      });
      sock.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          const id = String(msg.requestId ?? "");
          const resolver = pending.get(id);
          if (resolver) {
            pending.delete(id);
            resolver(msg);
          }
        } catch {
          // ignore malformed frames
        }
      };
      sock.onclose = () => {
        if (ws === sock) ws = null;
      };
      ws = sock;
      return sock;
    })();
    const attempt = connecting;
    const clear = (): void => {
      if (connecting === attempt) connecting = null;
    };
    attempt.then(clear, clear);
    return attempt;
  }

  async function request(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sock = await connect();
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve({ ok: false, error: "companion did not respond in time" });
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      sock.send(JSON.stringify({ ...payload, requestId }));
    });
  }

  chrome.runtime.onMessage.addListener(
    (message: FroedeRuntimeMessage, sender, sendResponse) => {
      if (message.kind === "froede-write") {
        (async () => {
          try {
            const result = await request({
              type: "write-text",
              target: message.target,
              previousText: message.previousText,
              newText: message.newText,
            });
            const ok = result.ok === true;
            // Static pages have no HMR pipeline; reload the tab to reflect
            // the saved file. React/Vite refreshes itself via HMR.
            if (ok && message.target.kind === "static-html" && sender.tab?.id != null) {
              chrome.tabs.reload(sender.tab.id);
            }
            sendResponse({
              ok,
              file: typeof result.file === "string" ? result.file : undefined,
              error: typeof result.error === "string" ? result.error : undefined,
            } satisfies FroedeWriteResponse);
          } catch (err) {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            } satisfies FroedeWriteResponse);
          }
        })();
        return true;
      }

      if (message.kind === "froede-write-style") {
        (async () => {
          try {
            const result = await request({
              type: "write-style",
              target: message.target,
              previousStyle: message.previousStyle,
              style: message.style,
            });
            const ok = result.ok === true;
            if (ok && message.target.kind === "static-html" && sender.tab?.id != null) {
              chrome.tabs.reload(sender.tab.id);
            }
            sendResponse({
              ok,
              file: typeof result.file === "string" ? result.file : undefined,
              error: typeof result.error === "string" ? result.error : undefined,
            } satisfies FroedeWriteResponse);
          } catch (err) {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            } satisfies FroedeWriteResponse);
          }
        })();
        return true;
      }

      if (message.kind === "froede-test") {
        (async () => {
          try {
            const result = await request({
              type: "ping",
              protocolVersion: PROTOCOL_VERSION,
            });
            if (result.type !== "pong") {
              sendResponse({
                ok: false,
                error: String(result.error ?? "unexpected companion response"),
              } satisfies FroedeTestResponse);
              return;
            }
            if (result.protocolVersion !== PROTOCOL_VERSION) {
              sendResponse({
                ok: false,
                error: `protocol mismatch (extension v${PROTOCOL_VERSION}, companion v${String(result.protocolVersion)}) - update both sides`,
              } satisfies FroedeTestResponse);
              return;
            }
            sendResponse({
              ok: true,
              root: String(result.root ?? ""),
              companionVersion: String(result.companionVersion ?? ""),
            } satisfies FroedeTestResponse);
          } catch (err) {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            } satisfies FroedeTestResponse);
          }
        })();
        return true;
      }

      if (message.kind === "froede-toggle-tab") {
        (async () => {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tab?.id == null) {
            sendResponse({ ok: false, error: "no active tab" });
            return;
          }
          try {
            const result = await chrome.tabs.sendMessage(tab.id, {
              kind: "froede-toggle",
            } satisfies FroedeToggleMessage);
            sendResponse({ ok: true, enabled: result?.enabled === true });
          } catch {
            sendResponse({
              ok: false,
              error:
                "froede only runs on localhost pages (open your dev server and try again)",
            });
          }
        })();
        return true;
      }

      return false;
    },
  );
})();
