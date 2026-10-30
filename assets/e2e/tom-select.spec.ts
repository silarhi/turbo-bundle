import { expect, type Page } from '@playwright/test'
import { mounted, open, pick, test, tomSelects, turboMajor } from './helpers'

/*
 * Tom Select, a third-party widget that hides its <select> and inserts its own markup next to it, across the snapshot
 * cache and morph refreshes: it must come back once, and working.
 */

test('a list restored from the cache gets its Tom Select once', async ({ page }) => {
    await open(page, '/list')
    await page.click('#to-second')
    await expect(page).toHaveURL('/second')
    await page.goBack()

    await expect(page).toHaveURL('/list')
    await expect.poll(() => tomSelects(page)).toEqual({ wrappers: 1, live: ['status'] })
    await pick(page, 'status', 'closed')
})

test('a list previewed from the cache, then rendered, gets its Tom Select once', async ({ page }) => {
    await open(page, '/list')
    await page.click('#to-second')
    await expect(page).toHaveURL('/second')
    await page.evaluate(() => window.e2eLog.splice(0))
    // A visit to a cached page: Turbo renders the snapshot as a preview, then the response
    await page.click('#to-list')

    await expect(page).toHaveURL('/list')
    await expect.poll(() => mounted(page)).toContain('status')
    await expect.poll(() => tomSelects(page)).toEqual({ wrappers: 1, live: ['status'] })
    expect((await mounted(page)).filter((id) => id === 'status')).toHaveLength(1)
})

test.describe('a morph refresh', () => {
    test.skip(turboMajor < 8, 'morphing needs Turbo 8')

    async function refresh(page: Page, url: string): Promise<void> {
        await open(page, url)
        const loaded = page.evaluate(
            () => new Promise((resolve) => document.addEventListener('turbo:load', resolve, { once: true }))
        )
        await page.click('#increment button')
        await loaded
        await expect(page.locator('#counter')).toHaveText('Count 1')
    }

    // The server selects "two" after the refresh
    test('keeps one working Tom Select, with the value of the server', async ({ page }) => {
        await refresh(page, '/morph-select')

        expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['choice'] })
        await expect(page.locator('#choice')).toHaveValue('two')
        await pick(page, 'choice', 'one')
    })

    test('keeps one working Tom Select, with the value of the server, with morphMutations', async ({ page }) => {
        await refresh(page, '/morph-select?morphMutations')

        expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['choice'] })
        await expect(page.locator('#choice')).toHaveValue('two')
        await pick(page, 'choice', 'one')
    })
})
