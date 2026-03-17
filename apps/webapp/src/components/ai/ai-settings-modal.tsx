import * as React from 'react'
import {
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  ExternalLink,
  Trash2,
  Key,
  CheckCircle2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { AIProvider, AIMultiProviderConfig, AIProviderConfig } from '@shared/index'
import { AI_PROVIDERS } from '@shared/index'

type ProviderId = AIProvider

interface AISettingsModalProps {
  isOpen: boolean
  onClose: () => void
  multiProviderConfig: AIMultiProviderConfig | null
  onSaveProviderConfig: (provider: AIProvider, config: AIProviderConfig) => Promise<void>
  onRemoveProviderConfig: (provider: AIProvider) => Promise<void>
  onSetActiveProvider: (provider: AIProvider) => Promise<void>
  onSetActiveModel: (provider: AIProvider, model: string) => Promise<void>
}

export function AISettingsModal({
  isOpen,
  onClose,
  multiProviderConfig,
  onSaveProviderConfig,
  onRemoveProviderConfig,
  onSetActiveProvider,
  onSetActiveModel
}: AISettingsModalProps) {
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderId>('openai')
  const [apiKey, setApiKey] = React.useState('')
  const [baseUrl, setBaseUrl] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [isValidating, setIsValidating] = React.useState(false)
  const [validationResult, setValidationResult] = React.useState<'success' | 'error' | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  const providerConfig = AI_PROVIDERS.find((p) => p.id === selectedProvider)!

  // Check if a provider has a saved config
  const hasProviderConfig = (providerId: ProviderId): boolean => {
    if (!multiProviderConfig?.providers) return false
    const config = multiProviderConfig.providers[providerId]
    if (providerId === 'ollama') {
      return !!config?.baseUrl
    }
    return !!config?.apiKey
  }

  // Get the active provider
  const activeProvider = multiProviderConfig?.activeProvider || 'openai'

  // Get saved model for a provider
  const getSavedModel = (providerId: ProviderId): string => {
    const defaultModel =
      AI_PROVIDERS.find((p) => p.id === providerId)?.models.find((m) => m.recommended)?.id ||
      AI_PROVIDERS.find((p) => p.id === providerId)?.models[0]?.id ||
      ''
    return multiProviderConfig?.activeModels?.[providerId] || defaultModel
  }

  // Load config when provider changes
  React.useEffect(() => {
    const config = multiProviderConfig?.providers?.[selectedProvider]
    if (config) {
      setApiKey(config.apiKey || '')
      setBaseUrl(config.baseUrl || (selectedProvider === 'ollama' ? 'http://localhost:11434' : ''))
    } else {
      setApiKey('')
      setBaseUrl(selectedProvider === 'ollama' ? 'http://localhost:11434' : '')
    }
    setValidationResult(null)
    setShowKey(false)
  }, [selectedProvider, multiProviderConfig])

  // Initialize selected provider on open
  React.useEffect(() => {
    if (isOpen && multiProviderConfig?.activeProvider) {
      setSelectedProvider(multiProviderConfig.activeProvider as ProviderId)
    }
  }, [isOpen, multiProviderConfig?.activeProvider])

  const handleValidate = async () => {
    if (!apiKey && selectedProvider !== 'ollama') return

    setIsValidating(true)
    setValidationResult(null)

    try {
      const result = await window.api.ai.validateKey({
        provider: selectedProvider,
        apiKey: selectedProvider === 'ollama' ? undefined : apiKey,
        model: getSavedModel(selectedProvider),
        baseUrl: baseUrl || undefined
      })

      if (result.success && result.data?.valid) {
        setValidationResult('success')
      } else {
        setValidationResult('error')
      }
    } catch {
      setValidationResult('error')
    } finally {
      setIsValidating(false)
    }
  }

  const handleSaveProviderConfig = async () => {
    setIsSaving(true)
    try {
      await onSaveProviderConfig(selectedProvider, {
        apiKey: selectedProvider === 'ollama' ? undefined : apiKey,
        baseUrl: baseUrl || undefined
      })
      setValidationResult('success')
    } catch (error) {
      console.error('Failed to save provider config:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveProviderConfig = async () => {
    setIsSaving(true)
    try {
      await onRemoveProviderConfig(selectedProvider)
      setApiKey('')
      setBaseUrl(selectedProvider === 'ollama' ? 'http://localhost:11434' : '')
      setValidationResult(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSetActive = async () => {
    if (!hasProviderConfig(selectedProvider)) return
    setIsSaving(true)
    try {
      await onSetActiveProvider(selectedProvider)
    } finally {
      setIsSaving(false)
    }
  }

  const handleModelChange = async (model: string) => {
    try {
      await onSetActiveModel(selectedProvider, model)
    } catch (error) {
      console.error('Failed to set model:', error)
    }
  }

  const canSaveConfig = (selectedProvider === 'ollama' || apiKey.length > 10) && !isSaving
  const isActiveProvider = activeProvider === selectedProvider

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] gap-0 p-0 overflow-hidden">
        {/* Decorative header gradient */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-sm" />
              <div className="relative flex items-center justify-center size-10 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                <Sparkles className="size-5 text-blue-400" />
              </div>
            </div>
            <div>
              <DialogTitle>AI Providers</DialogTitle>
              <DialogDescription>
                Configure multiple AI providers and switch between them
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Provider Selection with status indicators */}
          <div className="space-y-2">
            <Label className="text-xs">Providers</Label>
            <div className="grid grid-cols-5 gap-2">
              {AI_PROVIDERS.map((p) => {
                const hasConfig = hasProviderConfig(p.id)
                const isActive = activeProvider === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvider(p.id)}
                    className={cn(
                      'relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-all',
                      selectedProvider === p.id
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : hasConfig
                          ? 'border-green-500/30 hover:border-green-500/50 hover:bg-green-500/5 text-muted-foreground'
                          : 'border-border/50 hover:border-border hover:bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {hasConfig && (
                      <div className="absolute -top-1 -right-1">
                        <CheckCircle2
                          className={cn(
                            'size-3.5',
                            isActive ? 'text-green-500' : 'text-green-500/60'
                          )}
                        />
                      </div>
                    )}
                    <span className="text-[10px] font-medium">{p.name}</span>
                    {isActive && hasConfig && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">
                        Active
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">{providerConfig.description}</p>
          </div>

          {/* API Key Input */}
          {selectedProvider !== 'ollama' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="api-key" className="text-xs">
                  API Key
                </Label>
                <a
                  href={providerConfig.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
                >
                  Get API Key
                  <ExternalLink className="size-3" />
                </a>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="api-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setValidationResult(null)
                    }}
                    placeholder={`${providerConfig.keyPrefix || ''}...`}
                    className="pl-9 pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  disabled={!apiKey || isValidating}
                  className="shrink-0"
                >
                  {isValidating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : validationResult === 'success' ? (
                    <Check className="size-4 text-green-500" />
                  ) : validationResult === 'error' ? (
                    <AlertCircle className="size-4 text-red-500" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
              {validationResult === 'success' && (
                <p className="text-[10px] text-green-500 flex items-center gap-1">
                  <Check className="size-3" />
                  API key is valid
                </p>
              )}
              {validationResult === 'error' && (
                <p className="text-[10px] text-red-500 flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  Invalid API key
                </p>
              )}
            </div>
          )}

          {/* Base URL for Ollama */}
          {selectedProvider === 'ollama' && (
            <div className="space-y-2">
              <Label htmlFor="base-url" className="text-xs">
                Ollama URL
              </Label>
              <Input
                id="base-url"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Make sure Ollama is running locally
              </p>
            </div>
          )}

          {/* Model Selection */}
          <div className="space-y-2">
            <Label className="text-xs">Model</Label>
            <Select value={getSavedModel(selectedProvider)} onValueChange={handleModelChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {providerConfig.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <span>{m.name}</span>
                      {m.recommended && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Recommended
                        </span>
                      )}
                      {m.description && (
                        <span className="text-[10px] text-muted-foreground">{m.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Save/Remove Provider Config */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSaveProviderConfig}
              disabled={!canSaveConfig}
              className="flex-1"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {hasProviderConfig(selectedProvider) ? 'Update' : 'Save'} {providerConfig.name} Key
            </Button>
            {hasProviderConfig(selectedProvider) && !isActiveProvider && (
              <Button size="sm" variant="outline" onClick={handleSetActive} disabled={isSaving}>
                Set Active
              </Button>
            )}
            {hasProviderConfig(selectedProvider) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRemoveProviderConfig}
                disabled={isSaving}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>

          {/* Info box */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your API keys are stored locally and securely. They are never sent to our servers. All
              AI requests are made directly from your machine to the provider. Configure multiple
              providers and switch between them anytime.
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <div className="flex items-center justify-end w-full">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
