/** Cucumber — platform.quinini (landing) */
export default {
  default: {
    paths: ['features/**/*.feature'],
    import: [
      'features/support/world.mjs',
      'features/support/hooks.mjs',
      'features/step_definitions/**/*.mjs',
    ],
    format: ['progress-bar', 'html:reports/cucumber-report.html', 'json:reports/cucumber-report.json'],
    publishQuiet: true,
  },
}
