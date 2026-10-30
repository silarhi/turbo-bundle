import { expect } from '@playwright/test'
import { mounted, open, pick, test, tomSelects, unmounted } from './helpers'

/*
 * Forms answered with a 422 when the name is empty (/form): a Drive form, a form in a frame, and a form answered with
 * a Turbo Stream. Each has a Tom Select, which must come back once, and working.
 */

const allSelects = { wrappers: 3, live: ['kind', 'editor-kind', 'stream-kind'] }

test('a 422 renders the form with its errors, its widgets mounted once', async ({ page }) => {
    await open(page, '/form')
    await page.click('#drive-form button')

    await expect(page.locator('#error')).toBeVisible()
    await expect(page).toHaveURL('/form')
    await expect.poll(() => mounted(page)).toEqual(['error', 'kind', 'editor-kind', 'stream-kind'])
    expect(await unmounted(page)).toEqual(['editor-kind', 'kind', 'stream-kind'])
    expect(await tomSelects(page)).toEqual(allSelects)
})

test('a valid submission after a 422 visits the page it redirects to', async ({ page }) => {
    await open(page, '/form')
    await page.click('#drive-form button')
    await expect(page.locator('#error')).toBeVisible()
    await page.evaluate(() => window.e2eLog.splice(0))

    await page.fill('#name', 'Ann')
    await pick(page, 'kind', 'b')
    await page.click('#drive-form button')

    await expect(page).toHaveURL('/second')
    await expect.poll(() => mounted(page)).toEqual(['second', 'followed'])
    expect(await unmounted(page)).toEqual(['editor-kind', 'error', 'kind', 'stream-kind'])
})

test('a 422 in a frame re-renders the frame only', async ({ page }) => {
    await open(page, '/form')
    await page.click('#editor-form button')

    await expect(page.locator('#editor-error')).toBeVisible()
    await expect.poll(() => mounted(page)).toEqual(['editor-error', 'editor-kind'])
    expect(await unmounted(page)).toEqual(['editor-kind'])
    expect(await tomSelects(page)).toEqual(allSelects)
})

test('a valid submission in a frame after a 422 visits the page it redirects to', async ({ page }) => {
    await open(page, '/form')
    await page.click('#editor-form button')
    await expect(page.locator('#editor-error')).toBeVisible()

    await page.fill('#editor-name', 'Ann')
    await page.click('#editor-form button')

    await expect(page).toHaveURL('/editor/saved')
    await expect(page.locator('#saved')).toBeVisible()
    await expect.poll(() => mounted(page)).toContain('saved')
})

test('a 422 answered with a Turbo Stream re-renders the form in place', async ({ page }) => {
    await open(page, '/form')
    await page.click('#stream-form button')

    await expect(page.locator('#stream-error')).toBeVisible()
    await expect.poll(() => mounted(page)).toEqual(['stream-error', 'stream-kind'])
    expect(await unmounted(page)).toEqual(['stream-kind'])
    expect(await tomSelects(page)).toEqual(allSelects)
    await pick(page, 'stream-kind', 'b')
})
