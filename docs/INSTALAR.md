# Instalar froede en tu proyecto (v0.1, sin publicar en npm todavía)

Tres piezas: la **extensión** (una vez por navegador), el **companion** (uno por proyecto, corriendo) y, si el proyecto es React/Vite, el **plugin de Vite**.

## 1. Cargar la extensión (una sola vez)

1. Compilar si hace falta: `pnpm build` en `C:\proyectos\froede`.
2. Chrome/Edge -> `chrome://extensions` -> activar "Modo de desarrollador".
3. "Cargar descomprimida" -> elegir `C:\proyectos\froede\packages\extension\dist`.

## 2. Companion (en el proyecto que quieres editar)

```powershell
cd C:\ruta\a\tu\proyecto   # esta carpeta sera el limite: froede no escribe fuera
node C:\proyectos\froede\packages\companion\dist\cli.js
```

Imprime el puerto (4519) y el token. Crea `.froede-token` (añadirlo a `.gitignore`).

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
3. "Toggle edit mode in this tab" -> clic en un texto -> editar -> Enter.
4. El cambio queda guardado en el archivo fuente real (en React lo verás vía HMR sin recargar).

**Límites v0.1:** solo texto plano visible (elementos sin hijos anidados); en React no se editan `{expresiones}` ni componentes sin `data-froede-loc`. Deshacer = `git diff` / `git checkout`.

---

## Prompt listo para pegar en la sesión de IA de tu proyecto

> Instala froede en este proyecto para poder editar textos visualmente desde el navegador. froede vive en `C:\proyectos\froede` (monorepo pnpm ya compilado). Haz esto:
> 1. Si este proyecto usa Vite+React: en `vite.config.ts` importa el plugin con `import froede from "<ruta relativa desde este proyecto a C:/proyectos/froede/packages/vite-plugin/dist/index.js>"` y añade `froede()` como PRIMER plugin del array, antes de `react()`. Reinicia el dev server.
> 2. Arranca el companion en una terminal aparte con el cwd en la RAÍZ de este proyecto: `node C:\proyectos\froede\packages\companion\dist\cli.js`. Déjalo corriendo y dime el puerto y el token que imprime.
> 3. Añade `.froede-token` al `.gitignore` de este proyecto.
> 4. No toques nada más; froede no necesita más configuración.
