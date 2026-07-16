# Protocolo extensión <-> companion (v1)

## Transporte

WebSocket sobre `ws://127.0.0.1:<puerto>` (por defecto **4519**). El companion nunca escucha fuera de loopback. Se descartó Chrome Native Messaging: obliga a que Chrome lance el proceso (registro por SO) y rompe el modelo "companion como dev-server que arrancas tú en tu proyecto".

## Modelo de amenazas y capas de defensa

| Capa | Defiende contra | Mecanismo |
|---|---|---|
| 1. Bind a `127.0.0.1` | Atacantes de la LAN | El puerto no existe fuera de la máquina |
| 2. Validación de `Origin` | Páginas web maliciosas (DNS rebinding, localhost hijack) | Solo se acepta `chrome-extension://*` o ausencia de Origin (cliente no-navegador). Un navegador SIEMPRE manda el Origin de la página, así que una web nunca pasa. Mismo arreglo que adoptó webpack-dev-server tras sufrir este ataque |
| 3. Token compartido | Otros procesos locales (pueden falsificar Origin) | `.froede-token` (48 hex, gitignored) generado por el companion; la extensión lo manda como query param; comparación en tiempo constante (hash sha256 de ambos lados + `timingSafeEqual`) |
| 4. Confinamiento a `projectRoot` | Escrituras fuera del proyecto aunque todo lo demás falle | `realpath` de root y destino (neutraliza symlinks) + `path.relative` (rechaza `..` y absolutas). El root es el cwd donde arrancó el companion |

Regla arquitectónica clave: **el content script jamás abre el WebSocket** (corre en el contexto de la página y heredaría su Origin, invalidando la capa 2). Solo el background service worker se conecta; el content script le habla por `chrome.runtime.sendMessage`.

Extra: `maxPayload` 1 MB, textos limitados a 50k chars, `domPath` a 64 niveles, escrituras serializadas en cola (una a la vez).

## Mensajes (JSON, definidos con zod en `packages/protocol`)

### `ping` -> `pong`

```jsonc
// extensión -> companion
{ "type": "ping", "requestId": "...", "protocolVersion": 1 }
// companion -> extensión
{ "type": "pong", "requestId": "...", "protocolVersion": 1, "companionVersion": "0.1.0", "root": "C:\\ruta\\al\\proyecto" }
```

Si `protocolVersion` no coincide, la extensión muestra error claro (extensión y companion se distribuyen por separado).

### `write-text` -> `write-result`

```jsonc
// target react (de data-froede-loc, estampado por @froede/vite-plugin)
{
  "type": "write-text", "requestId": "...",
  "target": { "kind": "react", "file": "src/App.tsx", "line": 4, "column": 6 },
  "previousText": "Hola froede",
  "newText": "Nuevo texto"
}
// target estático (ruta de índices de hijos-elemento desde <html>)
{
  "type": "write-text", "requestId": "...",
  "target": { "kind": "static-html", "urlPath": "/", "domPath": [1, 1, 1] },
  "previousText": "...", "newText": "..."
}
// respuesta
{ "type": "write-result", "requestId": "...", "ok": true, "file": "src/App.tsx" }
{ "type": "write-result", "requestId": "...", "ok": false, "error": "text mismatch - ..." }
```

## Por qué `previousText` viaja siempre

El archivo puede haber cambiado por fuera (editor, otro agente) entre que cargó la página y el clic. El companion compara (con espacios normalizados) lo que encuentra en la ubicación resuelta contra `previousText`; si no coincide, aborta sin escribir. Es la red de seguridad de ambos mecanismos de mapeo.

## Mapeo DOM -> código

- **react:** el plugin de Vite parsea cada `.jsx`/`.tsx` con `@babel/parser` (solo en `serve`) e inyecta `data-froede-loc="archivo:línea:columna"` en elementos host (minúscula); los componentes (Mayúscula) se saltan para no filtrar props. El companion reparsea el archivo con el mismo parser y localiza el `JSXElement` por posición exacta. Solo se edita un único hijo `JSXText` literal; `{expresiones}` se rechazan. Caracteres `{}<>` se envuelven como `{"..."}`. El refresco lo hace el propio HMR de Vite al guardarse el archivo.
- **static-html:** el content script calcula la ruta de índices de hijos-elemento desde `<html>`; el companion relee el archivo del disco, lo parsea con **parse5** (`sourceCodeLocationInfo: true`; mismo algoritmo WHATWG que el navegador, así que el árbol tiene la misma forma) y camina la misma ruta. Edita solo el nodo de texto único, escapando `& < >`. El refresco es un `chrome.tabs.reload` que pide el background.
- En ambos casos el splice es por offsets exactos preservando el padding original; **nunca** se reserializa el AST completo (mataría el diff de git).
