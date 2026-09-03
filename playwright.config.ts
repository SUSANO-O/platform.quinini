import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright — solo tests VISUALES (regresión de screenshots) de páginas públicas.
 * Los tests unitarios siguen en vitest (`npm run test`). Ver docs/VISUAL-TESTING.md.
 *
 * Local: reusa el stack ya levantado en :3201 (`../scripts/botiva-local-up.sh`).
 * Si no hay nada corriendo, arranca `npm run dev`.
 */
const PORT = 3201;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Aísla de los *.test.ts de vitest (viven en src/).
  testMatch: /.*\.spec\.ts$/,
  // Serializado: `next dev` compila rutas on-demand y bajo carga paralela devuelve
  // 500 intermitentes. 1 worker = 1 ruta a la vez = estable. Para CI, usar un
  // build de prod (`next build && next start`) y subir workers.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 2,
  workers: 1,
  // Sube del default (30s): en dev, compilar una ruta pesada + reintentos ante
  // 500 puede pasarse. Con build de prod bajaría a 30s.
  timeout: 120_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // Tolerancia para antialiasing de fuentes entre máquinas. Un cambio real de
  // layout supera esto de sobra.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
