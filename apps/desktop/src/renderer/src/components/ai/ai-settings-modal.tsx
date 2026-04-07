import * as React from 'react'
import {
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  ExternalLink,
  Key,
  Trash2
} from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@data-peek/ui'

import type { AIConfig } from '@shared/index'
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '@shared/index'

interface AISettingsModalProps {
  isOpen: boolean
  onClose: () => void
  config: AIConfig | null
  onSave: (config: AIConfig) => Promise<void>
  onClear: () => Promise<void>
}

export function AISettingsModal({
  isOpen,
  onClose,
  config,
  onSave,
  onClear
}: AISettingsModalProps) {
  const [apiKey, setApiKey] = React.useState('')
  const [model, setModel] = React.useState(DEFAULT_CLAUDE_MODEL)
  const [showKey, setShowKey] = React.useState(false)
  const [isValidating, setIsValidating] = React.useState(false)
  const [validationResult, setValidationResult] = React.useState<'success' | 'error' | null>(null)
  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  // Load config when modal opens
  React.useEffect(() => {
    if (isOpen && config) {
      setApiKey(config.apiKey || '')
      setModel(config.model || DEFAULT_CLAUDE_MODEL)
    } else if (isOpen) {
      setApiKey('')
      setModel(DEFAULT_CLAUDE_MODEL)
    }
    setValidationResult(null)
    setValidationError(null)
    setShowKey(false)
  }, [isOpen, config])

  const handleValidate = async () => {
    if (!apiKey) return

    setIsValidating(true)
    setValidationResult(null)
    setValidationError(null)

    try {
      const result = await window.api.ai.validateKey(apiKey)

      if (result.success && result.data?.valid) {
        setValidationResult('success')
      } else {
        setValidationResult('error')
        setValidationError(result.data?.error || 'Invalid API key')
      }
    } catch {
      setValidationResult('error')
      setValidationError('Failed to validate key')
    } finally {
      setIsValidating(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({ apiKey, model })
      setValidationResult('success')
    } catch (error) {
      console.error('Failed to save config:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    setIsSaving(true)
    try {
      await onClear()
      setApiKey('')
      setModel(DEFAULT_CLAUDE_MODEL)
      setValidationResult(null)
    } finally {
      setIsSaving(false)
    }
  }

  const canSave = apiKey.length > 10 && !isSaving
  const hasExistingConfig = !!config?.apiKey

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden">
        {/* Decorative header gradient */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-600" />

        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-sm" />
              <div className="relative flex items-center justify-center size-10 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                <Sparkles className="size-5 text-blue-400" />
              </div>
            </div>
            <div>
              <DialogTitle>Claude AI Assistant</DialogTitle>
              <DialogDescription>
                Connect your Anthropic API key to use Claude locally
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="api-key" className="text-xs">
                Anthropic API Key
              </Label>
              <a
                href="https://console.anthropic.com/settings/keys"
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
                    setValidationError(null)
                  }}
                  placeholder="sk-ant-..."
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
                {validationError || 'Invalid API key'}
              </p>
            )}
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label className="text-xs">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_MODELS.map((m) => (
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

          {/* Save / Clear */}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={!canSave} className="flex-1">
              {isSaving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {hasExistingConfig ? 'Update' : 'Save'} Configuration
            </Button>
            {hasExistingConfig && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClear}
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
              Your API key is stored locally and securely. It is never sent to our servers. All AI
              requests are made directly from your machine to Anthropic&apos;s API. Works with any
              Anthropic API key, including Claude Pro subscriptions.
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
