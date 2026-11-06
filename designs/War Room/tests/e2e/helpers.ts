import type { APIRequestContext, Page } from '@playwright/test'

type Cow = {
  plan: { objects: Map<string, unknown>; assignments: Map<string, unknown>; ownership: Map<string, unknown>; players: Map<string, unknown> }
}

/** Counts straight from the live Yjs doc (exposed on window in dev builds). */
export const counts = (page: Page) =>
  page.evaluate(() => {
    const { plan } = (window as unknown as { __cow: Cow }).__cow
    return { objects: plan.objects.size, planned: plan.assignments.size, owned: plan.ownership.size, players: plan.players.size }
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

/**
 * Answer "Who are you?": sign up with a nation. Organizers (the room's creator, and
 * everyone in the offline plan) take it right away; others only ask for it.
 */
export async function joinAs(page: Page, nickname: string, nation: string) {
  await page.waitForSelector('dialog.join[open]')
  await page.fill('dialog.join input[autocomplete=nickname]', nickname)
  await page.click(`dialog.join .join-opt[data-nation="${nation}"]`)
  await page.click('dialog.join button[type=submit]')
  await page.waitForSelector('dialog.join[open]', { state: 'detached' })
}

/** Organizer shortcut for tests: seat a new player on a nation and put nations on teams (offline plan or own room). */
export const seat = (page: Page, nation: string, name: string, teams: Record<string, 'axis' | 'allies'> = {}) =>
  page.evaluate(
    ([nation, name, teams]) => {
      const { plan, lineup } = (window as unknown as { __cow: { plan: { doc: Doc; players: YMap }; lineup: { doc: Doc; slots: YMap } } }).__cow
      const id = `${name}-${Date.now()}`
      plan.doc.transact(() => plan.players.set(id, { id, name, wish: null, joinedAt: Date.now() }), 'local')
      lineup.doc.transact(() => {
        for (const [n, team] of Object.entries(teams)) lineup.slots.set(n, { team, player: (lineup.slots.get(n) as { player?: string })?.player ?? null })
        lineup.slots.set(nation, { team: teams[nation] ?? (lineup.slots.get(nation) as { team?: string })?.team ?? null, player: id })
      }, 'local')
    },
    [nation, name, teams] as const,
  )
type Doc = { transact(fn: () => void, origin: string): void }
type YMap = { set(k: string, v: unknown): void; get(k: string): unknown }

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
