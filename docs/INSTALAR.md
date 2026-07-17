# Instalar froede en tu proyecto (v0.3.1, publicado en npm)

Tres piezas: la **extensión** (una vez por navegador), el **companion** (uno por proyecto, corriendo) y, si el proyecto es React/Vite, el **plugin de Vite**.

## 1. Cargar la extensión (una sola vez por navegador)

1. [Descarga el .zip de la última release](https://github.com/Mun1to/froede/releases/latest) y descomprímelo.
2. Chrome/Edge -> `chrome://extensions` -> activar "Modo de desarrollador".
3. "Cargar descomprimida" -> elegir la carpeta descomprimida.

(Todavía no está en la Chrome Web Store - meta 5 del roadmap. Si ya la tenías cargada desde el código, alcanza con darle a **recargar (↻)** en su tarjeta tras actualizar.)

## 2. Configurar el proyecto (un comando)

```bash
cd tu-proyecto
npx froede init
```

Detecta el `vite.config.*`, **instala `vite-plugin-froede` de verdad** (con tu gestor de paquetes: pnpm/npm/yarn/bun, detectado por el lockfile), lo añade como primer plugin, y protege `.froede-token` en el `.gitignore`. Si no hay vite config, te dice cómo servir el proyecto estático - no hace falta nada más para HTML plano.

## 3. Arrancar el companion (cada vez que trabajes)

```bash
npx froede
```

Imprime el puerto (4519) y un token. **El token cambia cada vez que reinicias el companion** - si la extensión dice que no puede conectar, probablemente es un token viejo, no que el companion esté caído.

> **Atajo si trabajas desde el código fuente de froede** (`C:\proyectos\froede`, no vía npm): `C:\proyectos\froede\froede.bat C:\ruta\a\tu\proyecto` abre dev server + companion juntos.

## 4. Usar

1. Abrir la página en `http://localhost:...`
2. Popup de froede -> pegar puerto y token -> "Test connection" (debe mostrar la ruta del proyecto).
3. "Toggle edit mode in this tab".
4. **Clic** sobre cualquier elemento -> lo selecciona: aparecen tiradores en las esquinas (arrastrar para redimensionar; Shift+arrastre = solo un eje) y un panel con tamaño/color/tipografía/espaciado/atributos.
5. **Doble clic** sobre un texto -> lo edita in-place -> Enter para guardar, Esc para cancelar.
6. Todo cambio queda escrito en el archivo fuente real (en React lo verás vía HMR sin recargar; en HTML estático la pestaña se recarga sola).

**Límites v0.3:** texto = solo plano visible (elementos sin hijos anidados; en React no se editan `{expresiones}` ni componentes sin `data-froede-loc`); estilo = siempre inline en el elemento exacto (nunca toca una clase compartida); espaciado (padding/margin) es un único valor uniforme, no por lado; atributos = allowlist cerrado (alt/href/placeholder/src/title); sin animaciones ni layout (mover/duplicar/borrar) todavía. Deshacer = `git diff` / `git checkout`.

¿Es seguro? Explicación en lenguaje llano: [`SECURITY.es.md`](../SECURITY.es.md).

---

## Prompt listo para pegar en la sesión de IA de tu proyecto

> Instala froede en este proyecto para poder editarlo visualmente desde el navegador (texto, tamaño, color, tipografía, espaciado y atributos - clic para seleccionar, doble clic para editar texto). Haz esto:
> 1. Con el cwd en la RAÍZ de este proyecto, corre `npx froede init` - instala el plugin de Vite (si aplica) y configura el `.gitignore` solo. Si tocó el `vite.config`, reinicia el dev server.
> 2. Arranca el companion en una terminal aparte, también desde la raíz: `npx froede`. Déjalo corriendo y dime el puerto y el token que imprime (el token cambia cada reinicio).
> 3. No toques nada más; froede no necesita más configuración. Las ediciones que haga con froede aparecerán como cambios en los archivos fuente (estilos inline, textos, atributos): son intencionales, no las reviertas.
