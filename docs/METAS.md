# Metas - froede

Roadmap por metas, sin fechas. El ritmo lo marca Munir.

| Meta | Qué | Estado |
|---|---|---|
| 0 | Investigación de mercado (¿existe ya?) | ✅ 2026-07-15, ver `INVESTIGACION.md` |
| 1 | **v0.1: editar texto visible** en HTML estático y React/Vite, end-to-end (extensión -> companion -> archivo real -> HMR/reload) | ✅ 2026-07-15 |
| 2 | **v0.2: tamaño/color/tipografía/espaciado**, mecanismo = estilo inline siempre scoped al elemento exacto (resuelve la ambigüedad de clases compartidas entre varios elementos) | ✅ 2026-07-15/16, verificado en vivo por Munir |
| 3 | **v0.3: edición de atributos** (alt, href, placeholder, src, title; rechazo de URLs javascript:/data:) + ícono/logo temporal + permiso mínimo `activeTab` + auto-gitignore del token | ✅ 2026-07-17 |
| 4 | **Instalación en un paso: publicado en npm** - `froede`, `vite-plugin-froede`, `froede-protocol` (v0.3.1) + `froede init` instala el plugin de verdad (no rutas locales) | ✅ 2026-07-17, verificado con `npx froede@latest init` contra un proyecto limpio |
| 5 | Publicar extensión en Chrome Web Store (ID estable -> fijar Origin exacto) | ✅ **publicada 2026-07-21**; ID `clfpgnbnfgaabdoiadjfkhfhmnfemeba`, Origin fijado en `server.ts`; ver `PUBLICAR-WEBSTORE.md` |
| 6 | Layout/estructura (mover, duplicar, borrar elementos); espaciado por lado (hoy `padding`/`margin` son un único valor uniforme) | 🟡 en curso (v0.4.0): **arrastrar para mover** + **guías de centrado** (snap tipo Canva) + **borrar** (Backspace/Delete); falta duplicar y espaciado por lado |
| 6.1 | v0.5.0 (2026-07-21): 5 bugs reales encontrados usando froede sobre un proyecto React real - mensajes de error honestos + emparejamiento interactivo del companion, aviso/aislamiento al editar una instancia de un `.map()`, zona muerta en arrastre/resize, `width` en % en vez de px fijos, detección de `.git` en subcarpetas de monorepo. Más **undo/redo real** (Ctrl+Z) y **alineación inteligente** contra elementos cercanos (tipo Figma) | ✅ 2026-07-21, commit `d9c0daa`; **pendiente**: republicar en la Web Store y en npm (la versión pública sigue siendo la del 18 de julio, sin estos arreglos) |
| 7 | Animaciones y transiciones | ⬜ (explícitamente fuera de alcance por ahora, decisión de Munir 2026-07-15) |

## Fuera de alcance permanente (por diseño)

- Agente de IA como intermediario de las ediciones (ese es el hueco vs Stagewise).
- Sandbox/contenedor propio (ese es el hueco vs Onlook).
