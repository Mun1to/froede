# froede

**front + edit + code.** Un toolkit ligero para editar el código detrás de una web o app en ejecución haciendo clic en lo que ves - sin bucear en el código fuente, sin necesitar un IDE completo.

> **Estado: concepto / pre-alpha.** Este repositorio de momento solo tiene la estructura inicial del proyecto. Todavía no hay código funcional.

## La idea

Señalas un elemento en una página o app en ejecución, lo cambias - texto, estilo, layout - y ese cambio llega al código fuente real. Sin sandbox. Sin un agente de IA como intermediario. Sin ser un cambio efímero en el DOM que desaparece al recargar. Tan simple e intuitivo como una extensión de devtools, no una app de diseño completa.

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
