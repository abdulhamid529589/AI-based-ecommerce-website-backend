export default {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['**/*.js', '!node_modules/**', '!__tests__/**'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
  testTimeout: 10000,
  detectOpenHandles: true,
  forceExit: true,
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
}
