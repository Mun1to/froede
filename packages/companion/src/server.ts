import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ClientMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "froede-protocol";
import { publicErrorMessage } from "./errors.js";
import {
  createPairingPrompt,
  extensionIdFromOrigin,
  loadApprovedExtensions,
} from "./extensions.js";
import { history } from "./history.js";
import {
  applyReactAttrEdit,
  applyReactDelete,
  applyReactStyleEdit,
  applyReactTextEdit,
} from "./targets/reactSource.js";
import {
  applyStaticAttrEdit,
  applyStaticDelete,
  applyStaticStyleEdit,
  applyStaticTextEdit,
} from "./targets/staticHtml.js";
import { tokensMatch } from "./token.js";

export const COMPANION_VERSION = "0.4.0";

/**
 * Close codes in the private 4000-4999 range. A rejection before the upgrade
 * is invisible to the browser (the WebSocket API hides the HTTP status by
 * spec), so the extension could only ever say "something failed" and would
 * guess the reason wrong. Closing *after* the upgrade carries a real code.
 */
export const CLOSE_EXTENSION_NOT_ALLOWED = 4403;
export const CLOSE_BAD_TOKEN = 4401;

/** Human-readable names for history entries, shown when undoing. */
const EDIT_LABELS: Record<string, string> = {
  "write-text": "text edit",
  "write-style": "style change",
  "write-attr": "attribute change",
  "delete-element": "delete",
};

export interface CompanionServer {
  close(): Promise<void>;
  port: number;
}

export async function startServer(options: {
  root: string;
  port: number;
  token: string;
  log?: (line: string) => void;
}): Promise<CompanionServer> {
  const log = options.log ?? (() => {});

  // The extension's stable ID in the Chrome Web Store. Locking the accepted
  // Origin to this exact ID means no other installed extension can reach the
  // companion - only froede can. When you load froede unpacked (development,
  // or before the Store listing is approved) Chrome derives a different ID
  // from the folder path, so point the companion at it with
  //   FROEDE_EXTENSION_ID=<your-unpacked-id>
  // (comma-separated list allowed, or "*" to trust any extension in local dev)
  // or just answer the pairing question the companion asks on first contact.
  const WEBSTORE_EXTENSION_ID = "clfpgnbnfgaabdoiadjfkhfhmnfemeba";
  const extraExtensionIds = (process.env.FROEDE_EXTENSION_ID ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const trustAnyExtension = extraExtensionIds.includes("*");
  const approvedIds = new Set([
    WEBSTORE_EXTENSION_ID,
    ...extraExtensionIds.filter((id) => id !== "*"),
    ...(await loadApprovedExtensions()),
  ]);
  const offerPairing = createPairingPrompt({
    log,
    onApproved: (id) => approvedIds.add(id),
    port: options.port,
  });

  const httpServer = http.createServer((_req, res) => {
    res.writeHead(426).end("froede companion speaks WebSocket only");
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  httpServer.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    const extensionId = extensionIdFromOrigin(origin);
    // Finishing the handshake just to close it carries the reason back to the
    // extension; a pre-upgrade status code would be swallowed by the browser.
    // Nothing is ever read from these sockets: no "connection" event is
    // emitted, so no message handler is ever attached.
    const closeWith = (code: number, reason: string): void => {
      wss.handleUpgrade(req, socket, head, (ws) => ws.close(code, reason));
    };

    // Layer 1: a browser page always sends its own Origin, so anything that
    // is not the froede extension is rejected here. Non-browser clients can
    // omit or forge Origin, which is why the token layer exists below.
    const originTrusted =
      origin === undefined
        ? true
        : trustAnyExtension
          ? origin.startsWith("chrome-extension://")
          : extensionId !== null && approvedIds.has(extensionId);
    if (!originTrusted) {
      if (extensionId !== null) {
        // A real extension we don't trust yet: say so, and offer to pair.
        closeWith(CLOSE_EXTENSION_NOT_ALLOWED, `extension_not_allowed:${extensionId}`);
        void offerPairing(extensionId);
      } else {
        // A web page (or something posing as one) gets nothing back.
        log(`rejected connection: origin ${String(origin)}`);
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
      }
      return;
    }

    // Layer 2: shared token, constant-time comparison.
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const token = url.searchParams.get("token") ?? "";
    if (!tokensMatch(options.token, token)) {
      log("rejected connection: bad token");
      if (origin !== undefined) {
        // The extension is already trusted, so "your token is stale" is
        // actionable feedback, not a leak: a web page never reaches here.
        closeWith(CLOSE_BAD_TOKEN, "bad_token");
      } else {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
      }
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  // Serialize writes: one edit at a time, in arrival order.
  let queue: Promise<void> = Promise.resolve();

  wss.on("connection", (ws: WebSocket) => {
    log("extension connected");
    ws.on("message", (data) => {
      queue = queue.then(() => handleMessage(ws, String(data))).catch(() => {});
    });
    ws.on("close", () => log("extension disconnected"));
  });

  async function handleMessage(ws: WebSocket, raw: string): Promise<void> {
    let requestId = "";
    try {
      const parsed = ClientMessage.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        send(ws, {
          type: "write-result",
          requestId: "",
          ok: false,
          error: "malformed message",
        });
        return;
      }
      const msg = parsed.data;
      requestId = msg.requestId;

      if (msg.type === "ping") {
        send(ws, {
          type: "pong",
          requestId,
          protocolVersion: PROTOCOL_VERSION,
          companionVersion: COMPANION_VERSION,
          root: options.root,
        });
        return;
      }

      if (msg.type === "undo" || msg.type === "redo") {
        const done =
          msg.type === "undo" ? await history.undo() : await history.redo();
        const files = done.files
          .map((f) => path.relative(options.root, f).split(path.sep).join("/"))
          .join(", ");
        log(`${msg.type}: ${done.label} (${files})`);
        const depth = history.depth();
        send(ws, {
          type: "write-result",
          requestId,
          ok: true,
          file: files,
          undoDepth: depth.undo,
          redoDepth: depth.redo,
        });
        return;
      }

      const { target } = msg;
      // One user action = one history entry, even if it spans several files.
      history.begin();
      let result: { file: string };
      if (msg.type === "write-text") {
        result =
          target.kind === "react"
            ? await applyReactTextEdit({
                root: options.root,
                file: target.file,
                line: target.line,
                column: target.column,
                previousText: msg.previousText,
                newText: msg.newText,
                onlyInstance: msg.onlyInstance,
              })
            : await applyStaticTextEdit({
                root: options.root,
                urlPath: target.urlPath,
                domPath: target.domPath,
                previousText: msg.previousText,
                newText: msg.newText,
              });
      } else if (msg.type === "write-style") {
        result =
          target.kind === "react"
            ? await applyReactStyleEdit({
                root: options.root,
                file: target.file,
                line: target.line,
                column: target.column,
                previousStyle: msg.previousStyle,
                style: msg.style,
                onlyInstance: msg.onlyInstance,
              })
            : await applyStaticStyleEdit({
                root: options.root,
                urlPath: target.urlPath,
                domPath: target.domPath,
                previousStyle: msg.previousStyle,
                style: msg.style,
              });
      } else if (msg.type === "write-attr") {
        result =
          target.kind === "react"
            ? await applyReactAttrEdit({
                root: options.root,
                file: target.file,
                line: target.line,
                column: target.column,
                name: msg.name,
                previousValue: msg.previousValue,
                newValue: msg.newValue,
                onlyInstance: msg.onlyInstance,
              })
            : await applyStaticAttrEdit({
                root: options.root,
                urlPath: target.urlPath,
                domPath: target.domPath,
                name: msg.name,
                previousValue: msg.previousValue,
                newValue: msg.newValue,
              });
      } else {
        result =
          target.kind === "react"
            ? await applyReactDelete({
                root: options.root,
                file: target.file,
                line: target.line,
                column: target.column,
                previousTag: msg.previousTag,
              })
            : await applyStaticDelete({
                root: options.root,
                urlPath: target.urlPath,
                domPath: target.domPath,
                previousTag: msg.previousTag,
              });
      }

      history.commit(EDIT_LABELS[msg.type] ?? msg.type);
      log(`wrote ${result.file}`);
      const depth = history.depth();
      send(ws, {
        type: "write-result",
        requestId,
        ok: true,
        file: result.file,
        undoDepth: depth.undo,
        redoDepth: depth.redo,
      });
    } catch (err) {
      // A failed action must not leave a half-open entry in the history.
      history.abort();
      if (!(err instanceof Error) || err.name !== "FroedeError") {
        console.error(err);
      }
      send(ws, {
        type: "write-result",
        requestId,
        ok: false,
        error: publicErrorMessage(err),
      });
    }
  }

  function send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    // Layer 3: loopback only, never reachable from the network.
    httpServer.listen(options.port, "127.0.0.1", resolve);
  });

  return {
    port: options.port,
    close: () =>
      new Promise((resolve) => {
        wss.close();
        httpServer.close(() => resolve());
      }),
  };
}
