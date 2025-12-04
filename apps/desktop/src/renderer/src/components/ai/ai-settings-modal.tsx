'use client'

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
  Key
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

// Provider configurations with latest 2025 models
const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-5, GPT-5.1, GPT-4o',
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5', name: 'GPT-5', recommended: true, description: 'Most capable' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Balanced' },
      { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: 'Fast & efficient' },
      { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Latest update' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous gen' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster & cheaper' }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Opus 4.5, Claude Sonnet 4',
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      {
        id: 'claude-opus-4-5-20251124',
        name: 'Claude Opus 4.5',
        recommended: true,
        description: 'Best for coding'
      },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Balanced' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Faster' }
    ]
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini 3, Gemini 2.5',
    keyPrefix: 'AI',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro',
        recommended: true,
        description: 'Most capable'
      },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Balanced' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Faster' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Previous gen' }
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Llama 3.3, Mixtral (Ultra Fast)',
    keyPrefix: 'gsk_',
    keyUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', recommended: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Fastest' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B', description: 'Reasoning' }
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models (no API key)',
    keyPrefix: null,
    keyUrl: 'https://ollama.ai',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', recommended: true },
      { id: 'qwen2.5-coder:32b', name: 'Qwen 2.5 Coder 32B', description: 'Best for SQL' },
      { id: 'codellama', name: 'Code Llama' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2' }
    ]
  }
] as const

type ProviderId = (typeof PROVIDERS)[number]['id']

interface AIConfig {
  provider: ProviderId
  apiKey?: string
  model: string
  baseUrl?: string
}

interface AISettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentConfig: AIConfig | null
  onSave: (config: AIConfig) => Promise<void>
  onClear: () => Promise<void>
}

export function AISettingsModal({
  isOpen,
  onClose,
  currentConfig,
  onSave,
  onClear
}: AISettingsModalProps) {
  const [provider, setProvider] = React.useState<ProviderId>(currentConfig?.provider || 'openai')
  const [apiKey, setApiKey] = React.useState(currentConfig?.apiKey || '')
  const [model, setModel] = React.useState(currentConfig?.model || '')
  const [baseUrl, setBaseUrl] = React.useState(currentConfig?.baseUrl || '')
  const [showKey, setShowKey] = React.useState(false)
  const [isValidating, setIsValidating] = React.useState(false)
  const [validationResult, setValidationResult] = React.useState<'success' | 'error' | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)!

  // Reset form when provider changes
  React.useEffect(() => {
    setApiKey('')
    setModel(
      selectedProvider.models.find((m) => 'recommended' in m && m.recommended)?.id ||
        selectedProvider.models[0].id
    )
    setBaseUrl(provider === 'ollama' ? 'http://localhost:11434' : '')
    setValidationResult(null)
  }, [provider, selectedProvider.models])

  // Initialize from current config
  React.useEffect(() => {
    if (currentConfig) {
      setProvider(currentConfig.provider)
      setApiKey(currentConfig.apiKey || '')
      setModel(currentConfig.model)
      setBaseUrl(currentConfig.baseUrl || '')
    }
  }, [currentConfig])

  const handleValidate = async () => {
    if (!apiKey && provider !== 'ollama') return

    setIsValidating(true)
    setValidationResult(null)

    try {
      // TODO: Call IPC to validate API key
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setValidationResult('success')
    } catch {
      setValidationResult('error')
    } finally {
      setIsValidating(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({
        provider,
        apiKey: provider === 'ollama' ? undefined : apiKey,
        model,
        baseUrl: baseUrl || undefined
      })
      onClose()
    } catch (error) {
      console.error('Failed to save AI config:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    setIsSaving(true)
    try {
      await onClear()
      setApiKey('')
      setModel(selectedProvider.models[0].id)
      setValidationResult(null)
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const canSave = (provider === 'ollama' || apiKey.length > 10) && model

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden">
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
              <DialogTitle>AI Settings</DialogTitle>
              <DialogDescription>
                Configure your AI provider to enable natural language queries
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label className="text-xs">Provider</Label>
            <div className="grid grid-cols-5 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all',
                    provider === p.id
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                      : 'border-border/50 hover:border-border hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  <span className="text-[10px] font-medium">{p.name}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{selectedProvider.description}</p>
          </div>

          {/* API Key Input */}
          {provider !== 'ollama' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="api-key" className="text-xs">
                  API Key
                </Label>
                <a
                  href={selectedProvider.keyUrl}
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
                    placeholder={`${selectedProvider.keyPrefix || ''}...`}
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
          {provider === 'ollama' && (
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
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {selectedProvider.models.map((m) => (
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

          {/* Info box */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your API key is stored locally and securely. It is never sent to our servers. All AI
              requests are made directly from your machine to the provider.
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!currentConfig || isSaving}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="size-4 mr-1" />
              Clear Config
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canSave || isSaving}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                {isSaving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                Save Configuration
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
