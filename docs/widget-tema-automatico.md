# Widget: tema automático (claro / oscuro)

Con **Tema → Automático** en el panel (Estudio del widget → Apariencia), el widget sigue el modo
claro u oscuro de la web o app donde está incrustado y cambia **en vivo**, sin recargar y sin
cerrar la conversación. Los widgets con tema Claro u Oscuro fijo no cambian nunca.

## Cómo decide el tema

Por orden de prioridad:

1. **Lo que diga la app** con `AgentFlowhub.setTheme(...)` (lo más fiable).
2. **Señales de la página**, en `<html>` o `<body>`:
   - clase `dark`, `dark-mode`, `theme-dark` o `dark-theme` (y sus equivalentes `light…`);
   - atributo `data-theme`, `data-bs-theme` (Bootstrap 5.3), `data-mode`, `data-color-scheme`
     o `data-color-mode` con un valor que contenga `dark` / `light`;
   - `color-scheme: dark` / `light` en `<html>` (`light dark` no cuenta: decide el sistema).
3. **El modo del sistema** del dispositivo (`prefers-color-scheme`).

Si la app ya usa una de las señales del punto 2, no hay que hacer nada.

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
