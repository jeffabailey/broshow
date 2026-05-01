export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'scripts/decisions.pure.mjs',
    'scripts/amo-jwt.pure.mjs',
  ],
  reporters: ['progress', 'clear-text', 'html'],
  thresholds: { high: 90, low: 80, break: 80 },
  coverageAnalysis: 'perTest',
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  cleanTempDir: 'always',
};
