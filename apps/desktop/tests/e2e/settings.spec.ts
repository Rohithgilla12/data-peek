import { test, expect } from './fixtures/electron-app'

test('the sidebar opens one settings page with every section', async ({ window }) => {
  await window.getByRole('link', { name: 'Settings' }).click()

  const nav = window.locator('nav')
  for (const label of [
    'General',
    'AI',
    'Integrations',
    'History & privacy',
    'Shortcuts',
    'License'
  ]) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(window.getByRole('heading', { name: 'General', level: 1 })).toBeVisible()

  await nav.getByRole('button', { name: 'Shortcuts' }).click()
  await expect(window.getByText('Command palette')).toBeVisible()
})

test('AI is configured on the settings page, not in a modal', async ({ window }) => {
  await window.getByRole('link', { name: 'Settings' }).click()
  await window.locator('nav').getByRole('button', { name: 'AI', exact: true }).click()

  await expect(window.getByText('AI is not set up')).toBeVisible()
  await expect(window.getByRole('dialog')).toHaveCount(0)

  await window
    .getByRole('button', { name: /Add key/ })
    .first()
    .click()
  await expect(window.getByLabel('OpenAI API key')).toBeVisible()

  const ollama = window.getByLabel('Ollama URL').locator('xpath=../..')
  await ollama.getByRole('button', { name: 'Use' }).click()
  await expect(ollama.getByText('In use')).toBeVisible()
  await expect(window.getByText('In use · local')).toBeVisible()
  await expect(window.getByTitle('AI settings')).toContainText('local')

  const saved = await window.evaluate(() => window.api.ai.getMultiProviderConfig())
  expect(saved.data?.activeProvider).toBe('ollama')
})
