import type { AIMultiProviderConfig, AIProvider } from '@shared/index'
import { AI_PROVIDERS } from '@shared/index'

const KNOWN_PROVIDER_IDS = new Set<AIProvider>(AI_PROVIDERS.map((p) => p.id))

// Self-heal a persisted multi-provider config so a corrupt or stale shape can
// never crash the app. Config lives in persisted local state and survives across
// versions, so it can drift out of sync with the code: an activeProvider that was
// renamed/removed, a missing providers map, or a value mangled by a bad write.
// The settings UI looks providers up by id, so a bogus activeProvider used to
// throw ("Cannot read properties of undefined"). We coerce anything invalid back
// to a usable provider instead of letting it brick the AI panel.
export function sanitizeMultiConfig(
  config: AIMultiProviderConfig | null | undefined
): AIMultiProviderConfig | null {
  if (!config || typeof config !== 'object') return null

  const providers = config.providers && typeof config.providers === 'object' ? config.providers : {}
  const activeModels =
    config.activeModels && typeof config.activeModels === 'object' ? config.activeModels : {}

  let activeProvider = config.activeProvider
  if (!KNOWN_PROVIDER_IDS.has(activeProvider)) {
    // Prefer a provider the user has actually configured, else the first known one.
    activeProvider =
      (Object.keys(providers) as AIProvider[]).find((p) => KNOWN_PROVIDER_IDS.has(p)) ??
      AI_PROVIDERS[0].id
  }

  return { ...config, providers, activeModels, activeProvider }
}
