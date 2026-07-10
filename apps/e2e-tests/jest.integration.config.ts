// Deliberately NOT named "jest.config.ts" — @nx/jest's plugin auto-infers a
// "test" target from that filename, and these tests need real infra
// (docker-compose), unlike every other project's unit tests. Kept out of
// `nx run-many -t test` on purpose; run via `nx run e2e-tests:integration`.
export default {
  displayName: 'e2e-tests',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['**/*.integration.spec.ts'],
  coverageDirectory: '../../coverage/apps/e2e-tests',
};
