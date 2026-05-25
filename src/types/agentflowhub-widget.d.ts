export {};

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void; showLauncher?: () => void; hideLauncher?: () => void } | void;
      showLauncher?: () => void;
      isLauncherHidden?: () => boolean;
      version?: string;
    };
    __BIV?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void; show?: () => void; hide?: () => void } | void;
      show?: () => void;
      isHidden?: () => boolean;
      version?: string;
    };
  }
}
