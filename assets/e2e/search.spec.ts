import { expect, type Page } from '@playwright/test'
import { mounted, open, pick, test, tomSelects, unmounted } from './helpers'

/*
 * A list filtered by a search form outside its results frame (/list): the form targets the frame with
 * data-turbo-action="advance", as the pagination inside it does. The filters keep their Tom Select, and their state.
 */

const firstPage = ['row-1-1', 'row-1-2', 'summary']

async function search(page: Page): Promise<void> {
    await open(page, '/list')
    await pick(page, 'status', 'open')
    await page.evaluate(() => {
        const select = document.getElementById('status') as HTMLSelectElement
        if (select.tomselect) {
            select.tomselect.e2eMark = 'before the search'
        }
    })
    await page.fill('#q', 'foo')
    await page.click('#search button')
    await expect(page.locator('#summary')).toContainText('Results for "foo", status "open", page 1')
    // The results render first, turbo:frame-load mounts them after
    await expect.poll(() => mounted(page)).toEqual(['summary', 'row-1-1', 'row-1-2'])
}

test('a search re-mounts the results frame only, and advances the URL', async ({ page }) => {
    await search(page)

    await expect(page).toHaveURL('/list?q=foo&status=open')
    expect(await unmounted(page)).toEqual(firstPage)
    // The filter kept its Tom Select instance, and the value picked
    expect(await page.evaluate(() => (document.getElementById('status') as HTMLSelectElement).tomselect?.e2eMark)).toBe(
        'before the search'
    )
    expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['status'] })
    await expect(page.locator('#summary .badge')).toHaveCount(1)
})

test('a page link in the results frame advances the URL too', async ({ page }) => {
    await search(page)
    await page.evaluate(() => window.e2eLog.splice(0))
    await page.click('#next')

    await expect(page).toHaveURL('/list?q=foo&status=open&page=2')
    await expect.poll(() => mounted(page)).toEqual(['summary', 'row-2-1', 'row-2-2'])
    expect(await unmounted(page)).toEqual(firstPage)
    expect(await tomSelects(page)).toEqual({ wrappers: 1, live: ['status'] })
})

test('Back after a search restores the list, its widgets mounted once', async ({ page }) => {
    await search(page)
    await page.goBack()

    await expect(page).toHaveURL('/list')
    await expect(page.locator('#summary')).toContainText('Results for "", status "", page 1')
    await expect.poll(() => tomSelects(page)).toEqual({ wrappers: 1, live: ['status'] })
    await expect(page.locator('#summary .badge')).toHaveCount(1)
})

test('Back after two searches restores the first one, its widgets mounted once', async ({ page }) => {
    await search(page)
    await page.evaluate(() => window.e2eLog.splice(0))
    await page.click('#next')
    await expect(page).toHaveURL('/list?q=foo&status=open&page=2')
    // Back once page 2 is mounted: earlier, Turbo cancels it (hotwired/turbo#1579)
    await expect.poll(() => mounted(page)).toEqual(['summary', 'row-2-1', 'row-2-2'])
    await page.goBack()

    await expect(page).toHaveURL('/list?q=foo&status=open')
    await expect(page.locator('#summary')).toContainText('page 1')
    await expect.poll(() => tomSelects(page)).toEqual({ wrappers: 1, live: ['status'] })
    await expect(page.locator('#summary .badge')).toHaveCount(1)
})
