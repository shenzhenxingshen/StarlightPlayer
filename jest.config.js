module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/__tests__/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-track-player|react-native-mmkv|react-native-vector-icons|react-native-gesture-handler|react-native-safe-area-context|react-native-screens)/)',
  ],
  testMatch: ['<rootDir>/__tests__/**/*.(spec|test).(ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/(mocks|setup|jest.setup)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/constants/**',
  ],
  coverageThreshold: {
    global: { lines: 50, statements: 50, functions: 40, branches: 30 },
  },
};
