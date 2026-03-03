import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        testTimeout: 30000,
        hookTimeout: 25000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary'],
            include: ['src/**/*.ts'],
            exclude: ['src/gateway/dashboard.ts'],
            thresholds: { branches: 55, functions: 55, lines: 55 },
        },
    },
});
