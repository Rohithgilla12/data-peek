import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { toBlob } from 'html-to-image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Copy, Download, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type BackgroundStyle =
  | 'gradient-blue'
  | 'gradient-purple'
  | 'gradient-green'
  | 'solid-dark'
  | 'solid-light'

export type ShareImageTheme = 'dark' | 'light'

interface ShareImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: (theme: ShareImageTheme) => ReactNode
  filenamePrefix?: string
  header?: (theme: ShareImageTheme) => ReactNode
  extraOptions?: ReactNode
}

export function ShareImageDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  filenamePrefix = 'data-peek',
  header,
  extraOptions
}: ShareImageDialogProps) {
  const renderRef = useRef<HTMLDivElement>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const [showBranding, setShowBranding] = useState(true)
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('gradient-blue')
  const [padding, setPadding] = useState<'compact' | 'normal' | 'spacious'>('normal')

  useEffect(() => {
    if (!open) {
      setIsCopied(false)
    }
  }, [open])

  const getBackgroundClass = (style: BackgroundStyle) => {
    switch (style) {
      case 'gradient-blue':
        return 'bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800'
      case 'gradient-purple':
        return 'bg-gradient-to-br from-purple-600 via-violet-700 to-indigo-800'
      case 'gradient-green':
        return 'bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800'
      case 'solid-dark':
        return 'bg-zinc-900'
      case 'solid-light':
        return 'bg-zinc-100'
    }
  }

  const getContentBackgroundClass = (style: BackgroundStyle) => {
    if (style === 'solid-light') {
      return 'bg-white/90'
    }
    return 'bg-black/40'
  }

  const getPaddingClass = (p: typeof padding) => {
    switch (p) {
      case 'compact':
        return 'p-4'
      case 'normal':
        return 'p-6'
      case 'spacious':
        return 'p-10'
    }
  }

  const getContentPaddingClass = (p: typeof padding) => {
    switch (p) {
      case 'compact':
        return 'p-4'
      case 'normal':
        return 'p-6'
      case 'spacious':
        return 'p-8'
    }
  }

  const theme: ShareImageTheme = backgroundStyle === 'solid-light' ? 'light' : 'dark'

  const generateImage = useCallback(async (): Promise<Blob | null> => {
    if (!renderRef.current) return null

    try {
      setIsGenerating(true)

      const blob = await toBlob(renderRef.current, {
        pixelRatio: 2
      })

      return blob
    } catch (error) {
      console.error('Failed to generate image:', error)
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const downloadBlob = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = `${filenamePrefix}-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    [filenamePrefix]
  )

  const handleDownload = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return
    downloadBlob(blob)
  }, [generateImage, downloadBlob])

  const handleCopyToClipboard = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      downloadBlob(blob)
    }
  }, [generateImage, downloadBlob])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-6">
          {/* Preview */}
          <div className="rounded-lg overflow-hidden border border-border/50">
            <div
              ref={renderRef}
              className={cn(getBackgroundClass(backgroundStyle), getPaddingClass(padding))}
            >
              {header && header(theme)}

              {/* Content block */}
              <div
                className={cn(
                  'rounded-lg',
                  getContentBackgroundClass(backgroundStyle),
                  getContentPaddingClass(padding)
                )}
              >
                {children(theme)}
              </div>

              {/* Branding */}
              {showBranding && (
                <div
                  className={cn(
                    'mt-4 flex items-center justify-end gap-2 text-xs',
                    theme === 'light' ? 'text-zinc-500' : 'text-white/60'
                  )}
                >
                  <span>Made with</span>
                  <span className="font-semibold">data-peek</span>
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Background</Label>
                <Select
                  value={backgroundStyle}
                  onValueChange={(v) => setBackgroundStyle(v as BackgroundStyle)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gradient-blue">Blue Gradient</SelectItem>
                    <SelectItem value="gradient-purple">Purple Gradient</SelectItem>
                    <SelectItem value="gradient-green">Green Gradient</SelectItem>
                    <SelectItem value="solid-dark">Solid Dark</SelectItem>
                    <SelectItem value="solid-light">Solid Light</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Padding</Label>
                <Select value={padding} onValueChange={(v) => setPadding(v as typeof padding)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="spacious">Spacious</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              {extraOptions}
              <div className="flex items-center justify-between">
                <Label htmlFor="show-branding-img">Show Branding</Label>
                <Switch
                  id="show-branding-img"
                  checked={showBranding}
                  onCheckedChange={setShowBranding}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Save as PNG
            </Button>
            <Button onClick={handleCopyToClipboard} disabled={isGenerating} className="gap-2">
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isCopied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {isCopied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
