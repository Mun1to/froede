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
// target react (de data-froede-loc, estampado por vite-plugin-froede)
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

### `write-style` -> `write-result`

Igual que `write-text`, pero para tamaño/color/tipografía/espaciado. Siempre estilo **inline**, siempre scoped al elemento exacto (nunca toca una regla `.clase` compartida - decisión explícita para no mover de golpe a todos los elementos que comparten clase, p. ej. varias "cards" con `className="card"`).

```jsonc
{
  "type": "write-style", "requestId": "...",
  "target": { "kind": "react", "file": "src/App.tsx", "line": 32, "column": 12 },
  "previousStyle": { "width": "", "backgroundColor": "" },
  "style": { "width": "280px", "backgroundColor": "#312e81" }
}
// respuesta: igual forma que write-text
{ "type": "write-result", "requestId": "...", "ok": true, "file": "src/App.tsx" }
```

`style` es un **allowlist** cerrado (zod `.strict()`), no CSS libre: `width`/`height` (px o %), `color`/`backgroundColor` (hex de 6 dígitos), `fontSize`/`padding`/`margin` (px), `fontWeight` (`normal`/`bold`/`100`-`900`). Cada propiedad tiene su propio regex. Esto no es solo validación de forma: como el valor se empalma directo en un archivo fuente (literal string de JS o atributo `style=""` de HTML), un regex estricto por propiedad es lo que hace el splice seguro ante inyección sin necesitar escapado contextual complejo - un valor que ya matcheó `^\d+(\.\d+)?px$` no puede contener `"`, `;`, `<` ni nada que rompa el contexto donde se inserta.

`previousStyle` es el mismo tipo de red de seguridad que `previousText`, pero por propiedad: el companion compara el valor inline ACTUAL de cada clave contra lo que el cliente cree que hay (`""` si cree que no está seteada) antes de escribir nada; si no coincide, aborta la petición completa (todo o nada).

### `write-attr` -> `write-result`

Edición de atributos con **allowlist cerrado**: `alt`, `href`, `placeholder`, `src`, `title`. Los valores son texto libre (con escapado de entidades antes del splice: `&`/`"` en JSX, `&`/`"`/`<` en HTML), pero `href`/`src` **rechazan esquemas de script** (`javascript:`, `vbscript:`, `data:`) a nivel de protocolo (zod `superRefine`): aunque el usuario edita su propio sitio, froede nunca debe ser el vehículo que escriba un vector XSS en un archivo fuente.

```jsonc
{
  "type": "write-attr", "requestId": "...",
  "target": { "kind": "react", "file": "src/App.tsx", "line": 24, "column": 12 },
  "name": "href",
  "previousValue": "#work",
  "newValue": "#pricing"
}
```

`previousValue` es la misma red de seguridad que `previousText` (`""` = el cliente cree que el atributo no existe). En React solo se editan atributos con valor string literal (`{expresiones}` se rechazan); si el atributo no existe se inserta tras el nombre del tag. En HTML estático se reemplaza el rango exacto del atributo (parse5 da la ubicación por atributo) o se inserta antes del primero existente.

## Por qué `previousText`/`previousStyle`/`previousValue` viajan siempre

El archivo puede haber cambiado por fuera (editor, otro agente) entre que cargó la página y el clic. El companion compara (con espacios normalizados en texto; valor exacto en estilo) lo que encuentra en la ubicación resuelta contra lo que manda el cliente; si no coincide, aborta sin escribir. Es la red de seguridad de ambos mecanismos de mapeo.

## Mapeo DOM -> código

- **react:** el plugin de Vite parsea cada `.jsx`/`.tsx` con `@babel/parser` (solo en `serve`) e inyecta `data-froede-loc="archivo:línea:columna"` en elementos host (minúscula); los componentes (Mayúscula) se saltan para no filtrar props. El companion reparsea el archivo con el mismo parser y localiza el `JSXElement` por posición exacta. Para texto: solo se edita un único hijo `JSXText` literal; `{expresiones}` se rechazan, caracteres `{}<>` se envuelven como `{"..."}`. Para estilo: localiza (o crea) el atributo `style={{...}}` del `JSXOpeningElement` y hace splice quirúrgico por propiedad con `magic-string` - si la propiedad ya existe se sobreescribe solo su valor, si no existe se inserta justo después de la última propiedad existente (nunca reimprime el objeto completo). Si `style` no es un objeto literal plano (p. ej. `style={miVariable}`), se rechaza pidiendo edición manual. El refresco lo hace el propio HMR de Vite al guardarse el archivo.
- **static-html:** el content script calcula la ruta de índices de hijos-elemento desde `<html>`; el companion relee el archivo del disco, lo parsea con **parse5** (`sourceCodeLocationInfo: true`; mismo algoritmo WHATWG que el navegador, así que el árbol tiene la misma forma) y camina la misma ruta. Para texto: edita solo el nodo de texto único, escapando `& < >`. Para estilo: parsea el atributo `style="..."` existente (si hay) a un mapa de propiedades, mezcla con las nuevas, y reescribe TODO el atributo de una vez (a diferencia de React, aquí sí se permite normalizar el texto CSS - nadie cuida el formato exacto de un `style=""`); si el elemento no tenía ningún atributo, se inserta `style="..."` justo antes del primero existente (o antes del `>` si no hay ninguno). El refresco es un `chrome.tabs.reload` que pide el background.
- En ambos casos el splice es por offsets exactos preservando el padding/atributos originales; **nunca** se reserializa el AST/HTML completo (mataría el diff de git).

## Nota conocida: escrituras muy seguidas al mismo archivo

Si dos peticiones `write-style`/`write-text` llegan al mismo archivo con NINGÚN espacio de tiempo entre sí (verificado con un script de prueba, no con uso real), el file-watcher de Vite puede quedarse con el estado intermedio hasta el siguiente cambio real. No es un bug de froede (el archivo en disco siempre queda correcto, verificado leyéndolo directamente) y no debería darse en uso real: un humano arrastrando un tirador y después tocando un color siempre deja más margen que eso. Si algún día se automatiza la UI (tests end-to-end de la extensión, por ejemplo), tenerlo en cuenta.
