import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'

/*
 * TurboHandler and TurboFrameListener against the real Turbo of node_modules (the CI runs them on Turbo 7.2 and 8), in
 * the E2E application of tests/E2E: each [data-widget] element logs its mounts and unmounts in window.e2eLog, and a
 * [data-decorate] one gets a .badge while it is mounted.
 */

declare global {
    interface Window {
        e2eLog: string[]
    }
}

const turbo: { version: string } = JSON.parse(
    readFileSync(new URL('../node_modules/@hotwired/turbo/package.json', import.meta.url), 'utf8')
)
const turboMajor = Number(turbo.version.split('.')[0])

/** The widgets mounted since the last reset, in order */
async function mounted(page: Page): Promise<string[]> {
    const log = await page.evaluate(() => window.e2eLog)

    return log.filter((entry) => entry.startsWith('mount ')).map((entry) => entry.slice('mount '.length))
}

/** The widgets unmounted since the last reset, each once and sorted: a Drive visit unmounts the page twice */
async function unmounted(page: Page): Promise<string[]> {
    const log = await page.evaluate(() => window.e2eLog)

    return [
        ...new Set(log.filter((entry) => entry.startsWith('unmount ')).map((entry) => entry.slice('unmount '.length))),
    ].sort()
}

async function open(page: Page, url: string): Promise<void> {
    await page.goto(url)
    await expect.poll(() => mounted(page)).not.toEqual([])
    await page.evaluate(() => window.e2eLog.splice(0))
}

test('the first page is mounted once', async ({ page }) => {
    await page.goto('/')

    await expect.poll(() => mounted(page)).toEqual(['home', 'frame-content', 'item'])
    await expect(page.locator('#home .badge')).toHaveCount(1)
})

test('a Drive visit unmounts the page, then mounts the new one', async ({ page }) => {
    await open(page, '/')
    await page.click('#to-second')

    await expect(page).toHaveURL('/second')
    await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
    expect(await unmounted(page)).toEqual(['frame-content', 'home', 'item'])
    await expect(page.locator('#second .badge')).toHaveCount(1)
})

test('a page restored from the cache is mounted once, from the markup of the server', async ({ page }) => {
    await open(page, '/')
    await page.click('#to-second')
    await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
    await page.evaluate(() => window.e2eLog.splice(0))
    await page.goBack()

    await expect(page).toHaveURL('/')
    await expect.poll(() => mounted(page)).toEqual(['home', 'frame-content', 'item'])
    // The snapshot was cached after the cleanup: no badge of the first visit came back with it
    await expect(page.locator('#home .badge')).toHaveCount(1)
    await expect(page.locator('#frame-content .badge')).toHaveCount(1)
})

test('a frame navigation re-mounts the frame only', async ({ page }) => {
    await open(page, '/')
    await page.click('#frame-link')

    await expect.poll(() => mounted(page)).toEqual(['frame-next'])
    expect(await unmounted(page)).toEqual(['frame-content'])
    await expect(page).toHaveURL('/')
    await expect(page.locator('#frame-next .badge')).toHaveCount(1)
})

test('a frame navigation promoted to a visit re-mounts the frame only', async ({ page }) => {
    await open(page, '/')
    await page.click('#frame-advance')

    await expect(page).toHaveURL('/frame/next')
    await expect.poll(() => mounted(page)).toEqual(['frame-next'])
    expect(await unmounted(page)).toEqual(['frame-content'])
    await expect(page.locator('#home .badge')).toHaveCount(1)
})

test('a redirect in a frame becomes a full visit', async ({ page }) => {
    await open(page, '/')
    const response = page.waitForResponse((response) => response.url().endsWith('/frame/redirect'))
    await page.click('#frame-redirect button')

    // TurboFrameListener turned the redirect into a Turbo-Location, TurboHandler visits it
    expect((await response).status()).toBe(204)
    expect((await response).headers()['turbo-location']).toBe('/second')
    await expect(page).toHaveURL('/second')
    await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
})

test('a redirect in a frame with data-turbo-follow-redirect stays in the frame', async ({ page }) => {
    await open(page, '/')
    const response = page.waitForResponse((response) => response.url().endsWith('/frame/redirect'))
    await page.click('#follow-redirect button')

    expect((await response).status()).toBe(302)
    await expect(page.locator('#followed')).toBeVisible()
    await expect.poll(() => mounted(page)).toEqual(['followed'])
    await expect(page).toHaveURL('/')
})

test('a DELETE redirect becomes a full visit, instead of a DELETE of its target', async ({ page }) => {
    await open(page, '/')
    const response = page.waitForResponse((response) => response.url().endsWith('/items/1'))
    await page.click('#delete')

    expect((await response).status()).toBe(204)
    await expect(page).toHaveURL('/second')
    await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
})

test('a stream mounts what it inserts, and unmounts what it removes', async ({ page }) => {
    await open(page, '/')
    await page.click('#stream-append button')

    await expect.poll(() => mounted(page)).toEqual(['streamed'])
    await expect(page.locator('#streamed .badge')).toHaveCount(1)

    await page.click('#stream-remove button')

    await expect(page.locator('#item')).toHaveCount(0)
    await expect.poll(() => unmounted(page)).toEqual(['item'])
})

test('a failed submission mounts the page it renders', async ({ page }) => {
    await open(page, '/')
    await page.click('#invalid-form button')

    await expect.poll(() => mounted(page)).toEqual(['invalid'])
    expect(await unmounted(page)).toEqual(['frame-content', 'home', 'item'])
    await expect(page.locator('#invalid .badge')).toHaveCount(1)
})

test('visitOnFrameMissing renders a response without the frame as a visit', async ({ page }) => {
    await open(page, '/?visitOnFrameMissing')
    await page.click('#frame-missing')

    await expect(page).toHaveURL('/second')
    await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
})

test('frameStreams runs the streams of a frame response outside the frame', async ({ page }) => {
    await open(page, '/?frameStreams')
    await page.click('#frame-streams')

    await expect(page.locator('#flashes #flash')).toBeVisible()
    await expect.poll(() => mounted(page)).toEqual(['frame-saved', 'flash'])
})

test.describe('morphMutations on a page refresh', () => {
    test.skip(turboMajor < 8, 'morphing needs Turbo 8')

    async function refresh(page: Page): Promise<void> {
        await open(page, '/morph?morphMutations')
        const loaded = page.evaluate(
            () => new Promise((resolve) => document.addEventListener('turbo:load', resolve, { once: true }))
        )
        await page.click('#increment button')
        await loaded
        await expect(page.locator('#counter')).toHaveText('Count 1')
    }

    // Turbo fires turbo:morph-element for every element the morph matched, the unchanged ones and <body> included
    test('re-mounts the elements it changes only', async ({ page }) => {
        await refresh(page)

        // #decorated changed too: the morph removed the badge its listener added, the re-mount brings it back
        expect(await mounted(page)).toEqual(['decorated', 'counter'])
        expect(await unmounted(page)).toEqual(['counter', 'decorated'])
        await expect(page.locator('#decorated .badge')).toHaveCount(1)
    })
})
