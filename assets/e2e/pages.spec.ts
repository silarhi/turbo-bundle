import { expect } from '@playwright/test'
import { clean, lifecycle, mounted, open, test, tomSelects, turboMajor } from './helpers'

/*
 * The other ways a page comes to the screen: cache control, frames loaded from their src, _top,
 * prefetched links and view transitions.
 */

test('Back to a no-cache page loads it once from the server', async ({ page }) => {
    await open(page, '/cache-control/no-cache')
    await page.click('#to-second')
    await expect(page).toHaveURL('/second')
    await page.goBack()

    await expect(page).toHaveURL('/cache-control/no-cache')
    await expect.poll(() => mounted(page)).toContain('cached-choice')
    await expect(page.locator('#cached .badge')).toHaveCount(1)
    expect(await lifecycle(page)).toEqual(clean)
    expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['cached-choice'] })
})

test('a visit to a no-preview page renders it once', async ({ page }) => {
    await open(page, '/cache-control/no-preview')
    await page.click('#to-second')
    await expect(page).toHaveURL('/second')
    await page.evaluate(() => window.e2eLog.splice(0))
    await page.click('#to-list')
    await expect(page).toHaveURL('/list')
    await page.evaluate(() =>
        (window as unknown as { Turbo: { visit(url: string): void } }).Turbo.visit('/cache-control/no-preview')
    )

    await expect(page).toHaveURL('/cache-control/no-preview')
    await expect.poll(() => mounted(page)).toContain('cached-choice')
    await expect(page.locator('#cached .badge')).toHaveCount(1)
    expect(await lifecycle(page)).toEqual(clean)
    expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['cached-choice'] })
})

test.describe('a frame loaded from its src', () => {
    test('is mounted once on the first page', async ({ page }) => {
        await page.goto('/frames')

        await expect.poll(() => mounted(page)).toContain('eager-choice')
        await expect(page.locator('#eager-content .badge')).toHaveCount(1)
        expect(await lifecycle(page)).toEqual(clean)
        expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['eager-choice'] })
    })

    test('is mounted once when it loads before the page does', async ({ page }) => {
        // An image holds the load event of the page, when Turbo fires its first turbo:load, after the frame rendered
        let release: () => void = () => {}
        const held = new Promise<void>((resolve) => {
            release = resolve
        })
        await page.route('**/slow.png', async (route) => {
            await held
            await route.fulfill({ status: 404 })
        })
        await page.goto('/frames?slow', { waitUntil: 'commit' })
        await expect(page.locator('#eager-content')).toBeVisible()
        const loaded = page.waitForEvent('load')
        release()
        await loaded

        await expect.poll(() => mounted(page)).toContain('frames')
        await expect(page.locator('#eager-content .badge')).toHaveCount(1)
        expect(await lifecycle(page)).toEqual(clean)
        expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['eager-choice'] })
    })

    test('is mounted once when it is lazy, once scrolled into view', async ({ page }) => {
        await open(page, '/frames')
        await page.locator('#lazy').scrollIntoViewIfNeeded()

        await expect.poll(() => mounted(page)).toContain('lazy-content')
        await expect(page.locator('#lazy-content .badge')).toHaveCount(1)
        expect(await lifecycle(page)).toEqual(clean)
    })

    test('is mounted once when Back restores the page from the cache', async ({ page }) => {
        await page.goto('/frames')
        await expect.poll(() => mounted(page)).toContain('eager-choice')
        await page.click('#to-second')
        await expect(page).toHaveURL('/second')
        await page.goBack()

        await expect(page).toHaveURL('/frames')
        await expect.poll(() => mounted(page)).toContain('frames')
        await expect(page.locator('#eager-content .badge')).toHaveCount(1)
        expect(await lifecycle(page)).toEqual(clean)
        expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['eager-choice'] })
    })
})

test('a stream in the page is mounted once', async ({ page }) => {
    await page.goto('/inline-stream')

    await expect.poll(() => mounted(page)).toContain('inline-item')
    await expect(page.locator('#inline-item .badge')).toHaveCount(1)
    expect(await lifecycle(page)).toEqual(clean)
})

test('a link in a frame targeting _top visits the page', async ({ page }) => {
    await open(page, '/')
    await page.click('#frame-top')

    await expect(page).toHaveURL('/second')
    await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
    expect(await lifecycle(page)).toEqual(clean)
})

test.describe('a prefetched link', () => {
    test.skip(turboMajor < 8, 'prefetching needs Turbo 8')

    test('visits the page it prefetched once', async ({ page }) => {
        await open(page, '/')
        const prefetch = page.waitForRequest(
            (request) => request.url().endsWith('/second') && request.headers()['x-sec-purpose'] === 'prefetch'
        )
        await page.hover('#to-second')
        await prefetch
        await page.click('#to-second')

        await expect(page).toHaveURL('/second')
        await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
        expect(await lifecycle(page)).toEqual(clean)
    })
})

test('a view transition renders each page once', async ({ page }) => {
    await open(page, '/transition/a')
    await page.click('#to-b')
    await expect(page).toHaveURL('/transition/b')
    await expect.poll(() => mounted(page)).toContain('transition-b')
    expect(await lifecycle(page)).toEqual(clean)
    await page.goBack()

    await expect(page).toHaveURL('/transition/a')
    await expect.poll(() => mounted(page)).toContain('transition-a')
    await expect(page.locator('#transition-a .badge')).toHaveCount(1)
    expect(await lifecycle(page)).toEqual(clean)
    expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['transition-choice'] })
})
