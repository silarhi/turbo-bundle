import { readFileSync } from 'node:fs'
import { test as base, expect, type Page } from '@playwright/test'

/*
 * The E2E application of tests/E2E: each [data-widget] element logs its mounts and unmounts in window.e2eLog, a
 * [data-decorate] one gets a .badge while it is mounted, and a <select data-tomselect> a Tom Select.
 */

declare global {
    interface Window {
        e2eLog: string[]
        e2eHistory: string[]
    }

    interface HTMLSelectElement {
        tomselect?: { wrapper: Element; e2eMark?: string; open: () => void }
    }
}

const turbo: { version: string } = JSON.parse(
    readFileSync(new URL('../node_modules/@hotwired/turbo/package.json', import.meta.url), 'utf8')
)
export const turboMajor: number = Number(turbo.version.split('.')[0])

/** Fails the test on an uncaught error of the page, such as a Tom Select initialized twice */
export const test: typeof base = base.extend<{ pageErrors: string[] }>({
    pageErrors: [
        async ({ page }, use) => {
            const errors: string[] = []
            page.on('pageerror', (error) => errors.push(error.message))
            await use(errors)
            expect(errors).toEqual([])
        },
        { auto: true },
    ],
})

/** The widgets mounted since the last reset, in order */
export async function mounted(page: Page): Promise<string[]> {
    const log = await page.evaluate(() => window.e2eLog)

    return log.filter((entry) => entry.startsWith('mount ')).map((entry) => entry.slice('mount '.length))
}

/** The widgets unmounted since the last reset, each once and sorted: a Drive visit unmounts the page twice */
export async function unmounted(page: Page): Promise<string[]> {
    const log = await page.evaluate(() => window.e2eLog)

    return [
        ...new Set(log.filter((entry) => entry.startsWith('unmount ')).map((entry) => entry.slice('unmount '.length))),
    ].sort()
}

export async function reset(page: Page): Promise<void> {
    await page.evaluate(() => window.e2eLog.splice(0))
}

export async function open(page: Page, url: string): Promise<void> {
    await page.goto(url)
    await expect.poll(() => mounted(page)).not.toEqual([])
    await reset(page)
}

/**
 * Replays every mount and unmount since the page loaded: the widgets mounted again while still mounted, the ones that
 * left the page without their cleanup, and the ones in the page that aren't mounted. All empty when the lifecycle holds.
 * A second unmount doesn't count: a Drive visit unmounts the page twice.
 */
export interface Lifecycle {
    doubled: string[]
    leaked: string[]
    missing: string[]
}

export async function lifecycle(page: Page): Promise<Lifecycle> {
    return page.evaluate(() => {
        const live = new Set<string>()
        const doubled: string[] = []
        for (const entry of window.e2eHistory) {
            const [action, id] = entry.split(' ')
            if (action === 'unmount') {
                live.delete(id)
            } else if (live.has(id)) {
                doubled.push(id)
            } else {
                live.add(id)
            }
        }
        const inPage = [...document.querySelectorAll('[data-widget]')].map((widget) => widget.id)

        return {
            doubled,
            leaked: [...live].filter((id) => !inPage.includes(id)).sort(),
            missing: inPage.filter((id) => !live.has(id)).sort(),
        }
    })
}

/** Waits for the next turbo:load, after the action that starts the visit */
export async function nextLoad(page: Page, action: () => Promise<void>): Promise<void> {
    const loaded = page.evaluate(
        () => new Promise((resolve) => document.addEventListener('turbo:load', resolve, { once: true }))
    )
    await action()
    await loaded
}

export const clean: Lifecycle = { doubled: [], leaked: [], missing: [] }

/**
 * The Tom Select markup in the page, and the selects whose instance is alive (its markup in the page): a copy restored
 * from a snapshot or kept by a render shows up as a wrapper without a live select.
 */
export async function tomSelects(page: Page): Promise<{ wrappers: number; live: string[] }> {
    return page.evaluate(() => ({
        wrappers: document.querySelectorAll('.ts-wrapper').length,
        live: [...document.querySelectorAll<HTMLSelectElement>('select[data-tomselect]')]
            .filter((select) => select.tomselect?.wrapper.isConnected)
            .map((select) => select.id),
    }))
}

/** Picks an option through the Tom Select UI, as a visitor would */
export async function pick(page: Page, selectId: string, value: string): Promise<void> {
    // Tom Select inserts its wrapper right after the <select> it hides
    await page.click(`#${selectId} + .ts-wrapper .ts-control`)
    await page.click(`#${selectId}-ts-dropdown [data-value="${value}"]`)
    await expect(page.locator(`#${selectId}`)).toHaveValue(value)
}
