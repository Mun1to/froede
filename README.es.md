<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/froede_logoclaro.svg">
    <img src="docs/brand/froede_logooscuro.svg" width="110" alt="logo de froede">
  </picture>
</p>

# froede

**front + edit + code.** Un toolkit ligero para editar el código detrás de una web o app en ejecución haciendo clic en lo que ves - sin bucear en el código fuente, sin necesitar un IDE completo.

[![npm](https://img.shields.io/npm/v/froede)](https://www.npmjs.com/package/froede) [![license](https://img.shields.io/npm/l/froede)](LICENSE) [![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-pronto-4285F4?logo=googlechrome&logoColor=white)](https://github.com/Mun1to/froede/releases/latest)

> **Estado: publicado en npm** (versión actual en el badge de arriba). Texto, tamaño, color, tipografía, espaciado y atributos (alt, href, placeholder, src, title) editan de punta a punta en ambos targets (HTML estático y React + Vite), verificado contra archivos reales. También puedes **arrastrar elementos para moverlos** (con guías de centrado, tipo Canva) y **borrarlos** con Backspace. Las herramientas de layout completas y las animaciones siguen en el roadmap. **En revisión para la Chrome Web Store** - hasta que aparezca allí, el quickstart de abajo cubre la instalación manual.

![Al seleccionar un elemento aparecen tiradores de redimensión y un panel de propiedades](docs/screenshots/panel-select.png)

## La idea

Señalas un elemento en una página o app en ejecución, lo cambias - texto, tamaño, color, tipografía, espaciado, atributos, su posición (arrastrar para mover) - o lo borras, y ese cambio llega al código fuente real. Sin sandbox. Sin un agente de IA como intermediario. Sin ser un cambio efímero en el DOM que desaparece al recargar. Tan simple e intuitivo como una extensión de devtools, no una app de diseño completa.

## En acción

| Antes | Editando texto | Seleccionado: estilo + atributos | Moviendo: guías de centrado |
|---|---|---|---|
| ![Una landing corriendo en localhost](docs/screenshots/hero.png) | ![Un título editándose en el sitio](docs/screenshots/text-edit.png) | ![Un botón seleccionado, con tiradores y panel de tamaño, colores, tipografía, espaciado y su atributo href](docs/screenshots/panel-select.png) | ![Un elemento arrastrándose, con una guía vertical que lo centra en su contenedor](docs/screenshots/move-guides.png) |

Clic en cualquier elemento para seleccionarlo - aparecen tiradores en las esquinas (Shift+arrastre para trabar a un solo eje) y un panel con tamaño, color, tipografía, espaciado y los atributos editables del elemento. Arrástralo para moverlo - las guías lo centran automáticamente - y pulsa Backspace para borrarlo. Doble clic en un texto para editarlo en el sitio. Cada cambio se escribe directo en el archivo fuente real.

## ¿Es seguro?

froede edita archivos de tu ordenador, así que esto importa: todo corre **en local** (sin nube, sin cuenta, sin telemetría, sin IA), la pieza que escribe archivos solo puede tocar la carpeta que tú le indicas, y cada parte está explicada en palabras normales en [SECURITY.es.md](SECURITY.es.md) - incluido lo que froede *nunca* puede hacer. Tu deshacer siempre es `git diff`.

## Cómo funciona

- **HTML estático:** la extensión manda la ruta DOM del elemento; el companion la mapea sobre el archivo con parse5 (mismo algoritmo WHATWG que el navegador) y hace el splice del nodo de texto o del atributo `style="..."`.
- **React + Vite:** un plugin de Vite mínimo (`vite-plugin-froede`, solo en dev) marca cada elemento con `data-froede-loc="src/App.tsx:4:6"`; el companion reparsea ese archivo y edita el texto JSX exacto o parchea el objeto `style={{}}`. El HMR de Vite muestra el cambio al instante.
- **Los cambios de estilo son siempre inline y siempre scoped al elemento exacto** - nunca una regla de clase compartida, así que redimensionar una card nunca mueve a sus hermanas.
- **Seguridad:** solo loopback, Origin fijado al ID de la propia extensión froede (ni una web ni otra extensión pueden conectarse), token compartido (comparación en tiempo constante), y el companion físicamente no puede escribir fuera de la carpeta del proyecto donde arrancó. Cada edición verifica el valor actual antes de escribir y aborta si no coincide.

## Quickstart

1. **Consigue la extensión** (una vez por navegador): [descarga el .zip de la última release](https://github.com/Mun1to/froede/releases/latest), descomprímelo, entra en `chrome://extensions`, activa el Modo desarrollador, pulsa "Cargar descomprimida" y elige la carpeta descomprimida.

2. **Prepara tu proyecto** (los HTML estáticos se saltan este paso - basta servir la carpeta en localhost):

   ```bash
   cd tu-proyecto
   npx froede init   # detecta tu vite.config, instala el plugin y lo cablea solo
   ```

3. **Arranca el companion y emparéjalo:**

   ```bash
   npx froede        # imprime un puerto y un token de emparejamiento
   ```

   Abre tu página en localhost, pega el puerto + token en el popup de la extensión, y activa "Toggle edit mode". Clic para seleccionar, doble clic para editar texto - cada cambio se guarda en el archivo real, y tu deshacer es `git diff`.

   > ¿La cargaste descomprimida? Chrome le da a la extensión un ID por carpeta que el companion necesita reconocer. Copia el ID que aparece bajo la extensión en `chrome://extensions` y arranca el companion con él: `FROEDE_EXTENSION_ID=<ese-id> npx froede` (PowerShell: `$env:FROEDE_EXTENSION_ID="<ese-id>"; npx froede`). Cuando instales froede desde la Chrome Web Store esto no hace falta - su ID se confía por defecto.

Guía completa, con un prompt listo para pegarle a tu asistente de IA: [`docs/INSTALAR.md`](docs/INSTALAR.md).

v0.4 edita texto plano visible, tamaño/color/tipografía/espaciado inline, y un allowlist seguro de atributos (href/src rechazan URLs de tipo script), y añade lo básico de layout - arrastrar para mover (con guías de centrado) y borrar. Duplicar elementos y las animaciones siguen en el roadmap.

## Con Claude Code (o cualquier asistente de IA)

froede incluye un skill de [Claude Code](https://claude.com/claude-code) que lo arranca por ti: detecta si es HTML estático o React/Vite, levanta el companion y te guía para emparejar y editar. Copia [`.claude/skills/froede/`](.claude/skills/froede/SKILL.md) en tu propio `~/.claude/skills/` y luego solo di *"arranca froede aquí"* en cualquier proyecto.

¿Sin skill? Pega esto en tu sesión de IA:

> Configura froede (github.com/Mun1to/froede) para editar mi página de localhost haciendo clic. Detecta si es HTML estático o React/Vite (corre `npx froede init` una vez si es Vite), arranca el companion con `npx froede`, dame el puerto y el token para el popup de la extensión, y guíame para editar: clic para seleccionar, doble clic para texto, arrastrar para mover, Backspace para borrar; deshacer con `git diff`.

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
