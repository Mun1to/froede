/// <reference path="./types.d.ts" />
// Service worker: the ONLY piece that talks to the companion. Content
// scripts run in the page's context and would leak the page's Origin, so
// they must never open the WebSocket themselves; they message this worker
// via chrome.runtime instead (invisible to the page).
(() => {
  const DEFAULT_PORT = 4519;
  const PROTOCOL_VERSION = 1;
  const REQUEST_TIMEOUT_MS = 8000;
  // Mirrors the companion's close codes (packages/companion/src/server.ts).
  const CLOSE_EXTENSION_NOT_ALLOWED = 4403;
  const CLOSE_BAD_TOKEN = 4401;

  let ws: WebSocket | null = null;
  let connecting: Promise<WebSocket> | null = null;
  const pending = new Map<string, (msg: Record<string, unknown>) => void>();
  /**
   * Why the companion last closed on us. These three failure modes used to
   * collapse into one message that blamed the token and the process - the two
   * things that are usually fine - so each one now gets its own answer.
   */
  let lastRejection: { error: string; fix?: string } | null = null;

  function rejectionFor(
    code: number,
    reason: string,
    port: number,
  ): { error: string; fix?: string } | null {
    if (code === CLOSE_EXTENSION_NOT_ALLOWED) {
      const id = reason.split(":")[1] || chrome.runtime.id;
      // Must carry the port this extension is actually configured for: a
      // command that silently reverts to the default port either reconnects
      // to the WRONG companion (if one happens to be there) or fails with
      // EADDRINUSE (if the default port is already taken, e.g. by another
      // companion instance) - either way it sends the user in a circle.
      const portFlag = port !== DEFAULT_PORT ? ` --port ${port}` : "";
      const fix = `FROEDE_EXTENSION_ID=${id} npx froede${portFlag}`;
      return {
        error: `this extension (${id}) is not authorised by the companion - it was loaded unpacked, so Chrome gave it its own id. Restart the companion as: ${fix} - or answer "s" to the question it just printed in its own terminal.`,
        fix,
      };
    }
    if (code === CLOSE_BAD_TOKEN) {
      return {
        error: `the companion IS running on 127.0.0.1:${port} and this extension is authorised, but the token does not match the one it printed - copy the token again from its terminal.`,
      };
    }
    return null;
  }

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
          // The handshake never completed, so there is no close code to read.
          // Authorisation and token failures no longer land here (the
          // companion accepts the upgrade and closes with a code), which
          // leaves exactly one cause: nothing is listening on that port.
          reject(
            new Error(
              `nothing is listening on 127.0.0.1:${port} - start the companion with "npx froede" inside your project folder, and check the port here matches the one it printed`,
            ),
          );
      });
      sock.onmessage = (event) => {
        lastRejection = null; // a real answer means the pairing is fine
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
      sock.onclose = (event) => {
        if (ws === sock) ws = null;
        const rejection = rejectionFor(event.code, event.reason, port);
        if (!rejection) return;
        // The companion told us exactly why. Fail everything in flight with
        // that reason instead of letting it time out into something generic.
        lastRejection = rejection;
        for (const [id, resolve] of [...pending]) {
          pending.delete(id);
          resolve({ ok: false, error: rejection.error, fix: rejection.fix });
        }
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
        resolve({
          ok: false,
          error: lastRejection?.error ?? "companion did not respond in time",
          fix: lastRejection?.fix,
        });
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      try {
        sock.send(JSON.stringify({ ...payload, requestId }));
      } catch {
        // Already closing: either a rejection we are about to be told about,
        // or a companion that just stopped.
        clearTimeout(timer);
        pending.delete(requestId);
        resolve({
          ok: false,
          error: lastRejection?.error ?? "the connection to the companion dropped",
          fix: lastRejection?.fix,
        });
      }
    });
  }

  chrome.runtime.onMessage.addListener(
    (message: FroedeRuntimeMessage, _sender, sendResponse) => {
      if (message.kind === "froede-write") {
        (async () => {
          try {
            const result = await request({
              type: "write-text",
              target: message.target,
              previousText: message.previousText,
              newText: message.newText,
              onlyInstance: message.onlyInstance,
            });
            // froede already applied the change to the DOM optimistically
            // (and reverts on failure), so there's no reload here: reloading a
            // static page would restart the content script and drop edit mode.
            const ok = result.ok === true;
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

      if (message.kind === "froede-write-attr") {
        (async () => {
          try {
            const result = await request({
              type: "write-attr",
              target: message.target,
              name: message.name,
              previousValue: message.previousValue,
              newValue: message.newValue,
              onlyInstance: message.onlyInstance,
            });
            const ok = result.ok === true;
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
              onlyInstance: message.onlyInstance,
            });
            const ok = result.ok === true;
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

      if (message.kind === "froede-delete") {
        (async () => {
          try {
            const result = await request({
              type: "delete-element",
              target: message.target,
              previousTag: message.previousTag,
            });
            sendResponse({
              ok: result.ok === true,
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

      if (message.kind === "froede-undo" || message.kind === "froede-redo") {
        (async () => {
          try {
            const result = await request({
              type: message.kind === "froede-undo" ? "undo" : "redo",
            });
            sendResponse({
              ok: result.ok === true,
              file: typeof result.file === "string" ? result.file : undefined,
              error: typeof result.error === "string" ? result.error : undefined,
              undoDepth:
                typeof result.undoDepth === "number" ? result.undoDepth : undefined,
              redoDepth:
                typeof result.redoDepth === "number" ? result.redoDepth : undefined,
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
                fix: typeof result.fix === "string" ? result.fix : undefined,
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
