import { expect } from '@playwright/test'
import { clean, lifecycle, nextLoad, open, pick, test, tomSelects, turboMajor, unmounted } from './helpers'

/*
 * Every way Turbo 8 morphs the page, with and without morphMutations: what the morph adds, changes or removes must be
 * mounted, re-mounted or unmounted, once.
 */

test.skip(turboMajor < 8, 'morphing needs Turbo 8')

for (const query of ['', '?morphMutations']) {
    test.describe(query || 'without options', () => {
        test('a morph refresh removing a box unmounts its widgets, and mounts the box it adds', async ({ page }) => {
            await open(page, `/morph-list${query}`)
            await nextLoad(page, () => page.click('#increment button'))

            await expect(page.locator('#counter')).toHaveText('Count 1')
            expect(await unmounted(page)).toEqual(expect.arrayContaining(['old-choice', 'old-text']))
            expect(await lifecycle(page)).toEqual(clean)
            expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['new-choice'] })
            await pick(page, 'new-choice', 'two')
        })

        test('a refresh asked by a stream morphs the page', async ({ page }) => {
            await open(page, `/morph${query}`)
            await nextLoad(page, () => page.click('#refresh-stream button'))

            await expect(page.locator('#counter')).toHaveText('Count 1')
            await expect(page.locator('#decorated .badge')).toHaveCount(1)
            expect(await lifecycle(page)).toEqual(clean)
        })

        test('a frame with refresh="morph" is reloaded with a morph when the page refreshes', async ({ page }) => {
            await open(page, `/morph-frame${query}`)
            await expect(page.locator('#live-counter')).toContainText('Live 0')
            await nextLoad(page, () => page.click('#increment button'))

            await expect(page.locator('#live-counter')).toContainText('Live 1')
            await expect(page.locator('#live-counter .badge')).toHaveCount(1)
            expect(await lifecycle(page)).toEqual(clean)
            expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['live-choice'] })
            await pick(page, 'live-choice', 'two')
        })

        test('a frame with refresh="morph" reloaded on its own is morphed', async ({ page }) => {
            await open(page, `/morph-frame${query}`)
            await expect(page.locator('#live-counter')).toContainText('Live 0')
            await page.context().addCookies([{ name: 'count', value: '1', url: page.url() }])
            await page.evaluate(() => (document.getElementById('live') as HTMLElement & { reload(): void }).reload())

            await expect(page.locator('#live-counter')).toContainText('Live 1')
            await expect(page.locator('#live-counter .badge')).toHaveCount(1)
            expect(await lifecycle(page)).toEqual(clean)
            expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['live-choice'] })
        })

        for (const action of ['replace', 'update']) {
            test(`a stream ${action} with method="morph" re-mounts what it changes`, async ({ page }) => {
                await open(page, `/stream-morph${query}`)
                await page.click(`#morph-${action} button`)

                await expect(page.locator('#morph-text')).toContainText('Text 1')
                await expect(page.locator('#morph-text .badge')).toHaveCount(1)
                await expect(page.locator('#morph-choice')).toHaveValue('two')
                expect(await lifecycle(page)).toEqual(clean)
                expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['morph-choice'] })
                await pick(page, 'morph-choice', 'one')
            })
        }

        test('a stream replace with method="morph" targeting a widget re-mounts it, its siblings untouched', async ({
            page,
        }) => {
            await open(page, `/stream-morph${query}`)
            await page.click('#morph-select button')

            await expect(page.locator('#morph-choice')).toHaveValue('two')
            await expect(page.locator('#morph-after')).toBeVisible()
            await expect(page.locator('#morph-text .badge')).toHaveCount(1)
            expect(await unmounted(page)).toEqual(['morph-choice'])
            expect(await lifecycle(page)).toEqual(clean)
            expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['morph-choice'] })
            await pick(page, 'morph-choice', 'one')
        })
    })
}

test('a refresh asked by a stream on a page without morph replaces the body', async ({ page }) => {
    await open(page, '/morph?replace')
    await nextLoad(page, () => page.click('#refresh-stream button'))

    await expect(page.locator('#counter')).toHaveText('Count 1')
    await expect(page.locator('#decorated .badge')).toHaveCount(1)
    expect(await lifecycle(page)).toEqual(clean)
})
