# Prompt para abrir una sesión dedicada a froede

Esta sesión de Claude Code se abrió en `C:\proyectos\Layco`, así que la memoria persistente que fue acumulando todo el contexto de froede vive en el espacio de memoria de Layco, no en el de froede. Si abres una sesión nueva con directorio de trabajo `C:\proyectos\froede`, esa sesión NO va a heredar esa memoria automáticamente (cada proyecto tiene su propio espacio). Este archivo es el punto de partida para esos casos: pégalo como primer mensaje.

```
Trabajamos en froede (front+edit+code), C:\proyectos\froede, repo github.com/Mun1to/froede - toolkit OSS (MIT) para editar el código de una web/app corriendo en localhost haciendo clic, sin sandbox ni agente de IA de por medio. Antes de nada, lee AGENTS.md (reglas del repo) y docs/METAS.md (roadmap y estado). Si vas a tocar algo de la Chrome Web Store también lee docs/PUBLICAR-WEBSTORE.md y docs/FICHA_CHROME_STORE.md. Corre `git log --oneline -10` y `git status` para confirmar el estado real antes de asumir nada de lo que te cuente aquí - esto puede quedar desactualizado.

Convenciones: inglés en README/commits/UI, español en docs internos (AGENTS.md, docs/*.md); pnpm siempre, nunca npm directo; sin Co-Authored-By en commits; push a este repo está autorizado por defecto (no en otros repos); sin raya em en texto público.
```

## Por qué existe este archivo

La arquitectura del proyecto es: froede es 100% código abierto a propósito (es una pieza de portafolio y su argumento de venta es "sin intermediario, auditable"). No hay nada sensible que proteger detrás de un repo privado - verificado el 2026-07-18 (sin tokens, rutas personales ni secretos en el historial de git). Lo único que hay que llevar de una sesión a otra es contexto de dónde vamos, y eso es justo lo que falla al cambiar el directorio de trabajo. Con AGENTS.md + METAS.md + este prompt, una sesión nueva rooteada en froede queda al día sin depender de la memoria de Layco.
