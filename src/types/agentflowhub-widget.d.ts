export {};

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void; showLauncher?: () => void; hideLauncher?: () => void } | void;
      showLauncher?: () => void;
      isLauncherHidden?: () => boolean;
      /** Modo de la app anfitriona; solo afecta a widgets con tema "auto" ('auto' devuelve el control a la página). */
      setTheme?: (theme: 'light' | 'dark' | 'auto') => void;
      version?: string;
    };
    __BIV?: {
      init?: (cfg: Record<string, unknown>) => { destroy?: () => void; show?: () => void; hide?: () => void; updatePagePath?: (path: string) => void } | void;
      show?: () => void;
      isHidden?: () => boolean;
      updatePagePath?: (path: string) => void;
      navigate?: (path: string) => Promise<boolean> | boolean | void;
      version?: string;
    };
  }
}
