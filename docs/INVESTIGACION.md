# Investigación de mercado - froede

**Fecha:** 2026-07-15
**Pregunta:** ¿Ya existe una herramienta open source, gratuita y simple que permita editar visualmente el código de una web o app (texto, estilos, contenido, layout) haciendo clic en los elementos directamente sobre la página en ejecución, sin abrir el IDE, con diseño simple tipo extensión de devtools?

## Metodología

Investigación vía workflow `deep-research`: 5 ángulos de búsqueda en paralelo, 18 fuentes primarias/secundarias fetcheadas, 82 afirmaciones extraídas, verificación adversarial (3 votos por afirmación, se mata con 2/3 en contra).

**Aviso de confianza:** la sesión agotó el límite semanal de uso a mitad de la fase de verificación (54 de 100 sub-agentes fallaron por límite). Resultado: solo 25 de las 82 afirmaciones llegaron a votarse por triplicado (5 confirmadas 3-0, 2 refutadas 0-3). El resto de afirmaciones de este documento vienen de una sola fuente primaria (README/docs oficiales) sin segunda verificación adversarial - fiabilidad razonable (son citas directas de fuentes primarias) pero no al mismo nivel que las confirmadas por triplicado.

## Hallazgos por proyecto

### Onlook (github.com/onlook-dev/onlook) - el más cercano en sync de código
- **Licencia:** Apache 2.0, genuinamente open source. Confirmado 3-0.
- Sincronización bidireccional real: los cambios visuales se escriben en el código fuente real, no es un overlay efímero. Confirmado 3-0.
- Clic derecho sobre un elemento salta a su ubicación exacta en el código. Confirmado 3-0.
- Muy activo: ~24-26k estrellas, 40+ contribuidores, 148 releases, 1639+ commits, respaldado por Y Combinator.
- **Pero:** funciona sobre un contenedor sandbox propio, no tu servidor de desarrollo real, y está acotado a proyectos Next.js + Tailwind. Es una aplicación completa (su propio editor tipo IDE/Cursor), no algo "simple tipo extensión". (Fuente única, sin segunda verificación.)

### Stagewise (github.com/stagewise-io/stagewise) - el más cercano en simplicidad + sync real
- Los cambios hechos vía su agente se reflejan en el editor de código real del desarrollador (integración con el IDE). Confirmado 2-0.
- Release reciente (v1.20.0, julio 2026), proyecto activo.
- Es una barra de herramientas ligera en el navegador (arquitectura simple, más parecida a lo que planteamos).
- **Pero:** el puente a código real pasa por un agente de IA conectado (Cursor/Windsurf/Claude Code, etc.) que interpreta la petición y edita el código - no es manipulación visual directa (arrastrar, cambiar color con un swatch, escribir texto y que se guarde solo). Necesitas ya tener un asistente de IA de código configurado.
- Una afirmación sobre un supuesto "modo efímero vs modo permanente configurable" fue **refutada 0-3** - no se sostiene esa distinción tal como se planteó; mejor no asumir ese matiz concreto.

### VisBug (github.com/GoogleChromeLabs/ProjectVisBug) - la UX más parecida a la idea original
- **Licencia:** Apache 2.0, mantenido por Adam Argyle bajo GoogleChromeLabs. Confirmado 3-0.
- Extensión de navegador, simple, señalar-y-editar directo sobre cualquier página en vivo - exactamente la interacción que describimos.
- **Pero:** edición efímera sobre el DOM, no toca los archivos fuente en ningún momento. Se pierde al recargar. (Fuente única para el matiz "efímero", pero coincide con conocimiento previo del proyecto.)

### GrapesJS (github.com/GrapesJS/grapesjs)
- Licencia BSD-3-Clause, open source, activamente mantenido.
- Es un SDK/framework para que otros construyan SUS editores visuales (usado dentro de ChatGPT, Grapes Studio, etc.), no una herramienta lista para el usuario final.
- Modelo de integración basado en exportación (HTML/CSS/JS/JSON), no sync en vivo con un código fuente ya existente.

### Plasmic (github.com/plasmicapp/plasmic)
- Licencia mixta: SDKs/integraciones MIT, el Studio (backend) es AGPL.
- Modelo: registras tus componentes React existentes dentro de Plasmic Studio (app aparte); no detecta ni edita directamente el DOM de una app ya en ejecución.
- El sync a la app real es vía acción explícita de "Publish", no en vivo mientras haces clic.

### Chrome DevTools Workspaces / Local Overrides
- Nativo del navegador, no un proyecto aparte.
- Sincroniza con archivos reales solo en el panel **Sources** (Ctrl/Cmd+S sobre archivos mapeados); los cambios hechos en el panel **Elements** (clic sobre el elemento en pantalla) NO se persisten al código - justo la interacción que buscamos no está cubierta por esta función nativa.

### Otros descartados por no ser open source o no encajar
- **TeleportHQ:** su repo open source (`teleport-code-generators`, MIT) es un motor de generación de código, no una UI de clic-y-edita.
- **Subframe:** de pago (desde $29/editor/mes), no open source.
- **Webstudio:** alternativa open source a Webflow (AGPL-3.0), pero es un constructor de páginas nuevas (canvas), no edición de una app/código ya existente.
- **TinaCMS:** clic-para-editar contenido sincronizado con Git - interesante pero solo para contenido (CMS), no edición general de código/estilos/layout.
- **Anima, Builder.io, Framer, Webflow:** todos de pago/propietarios (aunque Builder.io tiene SDKs abiertos, el editor visual central es SaaS de pago).

## Veredicto

**No existe hoy un equivalente open source que sea simultáneamente:** (a) simple/ligero tipo extensión, (b) open source de verdad, y (c) que escriba en código fuente real y arbitrario sin sandbox propio ni un agente de IA como intermediario.

- **Onlook** cubre (b) y (c) pero no (a) - es una aplicación completa, no algo "simple".
- **Stagewise** cubre (a) y (b), y (c) de forma indirecta vía agente de IA - el más cercano, pero arquitectónicamente distinto a "manipulación visual directa".
- **VisBug** cubre (a) y (b) perfectamente, pero no (c) en absoluto - es puramente efímero.

**Conclusión: hueco real.** Se procede a crear la estructura del repo `froede`, solo con esa base - no se ha construido nada funcional todavía. Diferenciarse explícitamente de Onlook (simplicidad, sin sandbox) y de Stagewise (edición directa, sin depender de un agente de IA externo) será la clave de posicionamiento cuando se defina el producto en detalle.
