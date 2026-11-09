import { useCallback, useEffect, useState } from 'react'
import type { AIProvider } from '@shared/index'
import { AI_PROVIDERS, isHarnessProvider } from '@shared/index'
import { useAIStore } from '@/stores/ai-store'
import { useOpenSettings } from '@/hooks/use-open-settings'

const SUBSCRIPTION_CLIS = [
  { id: 'claude-cli', label: 'Claude' },
  { id: 'codex-cli', label: 'Codex' },
  { id: 'antigravity-cli', label: 'Antigravity' }
] as const satisfies ReadonlyArray<{ id: AIProvider; label: string }>

export interface DetectedCli {
  id: AIProvider
  label: string
  version?: string
}

let detection: Promise<DetectedCli[]> | null = null

function detectClis(): Promise<DetectedCli[]> {
  detection ??= Promise.all(
    SUBSCRIPTION_CLIS.map(async (cli): Promise<DetectedCli | null> => {
      const res = await window.api.ai.detectHarness(cli.id).catch(() => null)
      return res?.success && res.data?.available
        ? { id: cli.id, label: cli.label, version: res.data.version }
        : null
    })
  ).then((found) => found.filter((c): c is DetectedCli => c !== null))
  return detection
}

export function providerLabel(provider: AIProvider): string {
  const cli = SUBSCRIPTION_CLIS.find((c) => c.id === provider)
  if (cli) return cli.label
  return AI_PROVIDERS.find((p) => p.id === provider)?.name ?? provider
}

/**
 * The AI the Ask composer talks to, and whether it runs on a subscription
 * the user already pays for (a local agent CLI) or on a metered API key.
 * When nothing is configured it finds installed CLIs so setup is one click.
 */
export function useAskProvider() {
  const isConfigured = useAIStore((s) => s.isConfigured)
  const provider = useAIStore((s) => s.multiProviderConfig?.activeProvider)
  const setProviderConfig = useAIStore((s) => s.setProviderConfig)
  const setActiveProvider = useAIStore((s) => s.setActiveProvider)
  const openSettingsPage = useOpenSettings()
  const openSettings = useCallback(() => openSettingsPage('ai'), [openSettingsPage])
  const [detected, setDetected] = useState<DetectedCli[] | null>(null)

  useEffect(() => {
    if (isConfigured) return
    let live = true
    void detectClis().then((found) => live && setDetected(found))
    return () => {
      live = false
    }
  }, [isConfigured])

  const activate = useCallback(
    async (id: AIProvider) => {
      // Save in main first: if that fails, showing the CLI as active would leave
      // every question failing with "AI not configured".
      const saved = await window.api.ai.setProviderConfig(id, {})
      const activated = saved.success ? await window.api.ai.setActiveProvider(id) : saved
      if (!activated.success) {
        openSettings()
        return
      }
      setProviderConfig(id, {})
      setActiveProvider(id)
    },
    [setProviderConfig, setActiveProvider, openSettings]
  )

  const active = isConfigured && provider ? provider : undefined
  return {
    provider: active,
    label: active ? providerLabel(active) : null,
    isSubscription: active ? isHarnessProvider(active) : false,
    detected,
    activate,
    openSettings
  }
}
