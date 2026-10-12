import type { Config } from 'jest';

const transform = { '^.+\\.(t|j)s$': 'ts-jest' };
const base = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform,
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};

const config: Config = {
  rootDir: '.',
  // Cobertura do serviço inteiro (spec §7.2). As exclusões são as mesmas do sonar-project.properties.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/tracing.ts',
    '!src/**/*.module.ts',
    '!src/**/dto/**',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
  coverageDirectory: './coverage',
  coverageReporters: ['text-summary', 'lcov', 'clover'],
  projects: [
    { ...base, displayName: 'unit', testRegex: 'src/.*\\.spec\\.ts$' },
    {
      ...base,
      displayName: 'integration',
      testRegex: 'test/integration/.*\\.int-spec\\.ts$',
      globalSetup: '<rootDir>/test/global-setup.ts',
    },
    {
      ...base,
      displayName: 'e2e',
      testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
      globalSetup: '<rootDir>/test/global-setup.ts',
    },
  ],
};

export default config;
