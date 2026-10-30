import { expect, type Page } from '@playwright/test'
import { clean, lifecycle, mounted, nextLoad, open, pick, test, tomSelects, turboMajor, unmounted } from './helpers'

/*
 * A [data-turbo-permanent] element: Turbo keeps it from one render to the next, the widgets inside must stay mounted,
 * with their state. Its player holds a Tom Select and a decorated widget.
 */

async function sorted(list: Promise<string[]>): Promise<string[]> {
    return (await list).sort()
}

// The player kept its widgets mounted, once, with the value picked
async function expectPlayerKept(page: Page, value = 'two'): Promise<void> {
    await expect(page.locator('#player-choice')).toHaveValue(value)
    await expect(page.locator('#player-text .badge')).toHaveCount(1)
    expect(await lifecycle(page)).toEqual(clean)
    expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['player-choice'] })
    expect(await unmounted(page)).not.toContain('player-choice')
    expect(await mounted(page)).not.toContain('player-choice')
}

for (const query of ['', '?morphMutations']) {
    test.describe(`a [data-turbo-permanent] element${query && ', with morphMutations'}`, () => {
        test('keeps its widgets mounted across a visit', async ({ page }) => {
            await open(page, `/permanent/a${query}`)
            await pick(page, 'player-choice', 'two')
            await page.evaluate(() => window.e2eLog.splice(0))
            await page.click('#to-b')

            await expect(page).toHaveURL('/permanent/b')
            await expect.poll(() => mounted(page)).toContain('page-b')
            await expectPlayerKept(page)
            expect(await sorted(unmounted(page))).toEqual(['page-a', 'section-text'])
            expect(await sorted(mounted(page))).toEqual(['page-b', 'section-text'])
        })

        test('keeps its widgets mounted when Back restores the page from the cache', async ({ page }) => {
            await open(page, `/permanent/a${query}`)
            await page.click('#to-b')
            await expect.poll(() => mounted(page)).toContain('page-b')
            await pick(page, 'player-choice', 'two')
            await page.evaluate(() => window.e2eLog.splice(0))
            await page.goBack()

            await expect(page).toHaveURL(/\/permanent\/a/)
            await expect.poll(() => mounted(page)).toContain('page-a')
            await expectPlayerKept(page)
            expect(await sorted(unmounted(page))).toEqual(['page-b', 'section-text'])
        })

        test('keeps its widgets mounted on a visit previewed from the cache', async ({ page }) => {
            await open(page, `/permanent/a${query}`)
            await pick(page, 'player-choice', 'two')
            await page.click('#to-b')
            await expect.poll(() => mounted(page)).toContain('page-b')
            await page.evaluate(() => window.e2eLog.splice(0))
            await nextLoad(page, () => page.click('#to-a'))

            await expect(page).toHaveURL('/permanent/a')
            await expect.poll(() => mounted(page)).toContain('page-a')
            await expectPlayerKept(page)
        })

        test('unmounts it on a page without it, and mounts its cached copy once on Back', async ({ page }) => {
            await open(page, `/permanent/a${query}`)
            await pick(page, 'player-choice', 'two')
            await page.click('#to-c')

            await expect(page).toHaveURL('/permanent/c')
            await expect.poll(() => mounted(page)).toContain('page-c')
            expect(await unmounted(page)).toEqual(expect.arrayContaining(['player-text', 'player-choice']))
            expect(await lifecycle(page)).toEqual(clean)
            expect(await tomSelects(page)).toEqual({ wrappers: 0, live: [] })
            await page.goBack()

            await expect(page).toHaveURL(/\/permanent\/a/)
            await expect.poll(() => mounted(page)).toContain('player-choice')
            await expect(page.locator('#player-text .badge')).toHaveCount(1)
            expect(await lifecycle(page)).toEqual(clean)
            expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['player-choice'] })
            await pick(page, 'player-choice', 'two')
        })

        test('keeps its widgets mounted when a stream replaces the section around it', async ({ page }) => {
            await open(page, `/permanent/a${query}`)
            await pick(page, 'player-choice', 'two')
            await page.evaluate(() => window.e2eLog.splice(0))
            await page.click('#permanent-stream button')

            await expect(page.locator('#section-text')).toHaveText('Section 1')
            await expectPlayerKept(page)
            expect(await unmounted(page)).toEqual(['section-text'])
            expect(await mounted(page)).toEqual(['section-text'])
        })

        test('keeps its widgets mounted across a frame navigation', async ({ page }) => {
            await open(page, `/permanent/frame${query}`)
            await pick(page, 'player-choice', 'two')
            await page.evaluate(() => window.e2eLog.splice(0))
            await page.click('#frame-next')

            await expect.poll(() => mounted(page)).toContain('frame-next-page')
            await expectPlayerKept(page)
            expect(await mounted(page)).toEqual(['frame-next-page'])
        })

        test('keeps its widgets mounted across a morph refresh', async ({ page }) => {
            test.skip(turboMajor < 8, 'morphing needs Turbo 8')

            await open(page, `/permanent/a?morph${query.replace('?', '&')}`)
            await pick(page, 'player-choice', 'two')
            await page.evaluate(() => window.e2eLog.splice(0))
            await nextLoad(page, () => page.click('#permanent-increment button'))

            await expect(page.locator('#permanent-count')).toHaveText('Count 1')
            await expectPlayerKept(page)
        })
    })
}
