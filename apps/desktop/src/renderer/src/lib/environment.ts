import type { ConnectionEnvironment, EnvironmentPreset } from '@shared/index'

const ENVIRONMENT_PRESETS: Record<EnvironmentPreset, { label: string; color: string }> = {
  production: { label: 'PROD', color: 'oklch(0.65 0.2 25)' },
  staging: { label: 'STG', color: 'oklch(0.75 0.15 70)' },
  uat: { label: 'UAT', color: 'oklch(0.8 0.15 95)' },
  development: { label: 'DEV', color: 'oklch(0.7 0.17 150)' },
  local: { label: 'LOCAL', color: 'oklch(0.65 0.15 250)' }
}

export const CUSTOM_COLOR_PALETTE = [
  'oklch(0.65 0.2 25)',
  'oklch(0.7 0.15 55)',
  'oklch(0.75 0.15 70)',
  'oklch(0.8 0.15 95)',
  'oklch(0.7 0.17 150)',
  'oklch(0.7 0.12 195)',
  'oklch(0.65 0.15 250)',
  'oklch(0.7 0.15 310)'
]

export function resolveEnvironment(
  env?: ConnectionEnvironment
): { label: string; color: string } | null {
  if (!env) return null
  if (env.preset === 'custom') return { label: env.customLabel, color: env.customColor }
  return ENVIRONMENT_PRESETS[env.preset]
}

export { ENVIRONMENT_PRESETS }
