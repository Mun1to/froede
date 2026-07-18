# Publicar en la Chrome Web Store - checklist

Ya está pagada la cuenta de desarrollador ($5, 2026-07-18). Esto es lo que ya dejé listo y lo que solo puedes hacer tú (subir archivos y enviar el formulario requiere tu cuenta de Google, y enviarlo a revisión es un paso público que te toca confirmar).

## Ya preparado

- **Logo nuevo** integrado: README (EN/ES), ícono de la extensión (16/32/48/128, regenerados a pantalla completa desde tu diseño en `docs/brand/froede_logo_png.png`). Extensión subida a versión `0.3.1` (antes 0.3.0, sin cambios de código - solo el ícono).
- **Política de privacidad**: [`PRIVACY.md`](../PRIVACY.md), enlazada desde el README. froede no recopila ningún dato, así que es una declaración simple y honesta.
- **Textos de la ficha** (nombre, resumen, descripción larga, propósito único, justificación de cada permiso, respuestas del formulario de prácticas de datos): todo listo para copiar y pegar en [`docs/FICHA_CHROME_STORE.md`](FICHA_CHROME_STORE.md).
- **Capturas de pantalla** a 1280x800 (tamaño exigido, antes eran 1000px de ancho): `docs/screenshots/hero.png`, `text-edit.png`, `panel-select.png`.
- **Zip de la extensión** listo para subir: `packages/extension/dist/` compilado y empaquetado (lo generé y subí también como asset de la release [v0.3.2](https://github.com/Mun1to/froede/releases/tag/v0.3.2) en GitHub, para que el Quickstart del README siga funcionando mientras la tienda no está publicada - de paso arreglé que la release "latest" se había quedado sin el .zip adjunto).

## Lo que te toca a ti

1. **Crear el elemento** en el [Developer Dashboard](https://chrome.google.com/webstore/devconsole) -> "Nuevo elemento" -> sube el zip. Puedes regenerarlo tú mismo con `pnpm --filter @froede/extension run build` y empaquetando la carpeta `packages/extension/dist/`.
2. **Rellenar la ficha** con los textos de `docs/FICHA_CHROME_STORE.md` (nombre, categoría, resumen, descripción, capturas).
3. **Pestaña de prácticas de privacidad**: propósito único, justificación de permisos y la URL de `PRIVACY.md` - todo está en el mismo documento.
4. **Avísame el ID de la extensión** en cuanto lo veas en el dashboard (aparece incluso en borrador, antes de publicar). Con eso puedo hacer un último ajuste de seguridad: hoy el companion acepta cualquier origen `chrome-extension://*`; en cuanto el ID sea estable puedo restringirlo a ese ID exacto, para que ninguna otra extensión pueda hacerse pasar por froede.
5. **Enviar a revisión** cuando lo tengas todo relleno - eso lo confirmas tú, no lo voy a mandar por ti.

Google suele tardar entre unas horas y unos días en revisar. Cuando esté publicada, actualizamos el README para que el Quickstart lleve directo al listado de la tienda en vez del .zip manual.
