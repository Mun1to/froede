# ¿Es seguro froede? (edición en lenguaje llano)

froede edita archivos de tu ordenador, así que mereces saber exactamente qué puede hacer y qué no - en palabras normales, no solo en código. [English version](SECURITY.md).

## Qué corre de verdad, y dónde

| Pieza | Dónde vive | Qué puede hacer |
|---|---|---|
| Extensión de navegador | Tu navegador | Ve tus clics en páginas localhost. **No puede tocar tus archivos** - los navegadores lo prohíben, por diseño. |
| Companion (`npx froede`) | Una terminal, dentro de TU carpeta de proyecto | La única pieza que escribe archivos. Solo puede escribir **dentro** de la carpeta donde lo arrancaste - nunca fuera. |
| Plugin de Vite (opcional) | Tu dev server, solo mientras desarrollas | Añade una etiqueta invisible "este elemento viene del archivo X, línea Y" en dev. Nunca corre en builds de producción, nunca cambia tus archivos. |

Nada más. **Sin nube, sin cuenta, sin telemetría, sin IA.** Tu código nunca sale de tu máquina. Cierras la terminal del companion y froede está apagado del todo.

## Los cinco cerrojos

1. **Solo local.** El companion escucha en `127.0.0.1` - no existe para tu red, y menos para internet.
2. **Una web nunca puede conectarse.** Los navegadores marcan cada conexión con su origen; el companion solo acepta el ID de la propia extensión froede y rechaza todo lo demás. Ni una web maliciosa ni ninguna otra extensión instalada puede hablarle.
3. **Token de emparejamiento.** Un código secreto (guardado en `.froede-token`, gitignorado automáticamente) que pegas en la extensión una vez por proyecto. Sin él, nada puede pedirle al companion que escriba - ni siquiera otros programas de tu propio ordenador.
4. **Vallado a una carpeta.** El companion físicamente no puede escribir fuera de la carpeta del proyecto donde lo arrancaste. Los trucos con symlinks y rutas `../` se comprueban y se rechazan.
5. **Sin escrituras a ciegas.** Antes de cada edición, el companion relee el archivo y verifica que aún contiene lo que el navegador cree. Si algo cambió por debajo (editaste en tu IDE, otra herramienta lo tocó), la edición se aborta en vez de adivinar.

Raíles extra: las ediciones son un allowlist cerrado (texto plano, un conjunto fijo de propiedades de estilo, un conjunto fijo de atributos), los valores se escapan antes de tocar un archivo, y `href`/`src` rechazan de plano URLs tipo `javascript:` - froede nunca escribirá un vector de inyección de scripts en tu código, ni aunque se lo pidan.

## Lo que froede no puede hacer jamás

- Escribir fuera de la carpeta del proyecto donde lo arrancaste
- Correr cuando no lo has arrancado
- Enviar nada a ningún sitio (no hay servidor al que enviar)
- Editar código arbitrario: solo el texto, estilos y atributos del elemento que clicaste
- Saltarse git: cada cambio aterriza como una edición normal de archivo que ves con `git diff` y deshaces con `git checkout`

## Reportar una vulnerabilidad

Abre un issue en [github.com/Mun1to/froede/issues](https://github.com/Mun1to/froede/issues), o si es sensible, usa el "Report a vulnerability" privado de la pestaña Security de GitHub.

## Para los técnicamente curiosos

El modelo de amenazas completo (DNS rebinding, comparación de token en tiempo constante, confinamiento con realpath, el protocolo de guarda anti-deriva) está documentado en [docs/PROTOCOLO.md](docs/PROTOCOLO.md) y en el código - el companion son ~600 líneas de TypeScript legible en [`packages/companion/src`](packages/companion/src).
