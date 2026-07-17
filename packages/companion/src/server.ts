import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ClientMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "@froede/protocol";
import { publicErrorMessage } from "./errors.js";
import { applyReactStyleEdit, applyReactTextEdit } from "./targets/reactSource.js";
import { applyStaticStyleEdit, applyStaticTextEdit } from "./targets/staticHtml.js";
import { tokensMatch } from "./token.js";

export const COMPANION_VERSION = "0.1.0";

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
  const httpServer = http.createServer((_req, res) => {
    res.writeHead(426).end("froede companion speaks WebSocket only");
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  httpServer.on("upgrade", (req, socket, head) => {
    // Layer 1: a browser page always sends its own Origin, so anything
    // that is not the extension is rejected here. Non-browser clients can
    // omit or forge Origin, which is why the token layer exists below.
    const origin = req.headers.origin;
    if (origin !== undefined && !origin.startsWith("chrome-extension://")) {
      log(`rejected connection: origin ${origin}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    // Layer 2: shared token, constant-time comparison.
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const token = url.searchParams.get("token") ?? "";
    if (!tokensMatch(options.token, token)) {
      log("rejected connection: bad token");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
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

      const { target } = msg;
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
              })
            : await applyStaticTextEdit({
                root: options.root,
                urlPath: target.urlPath,
                domPath: target.domPath,
                previousText: msg.previousText,
                newText: msg.newText,
              });
      } else {
        result =
          target.kind === "react"
            ? await applyReactStyleEdit({
                root: options.root,
                file: target.file,
                line: target.line,
                column: target.column,
                previousStyle: msg.previousStyle,
                style: msg.style,
              })
            : await applyStaticStyleEdit({
                root: options.root,
                urlPath: target.urlPath,
                domPath: target.domPath,
                previousStyle: msg.previousStyle,
                style: msg.style,
              });
      }

      log(`wrote ${result.file}`);
      send(ws, { type: "write-result", requestId, ok: true, file: result.file });
    } catch (err) {
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
