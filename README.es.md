<p align="center"><img src="docs/brand/froede-logo.svg" width="110" alt="logo de froede"></p>

# froede

**front + edit + code.** Un toolkit ligero para editar el código detrás de una web o app en ejecución haciendo clic en lo que ves - sin bucear en el código fuente, sin necesitar un IDE completo.

> **Estado: v0.3 (funcionando).** Texto, tamaño, color, tipografía, espaciado y atributos (alt, href, placeholder, src, title) editan de punta a punta en ambos targets (HTML estático y React + Vite), verificado contra archivos reales. Layout y animaciones están en el roadmap. Todavía no está publicado en npm ni en la Chrome Web Store - ver el quickstart abajo.

![Al seleccionar un elemento aparecen tiradores de redimensión y un panel de propiedades](docs/screenshots/panel-select.png)

## La idea

Señalas un elemento en una página o app en ejecución, lo cambias - texto, tamaño, color, tipografía, espaciado - y ese cambio llega al código fuente real. Sin sandbox. Sin un agente de IA como intermediario. Sin ser un cambio efímero en el DOM que desaparece al recargar. Tan simple e intuitivo como una extensión de devtools, no una app de diseño completa.

## En acción

| Antes | Editando texto | Seleccionado: estilo + atributos |
|---|---|---|
| ![Un portafolio corriendo en localhost](docs/screenshots/hero.png) | ![Un título editándose en el sitio](docs/screenshots/text-edit.png) | ![Un botón seleccionado, con tiradores y panel de tamaño, colores, tipografía, espaciado y su atributo href](docs/screenshots/panel-select.png) |

Clic en cualquier elemento para seleccionarlo - aparecen tiradores en las esquinas (Shift+arrastre para trabar a un solo eje) y un panel con tamaño, color, tipografía, espaciado y los atributos editables del elemento. Doble clic en un texto para editarlo en el sitio. Cada cambio se escribe directo en el archivo fuente real.

## ¿Es seguro?

froede edita archivos de tu ordenador, así que esto importa: todo corre **en local** (sin nube, sin cuenta, sin telemetría, sin IA), la pieza que escribe archivos solo puede tocar la carpeta que tú le indicas, y cada parte está explicada en palabras normales en [SECURITY.es.md](SECURITY.es.md) - incluido lo que froede *nunca* puede hacer. Tu deshacer siempre es `git diff`.

## Cómo funciona

- **HTML estático:** la extensión manda la ruta DOM del elemento; el companion la mapea sobre el archivo con parse5 (mismo algoritmo WHATWG que el navegador) y hace el splice del nodo de texto o del atributo `style="..."`.
- **React + Vite:** un plugin de Vite mínimo (`vite-plugin-froede`, solo en dev) marca cada elemento con `data-froede-loc="src/App.tsx:4:6"`; el companion reparsea ese archivo y edita el texto JSX exacto o parchea el objeto `style={{}}`. El HMR de Vite muestra el cambio al instante.
- **Los cambios de estilo son siempre inline y siempre scoped al elemento exacto** - nunca una regla de clase compartida, así que redimensionar una card nunca mueve a sus hermanas.
- **Seguridad:** solo loopback, verificación de Origin (una página web nunca puede conectarse), token compartido (comparación en tiempo constante), y el companion físicamente no puede escribir fuera de la carpeta del proyecto donde arrancó. Cada edición verifica el valor actual antes de escribir y aborta si no coincide.

## Quickstart (v0.3, desde el código)

Guía completa en [`docs/INSTALAR.md`](docs/INSTALAR.md), incluido un prompt listo para pegarle a tu asistente de IA para que lo instale él. Resumen: `pnpm install && pnpm build`, cargar `packages/extension/dist` como extensión descomprimida, y en tu proyecto correr **`froede init`** (`node <froede>/packages/companion/dist/cli.js init`): detecta el vite.config, inyecta el plugin y protege el token en el `.gitignore` solo. Después arrancas el companion ahí mismo.

v0.3 edita texto plano visible, tamaño/color/tipografía/espaciado inline, y un allowlist seguro de atributos (href/src rechazan URLs de tipo script) - todavía sin layout (mover/duplicar/borrar) ni animaciones. Pruébalo con `examples/static-site`, `examples/react-vite-app` o `examples/demo-site`. El deshacer es `git diff`.

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
