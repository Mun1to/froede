# Instalar froede en tu proyecto (v0.3, sin publicar en npm todavía)

Tres piezas: la **extensión** (una vez por navegador), el **companion** (uno por proyecto, corriendo) y, si el proyecto es React/Vite, el **plugin de Vite**.

> **Atajo: `froede init`.** Los pasos 2 y 3 de abajo se hacen solos con un comando (con el cwd en la raíz de tu proyecto):
> ```powershell
> node C:\proyectos\froede\packages\companion\dist\cli.js init
> ```
> Detecta el `vite.config.*`, inyecta `froede()` como primer plugin, y añade `.froede-token` al `.gitignore`. Si no hay vite config, te dice cómo servir el proyecto estático. Luego solo queda arrancar el companion (paso 2) y usar la extensión.

> **Atajo del día a día: `froede.bat`.** Una vez configurado el proyecto, para trabajar solo hace falta esto:
> ```powershell
> C:\proyectos\froede\froede.bat C:\ruta\a\tu\proyecto
> ```
> Abre dos terminales solas: el dev server del proyecto (si tiene `package.json`, corre `pnpm dev`) y el companion. Sin argumento usa la carpeta actual. Cerrar las ventanas = parar los procesos.

## 1. Cargar la extensión (una sola vez, y cada vez que froede se recompile)

1. Compilar si hace falta: `pnpm build` en `C:\proyectos\froede`.
2. Chrome/Edge -> `chrome://extensions` -> activar "Modo de desarrollador".
3. "Cargar descomprimida" -> elegir `C:\proyectos\froede\packages\extension\dist`.

Si ya estaba cargada, alcanza con darle a **recargar (↻)** en la tarjeta de la extensión.

## 2. Companion (en el proyecto que quieres editar)

```powershell
cd C:\ruta\a\tu\proyecto   # esta carpeta sera el limite: froede no escribe fuera
node C:\proyectos\froede\packages\companion\dist\cli.js
```

Imprime el puerto (4519) y el token. Crea `.froede-token` (añadirlo a `.gitignore`). **El token cambia cada vez que reinicias el companion** - si la extensión dice que no puede conectar, probablemente es un token viejo, no que el companion esté caído.

## 3. Solo proyectos React/Vite: el plugin

En `vite.config.ts`, añadir `froede()` ANTES del plugin de React y reiniciar el dev server:

```ts
import froede from "../../froede/packages/vite-plugin/dist/index.js"; // ruta relativa a C:\proyectos\froede

export default defineConfig({
  plugins: [froede(), react()],
});
```

(Los proyectos HTML estáticos no necesitan plugin: basta servirlos en localhost, p. ej. `python -m http.server`. Ojo con live-server: inyecta scripts en el DOM y desincroniza el mapeo.)

## 4. Usar

1. Abrir la página en `http://localhost:...`
2. Popup de froede -> pegar puerto y token -> "Test connection" (debe mostrar la ruta del proyecto).
3. "Toggle edit mode in this tab".
4. **Clic** sobre cualquier elemento -> lo selecciona: aparecen tiradores en las esquinas (arrastrar para redimensionar; Shift+arrastre = solo un eje) y un panel con tamaño/color/tipografía/espaciado.
5. **Doble clic** sobre un texto -> lo edita in-place -> Enter para guardar, Esc para cancelar.
6. Todo cambio queda escrito en el archivo fuente real (en React lo verás vía HMR sin recargar; en HTML estático la pestaña se recarga sola).

**Límites v0.2:** texto = solo plano visible (elementos sin hijos anidados; en React no se editan `{expresiones}` ni componentes sin `data-froede-loc`); estilo = siempre inline en el elemento exacto (nunca toca una clase compartida); espaciado (padding/margin) es un único valor uniforme, no por lado; sin animaciones ni layout (mover/duplicar/borrar) todavía. Deshacer = `git diff` / `git checkout`.

---

## Prompt listo para pegar en la sesión de IA de tu proyecto

> Instala froede en este proyecto para poder editarlo visualmente desde el navegador (texto, tamaño, color, tipografía, espaciado y atributos - clic para seleccionar, doble clic para editar texto). froede vive en `C:\proyectos\froede` (monorepo pnpm ya compilado). Haz esto:
> 1. Con el cwd en la RAÍZ de este proyecto, corre `node C:\proyectos\froede\packages\companion\dist\cli.js init` - configura el plugin de Vite (si aplica) y el `.gitignore` solo. Si tocó el `vite.config`, reinicia el dev server.
> 2. Arranca el companion en una terminal aparte, también desde la raíz: `node C:\proyectos\froede\packages\companion\dist\cli.js`. Déjalo corriendo y dime el puerto y el token que imprime (el token cambia cada reinicio).
> 3. No toques nada más; froede no necesita más configuración. Las ediciones que haga con froede aparecerán como cambios en los archivos fuente (estilos inline, textos, atributos): son intencionales, no las reviertas.
