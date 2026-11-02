# Widget: tema automático (claro / oscuro)

Con **Tema → Automático** en el panel (Estudio del widget → Apariencia), el widget sigue el modo
claro u oscuro de la web o app donde está incrustado y cambia **en vivo**, sin recargar y sin
cerrar la conversación. Los widgets con tema Claro u Oscuro fijo no cambian nunca.

## Cómo decide el tema

Por orden de prioridad:

1. **Lo que diga la app** con `AgentFlowhub.setTheme(...)` (lo más fiable).
2. **Señales de la página**, en `<html>` o `<body>`:
   - clase `dark`, `dark-mode`, `theme-dark`, `dark-theme`, `oscuro`, `modo-oscuro`, `tema-oscuro`
     (y sus equivalentes claros);
   - cualquier atributo `data-…` cuyo nombre contenga *theme, tema, mode, modo* o *scheme*
     (`data-theme`, `data-bs-theme`, `data-color-mode`, `data-tema-ui`…) con un valor que diga
     `dark` / `oscuro` / `night` o `light` / `claro` / `day`. Ejemplo real: la plataforma de Tribu
     usa `<html data-tema-ui="oscuro">` y el widget la sigue sin tocar nada;
   - `color-scheme: dark` / `light` en `<html>` (`light dark` no cuenta: decide el sistema).
3. **El modo del sistema** del dispositivo (`prefers-color-scheme`).

Si la app ya usa una de las señales del punto 2, no hay que hacer nada.

## Piel personalizada y tema automático

Con tema Automático, los colores **de superficie** de la piel (fondo del chat, pie, caja de
escribir y burbuja del bot, con sus textos) solo se aplican en el modo que encajan: unos oscuros
solo en oscuro y unos claros solo en claro. En el otro modo se usan los del tema base. Los colores
**de marca** (cabecera, botón de enviar, burbuja del usuario, botón flotante), la fuente, los
tamaños y las opciones de ocultar se aplican siempre. Con tema fijo la piel se aplica tal cual.

## Si la app usa otro mecanismo

Llamar a `setTheme` cada vez que el usuario cambie de modo (se puede llamar antes de que el widget
termine de cargar):

```html
<script>
  // al aplicar el modo oscuro de la app
  window.AgentFlowhub.setTheme('dark');
  // al aplicar el modo claro
  window.AgentFlowhub.setTheme('light');
  // devolver el control a las señales de la página / sistema
  window.AgentFlowhub.setTheme('auto');
</script>
```

`getState()` de la instancia devuelve `theme` (efectivo: `light` | `dark`) y `themePreference`
(`light` | `dark` | `auto`).

## Sin panel (embed con atributos)

`<script src="https://botiva.space/widget.js" data-theme="auto" …></script>` o
`AgentFlowhub.init({ token, host, theme: 'auto' })`. Si el widget tiene token, manda el tema
guardado en el panel.
