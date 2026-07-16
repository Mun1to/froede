# froede

**front + edit + code.** Un toolkit ligero para editar el código detrás de una web o app en ejecución haciendo clic en lo que ves - sin bucear en el código fuente, sin necesitar un IDE completo.

> **Estado: MVP v0.1 (funcionando).** La edición de texto visible funciona de punta a punta en ambos targets (HTML estático y React + Vite), verificada contra archivos reales. Estilos, layout y más están en el roadmap. Todavía no está publicado en npm ni en la Chrome Web Store - ver el quickstart abajo.

## La idea

Señalas un elemento en una página o app en ejecución, lo cambias - texto, estilo, layout - y ese cambio llega al código fuente real. Sin sandbox. Sin un agente de IA como intermediario. Sin ser un cambio efímero en el DOM que desaparece al recargar. Tan simple e intuitivo como una extensión de devtools, no una app de diseño completa.

## Cómo funciona

- **HTML estático:** la extensión manda la ruta DOM del elemento; el companion la mapea sobre el archivo con parse5 (mismo algoritmo WHATWG que el navegador) y hace el splice del nodo de texto.
- **React + Vite:** un plugin de Vite mínimo (`@froede/vite-plugin`, solo en dev) marca cada elemento con `data-froede-loc="src/App.tsx:4:6"`; el companion reparsea ese archivo y edita el texto JSX exacto. El HMR de Vite muestra el cambio al instante.
- **Seguridad:** solo loopback, verificación de Origin (una página web nunca puede conectarse), token compartido (comparación en tiempo constante), y el companion físicamente no puede escribir fuera de la carpeta del proyecto donde arrancó. Cada edición verifica el texto actual antes de escribir y aborta si no coincide.

## Quickstart (v0.1, desde el código)

Guía completa en [`docs/INSTALAR.md`](docs/INSTALAR.md), incluido un prompt listo para pegarle a tu asistente de IA para que lo instale él. Resumen: `pnpm install && pnpm build`, cargar `packages/extension/dist` como extensión descomprimida, arrancar el companion con el cwd en tu proyecto, y en proyectos Vite añadir `froede()` al `vite.config.ts`.

v0.1 edita solo texto plano visible (sin estilos/layout todavía, sin `{expresiones}` en JSX). Pruébalo con `examples/static-site` y `examples/react-vite-app`. El deshacer es `git diff`.

## Panorama (a mediados de 2026)

Antes de empezar, investigamos si ya existía algo así:

| Proyecto | Open source | Simple / ligero | Escribe en el código fuente real |
|---|---|---|---|
| [Onlook](https://github.com/onlook-dev/onlook) | Sí (Apache-2.0) | No - app completa, contenedor sandbox, solo Next.js + Tailwind | Sí |
| [Stagewise](https://github.com/stagewise-io/stagewise) | Sí | Sí - barra de herramientas en el navegador | Indirecto - pasa por un agente de IA conectado |
| [VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug) | Sí (Apache-2.0) | Sí - extensión de navegador | No - solo DOM, efímero |
| [GrapesJS](https://github.com/GrapesJS/grapesjs) | Sí (BSD-3-Clause) | No - es un SDK para construir editores, no una herramienta para el usuario final | No - basado en exportación |
| [Plasmic](https://github.com/plasmicapp/plasmic) | Mixta (MIT núcleo / AGPL studio) | No - app Studio aparte | Basado en "Publish", no en vivo |
| Chrome DevTools Workspaces | Nativo | Sí | Solo el panel Sources - los cambios de elemento/DOM no se guardan |

Ninguno combina "simple de señalar y hacer clic" con "escribe de verdad en tu código fuente, sin sandbox, sin intermediario de IA". Ese es el hueco al que apunta froede.

Detalle completo de la investigación en [`docs/INVESTIGACION.md`](docs/INVESTIGACION.md).

## Licencia

MIT - ver [LICENSE](LICENSE).
