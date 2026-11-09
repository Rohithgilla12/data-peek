import { useEffect, useState, type ReactNode } from 'react'
import {
  CaretDownIcon,
  CaretRightIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeSlashIcon,
  SpinnerIcon,
  TrashIcon
} from '@/components/icons'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn
} from '@data-peek/ui'
import type { AIMultiProviderConfig, AIProvider, AIProviderConfig } from '@shared/index'
import { AI_PROVIDERS, isHarnessProvider, providerNeedsKey } from '@shared/index'
import { useAIStore } from '@/stores/ai-store'
import { SettingsGroup } from './settings-layout'

type ProviderInfo = (typeof AI_PROVIDERS)[number]

const SUBSCRIPTIONS = AI_PROVIDERS.filter((p) => isHarnessProvider(p.id))
const KEYED = AI_PROVIDERS.filter((p) => providerNeedsKey(p.id))
const LOCAL = AI_PROVIDERS.filter((p) => !providerNeedsKey(p.id) && !isHarnessProvider(p.id))

const SIGN_IN_HINT: Partial<Record<AIProvider, string>> = {
  'claude-cli': 'Install Claude Code, then run claude once to sign in.',
  'codex-cli': 'Install Codex, then run codex login once to sign in.',
  'antigravity-cli': 'Install Antigravity, then run agy once to sign in.'
}

const OLLAMA_DEFAULT_URL = 'http://localhost:11434'

function isSaved(config: AIMultiProviderConfig | null, id: AIProvider): boolean {
  const saved = config?.providers?.[id]
  if (!saved) return false
  if (id === 'ollama') return !!saved.baseUrl
  return providerNeedsKey(id) ? !!saved.apiKey : true
}

function defaultModel(p: ProviderInfo): string {
  return p.models.find((m) => m.recommended)?.id ?? p.models[0]?.id ?? ''
}

const actions = {
  async save(id: AIProvider, config: AIProviderConfig) {
    const res = await window.api.ai.setProviderConfig(id, config)
    if (!res.success) throw new Error(res.error ?? 'Could not save')
    useAIStore.getState().setProviderConfig(id, config)
  },
  async use(id: AIProvider) {
    const res = await window.api.ai.setActiveProvider(id)
    if (!res.success) throw new Error(res.error ?? 'Could not switch provider')
    useAIStore.getState().setActiveProvider(id)
  },
  async remove(id: AIProvider) {
    const res = await window.api.ai.removeProviderConfig(id)
    if (!res.success) throw new Error(res.error ?? 'Could not remove')
    useAIStore.getState().removeProviderConfig(id)
  },
  async setModel(id: AIProvider, model: string) {
    const res = await window.api.ai.setActiveModel(id, model)
    if (!res.success) throw new Error(res.error ?? 'Could not change model')
    useAIStore.getState().setActiveModel(id, model)
  }
}

export function AISettingsSection() {
  const config = useAIStore((s) => s.multiProviderConfig)
  const isConfigured = useAIStore((s) => s.isConfigured)
  const active = isConfigured ? config?.activeProvider : undefined
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const activate = (id: AIProvider, save?: AIProviderConfig) =>
    run(async () => {
      if (save) await actions.save(id, save)
      await actions.use(id)
    })

  const rowProps = (p: ProviderInfo) => ({
    provider: p,
    isActive: active === p.id,
    isSaved: isSaved(config, p.id),
    savedConfig: config?.providers?.[p.id],
    onUse: activate,
    onRemove: (id: AIProvider) => run(() => actions.remove(id)),
    onSave: (id: AIProvider, c: AIProviderConfig) =>
      run(async () => {
        await actions.save(id, c)
        if (!isConfigured) await actions.use(id)
      })
  })

  return (
    <div className="space-y-8">
      <ActiveProvider
        config={config}
        active={active}
        onModelChange={(id, model) => run(() => actions.setModel(id, model))}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <SettingsGroup title="Your subscription">
        <p className="font-sans text-xs text-muted-foreground -mt-2">
          Runs through an AI CLI you already pay for and are signed in to. No key needed.
        </p>
        <ProviderList>
          {SUBSCRIPTIONS.map((p) => (
            <SubscriptionRow key={p.id} {...rowProps(p)} />
          ))}
        </ProviderList>
      </SettingsGroup>

      <SettingsGroup title="API key">
        <p className="font-sans text-xs text-muted-foreground -mt-2">
          Billed by the provider per request. Keys stay on this machine.
        </p>
        <ProviderList>
          {KEYED.map((p) => (
            <KeyRow key={p.id} {...rowProps(p)} />
          ))}
        </ProviderList>
      </SettingsGroup>

      <SettingsGroup title="Local">
        <ProviderList>
          {LOCAL.map((p) => (
            <LocalRow key={p.id} {...rowProps(p)} />
          ))}
        </ProviderList>
      </SettingsGroup>

      <p className="font-sans text-xs text-muted-foreground">
        Requests go straight from your machine to the provider. data-peek never sees your keys,
        prompts, or data.
      </p>
    </div>
  )
}

function ActiveProvider({
  config,
  active,
  onModelChange
}: {
  config: AIMultiProviderConfig | null
  active: AIProvider | undefined
  onModelChange: (id: AIProvider, model: string) => void
}) {
  const info = AI_PROVIDERS.find((p) => p.id === active)
  if (!info) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium">AI is not set up</p>
        <p className="font-sans text-xs text-muted-foreground mt-1">
          Pick a provider below. If you already use Claude Code, Codex, or Antigravity, that is the
          quickest way in.
        </p>
      </div>
    )
  }

  const kind = isHarnessProvider(info.id)
    ? 'your subscription'
    : providerNeedsKey(info.id)
      ? 'API key'
      : 'local'

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="size-2 shrink-0 rounded-full bg-success" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{info.name}</p>
          <p className="text-xs text-muted-foreground">In use · {kind}</p>
        </div>
      </div>
      {info.models.length > 0 && (
        <Select
          value={config?.activeModels?.[info.id] || defaultModel(info)}
          onValueChange={(model) => onModelChange(info.id, model)}
        >
          <SelectTrigger className="w-56" aria-label="Model">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            {info.models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span>{m.name}</span>
                {m.description && (
                  <span className="text-2xs text-muted-foreground">{m.description}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function ProviderList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/50 rounded-lg border border-border/50">{children}</div>
  )
}

interface RowProps {
  provider: ProviderInfo
  isActive: boolean
  isSaved: boolean
  savedConfig: AIProviderConfig | undefined
  onUse: (id: AIProvider, save?: AIProviderConfig) => Promise<void>
  onSave: (id: AIProvider, config: AIProviderConfig) => Promise<void>
  onRemove: (id: AIProvider) => Promise<void>
}

function RowHeader({
  name,
  detail,
  status,
  children
}: {
  name: string
  detail?: ReactNode
  status?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">{name}</span>
          {status}
        </div>
        {detail && <p className="font-sans text-xs text-muted-foreground mt-0.5">{detail}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

function Status({ tone, children }: { tone: 'active' | 'ready' | 'muted'; children: string }) {
  return (
    <span
      className={cn(
        'text-2xs',
        tone === 'active' && 'text-success',
        tone === 'ready' && 'text-primary',
        tone === 'muted' && 'text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

function UseButton({
  isActive,
  disabled,
  onClick
}: {
  isActive: boolean
  disabled?: boolean
  onClick: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  if (isActive) return <Status tone="active">In use</Status>
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true)
        await onClick()
        setBusy(false)
      }}
    >
      {busy && <SpinnerIcon className="size-3.5 animate-spin" />}
      Use
    </Button>
  )
}

interface Detection {
  available: boolean
  version?: string
}

function SubscriptionRow({ provider, isActive, onUse }: RowProps) {
  const [detection, setDetection] = useState<Detection | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setDetection(null)
    window.api.ai
      .detectHarness(provider.id)
      .then(
        (res) => live && setDetection(res.success && res.data ? res.data : { available: false })
      )
      .catch(() => live && setDetection({ available: false }))
    return () => {
      live = false
    }
  }, [provider.id, attempt])

  const status =
    detection === null ? (
      <Status tone="muted">Checking…</Status>
    ) : detection.available ? (
      <Status tone="ready">{`Installed${detection.version ? ` · ${detection.version}` : ''}`}</Status>
    ) : (
      <Status tone="muted">Not found</Status>
    )

  return (
    <RowHeader
      name={provider.name}
      status={status}
      detail={detection && !detection.available ? SIGN_IN_HINT[provider.id] : undefined}
    >
      {detection && !detection.available ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            Check again
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={provider.keyUrl} target="_blank" rel="noreferrer">
              Setup guide
              <ExternalLinkIcon className="size-3" />
            </a>
          </Button>
        </>
      ) : (
        <UseButton
          isActive={isActive}
          disabled={!detection?.available}
          onClick={() => onUse(provider.id, {})}
        />
      )}
    </RowHeader>
  )
}

function KeyRow({ provider, isActive, isSaved, savedConfig, onUse, onSave, onRemove }: RowProps) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(savedConfig?.apiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setKey(savedConfig?.apiKey ?? '')
    setTest('idle')
  }, [savedConfig?.apiKey])

  const dirty = key !== (savedConfig?.apiKey ?? '')
  const Caret = open ? CaretDownIcon : CaretRightIcon

  const runTest = async () => {
    setTest('testing')
    const res = await window.api.ai
      .validateKey({ provider: provider.id, apiKey: key, model: defaultModel(provider) })
      .catch(() => null)
    setTest(res?.success && res.data?.valid ? 'ok' : 'fail')
  }

  const save = async () => {
    setSaving(true)
    await onSave(provider.id, { apiKey: key })
    setSaving(false)
  }

  return (
    <div>
      <RowHeader
        name={provider.name}
        status={isSaved && !isActive ? <Status tone="ready">Key saved</Status> : undefined}
        detail={provider.description}
      >
        {isSaved && <UseButton isActive={isActive} onClick={() => onUse(provider.id)} />}
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {isSaved ? 'Edit key' : 'Add key'}
          <Caret className="size-3" />
        </Button>
      </RowHeader>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                aria-label={`${provider.name} API key`}
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => {
                  setKey(e.target.value)
                  setTest('idle')
                }}
                placeholder={`${provider.keyPrefix ?? ''}…`}
                className="pr-9 font-mono text-xs"
                autoFocus
              />
              <button
                type="button"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runTest}
              disabled={!key || test === 'testing'}
            >
              {test === 'testing' && <SpinnerIcon className="size-3.5 animate-spin" />}
              Test
            </Button>
            <Button size="sm" onClick={save} disabled={!key || !dirty || saving}>
              {saving && <SpinnerIcon className="size-3.5 animate-spin" />}
              Save
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-2xs">
              {test === 'ok' && <span className="text-success">Key works</span>}
              {test === 'fail' && <span className="text-destructive">Key was rejected</span>}
              {test === 'idle' && (
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Get a {provider.name} key
                  <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </div>
            {isSaved && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove(provider.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <TrashIcon className="size-3.5" />
                Remove key
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LocalRow({ provider, isActive, savedConfig, onUse }: RowProps) {
  const savedUrl = savedConfig?.baseUrl || OLLAMA_DEFAULT_URL
  const [url, setUrl] = useState(savedUrl)

  useEffect(() => setUrl(savedUrl), [savedUrl])

  const dirty = url !== savedUrl

  return (
    <div>
      <RowHeader name={provider.name} detail={provider.description}>
        <UseButton
          isActive={isActive && !dirty}
          disabled={!url}
          onClick={() => onUse(provider.id, { baseUrl: url })}
        />
      </RowHeader>
      <div className="px-3 pb-3">
        <Input
          aria-label={`${provider.name} URL`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={OLLAMA_DEFAULT_URL}
          className="font-mono text-xs"
        />
      </div>
    </div>
  )
}
