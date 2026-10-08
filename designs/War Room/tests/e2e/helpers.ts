import type { APIRequestContext, Page } from '@playwright/test'

type Cow = {
  plan: { objects: Map<string, unknown>; assignments: Map<string, unknown>; ownership: Map<string, unknown>; nations: Map<string, unknown> }
}

/** Counts straight from the live Yjs doc (exposed on window in dev builds). */
export const counts = (page: Page) =>
  page.evaluate(() => {
    const { plan } = (window as unknown as { __cow: Cow }).__cow
    return { objects: plan.objects.size, planned: plan.assignments.size, owned: plan.ownership.size, nations: plan.nations.size }
  })

/** Delete a room a test created, so test rooms don't pile up in the lobby of the dev server. */
export const removeRoom = (request: APIRequestContext, id: string, ownerToken: string) =>
  request.delete(`/api/rooms/${id}`, { headers: { Authorization: `Bearer ${ownerToken}` } })

/** Same, for the room this page created through the lobby (its owner token is in the page's storage). */
export const removeOwnRoom = (page: Page) =>
  page.evaluate(async () => {
    const id = location.pathname.split('/').pop()!
    await fetch(`/api/rooms/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem(`cow-planner.owner.${id}`)}` } })
  })

/** Answer "Which nation do you play?". */
export async function joinAs(page: Page, nickname: string, nation: string) {
  await page.waitForSelector('dialog.join[open]')
  await page.fill('dialog.join input[autocomplete=nickname]', nickname)
  await page.selectOption('dialog.join select', nation)
  await page.click('dialog.join button[type=submit]')
}

/** Search a province, fly there and zoom out a little so neighbours are visible. */
export async function goToProvince(page: Page, name: string) {
  await page.keyboard.press('/')
  await page.keyboard.type(name)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  await page.mouse.move(588, 456)
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(300)
}
