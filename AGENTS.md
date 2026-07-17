# AGENTS.md - froede

Reglas para agentes de IA trabajando en este repo. Hereda las reglas generales de `C:\proyectos\Reglas_de_los_proyectos.md`.

## Qué es

**froede** (front + edit + code): haces clic en un elemento de tu web corriendo en localhost, editas el texto en el sitio, y el cambio se escribe en el archivo fuente real. Sin sandbox, sin agente de IA intermediario. Ver `README.md` y `docs/INVESTIGACION.md` (por qué existe) y `docs/PROTOCOLO.md` (cómo funciona el puente).

## Estructura

- `packages/protocol` - contrato wire (zod). **Fuente de verdad del protocolo.**
- `packages/companion` - proceso Node local (`froede` CLI). Único que toca archivos.
- `packages/vite-plugin` - anota JSX con `data-froede-loc` (solo `serve`, jamás `build`).
- `packages/extension` - extensión MV3. Sin bundler: `tsc` a scripts clásicos + `static/`.
- `examples/` - fixtures de prueba manual. **Fuera del workspace pnpm a propósito** (simulan un proyecto de terceros; `react-vite-app` tiene su propio lockfile).
- `scripts/e2e-*.mjs` - tests end-to-end reales (levantan el companion, editan, verifican, restauran).

## Reglas

1. **Idioma:** README/commits/UI/código en inglés; `AGENTS.md` y `docs/*.md` en español. Sin raya larga en textos públicos.
2. **pnpm siempre** (`packageManager` fijado). El workspace es real: `packages/*`.
3. **TypeScript `strict: true`** (base en `tsconfig.base.json`).
4. **Seguridad, invariantes que NO se relajan:**
   - El companion solo escucha en `127.0.0.1` y solo escribe dentro de su `projectRoot` (`fsGuard.ts` con realpath + `path.relative`, nunca prefijos de string).
   - Origin de páginas web se rechaza; solo `chrome-extension://` o clientes sin Origin (cubiertos por token).
   - Token en `.froede-token` (gitignored), comparación en tiempo constante.
   - El content script JAMÁS abre el WebSocket (heredaría el Origin de la página); solo el background service worker.
   - Toda edición verifica el valor previo (`previousText`/`previousStyle`/`previousValue`) antes de escribir; en mismatch se aborta.
   - Los splices preservan formato (offsets exactos + padding), nunca reserializar AST completo al archivo del usuario.
   - Estilos y atributos son ALLOWLISTS cerrados en `protocol` (regex por propiedad de estilo; `href`/`src` rechazan esquemas `javascript:`/`vbscript:`/`data:`). No añadir propiedades/atributos sin pensar el escapado del splice.
5. **Los tipos de `packages/extension/src/types.d.ts` son un ESPEJO manual de `packages/protocol`** (la extensión no puede importar en runtime al compilar sin bundler). Si tocas el protocolo, actualiza ambos y sube `PROTOCOL_VERSION` si rompe compatibilidad.
6. **Build y verificación:** `pnpm build` (raíz) y `pnpm e2e` (necesita Node >= 22). Los e2e deben pasar antes de cualquier commit que toque companion/protocol.
7. Commits en inglés estilo `feat:`/`fix:`/`docs:`, sin `Co-Authored-By`. **Prohibido `git push` sin permiso explícito de Munir.**
