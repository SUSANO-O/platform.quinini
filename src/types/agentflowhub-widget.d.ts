export {};

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void; showLauncher?: () => void } | void;
      showLauncher?: () => void;
      isLauncherHidden?: () => boolean;
      version?: string;
    };
  }
}
