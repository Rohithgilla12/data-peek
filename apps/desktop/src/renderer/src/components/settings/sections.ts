export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'AI' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'history', label: 'History & privacy' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'license', label: 'License' }
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

export function parseSettingsSection(value: unknown): SettingsSection {
  return SETTINGS_SECTIONS.find((s) => s.id === value)?.id ?? 'general'
}
