import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 8098)

// Typed: isolatedDeclarations can't infer a default export
const config: PlaywrightTestConfig = defineConfig({
    testDir: 'e2e',
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        // The E2E application of the bundle, with the TurboHandler of dist/: `pnpm e2e` builds it first
        command: `php -S 127.0.0.1:${port} ../tests/E2E/router.php`,
        url: `http://127.0.0.1:${port}/e2e/turbo-handler.js`,
        reuseExistingServer: !process.env.CI,
        // php -S logs every connection on stderr
        stderr: 'ignore',
    },
})

export default config
