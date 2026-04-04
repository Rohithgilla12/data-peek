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
  | 'brand-blue'
  | 'brand-deep'
  | 'midnight'
  | 'solid-dark'
  | 'solid-light'
  | 'raindrop'
  | 'falcon'
  | 'sunset'
  | 'breeze'
  | 'vercel'
  | 'supabase'
  | 'candy'

export type ShareImageTheme = 'dark' | 'light'
export type { BackgroundStyle }

interface ShareImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: (theme: ShareImageTheme, background: BackgroundStyle) => ReactNode
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
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('brand-blue')
  const [padding, setPadding] = useState<'compact' | 'normal' | 'spacious'>('normal')

  useEffect(() => {
    if (!open) {
      setIsCopied(false)
    }
  }, [open])

  const getBackgroundStyle = (style: BackgroundStyle): React.CSSProperties => {
    switch (style) {
      case 'brand-blue':
        return { background: 'oklch(0.35 0.12 250)' }
      case 'brand-deep':
        return { background: 'oklch(0.25 0.08 250)' }
      case 'midnight':
        return { background: 'oklch(0.16 0.005 260)' }
      case 'solid-dark':
        return { background: 'oklch(0.13 0 0)' }
      case 'solid-light':
        return { background: 'oklch(0.96 0.005 250)' }
      case 'raindrop':
        return {
          background: 'linear-gradient(140deg, oklch(0.65 0.12 240) 0%, oklch(0.35 0.12 260) 100%)'
        }
      case 'falcon':
        return {
          background: 'linear-gradient(140deg, oklch(0.8 0.06 210) 0%, oklch(0.3 0.04 280) 100%)'
        }
      case 'sunset':
        return {
          background: 'linear-gradient(140deg, oklch(0.8 0.14 85) 0%, oklch(0.6 0.18 30) 100%)'
        }
      case 'breeze':
        return {
          background: 'linear-gradient(140deg, oklch(0.55 0.18 340) 0%, oklch(0.45 0.18 290) 100%)'
        }
      case 'vercel':
        return {
          background: 'linear-gradient(140deg, #232323 0%, #1f1f1f 100%)'
        }
      case 'supabase':
        return { background: '#121212' }
      case 'candy':
        return {
          background: 'linear-gradient(140deg, #a58efb 0%, #e9bff8 100%)'
        }
    }
  }

  const getContentStyle = (style: BackgroundStyle): React.CSSProperties => {
    if (style === 'solid-light') {
      return {
        background: 'oklch(0.985 0 0)',
        borderTop: '1px solid oklch(0.9 0.01 250)'
      }
    }
    return {
      background: 'oklch(0.13 0.005 260)',
      borderTop: '1px solid oklch(0.25 0.02 250)'
    }
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

  const theme: ShareImageTheme =
    backgroundStyle === 'solid-light' || backgroundStyle === 'sunset' ? 'light' : 'dark'

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
          <div className="overflow-hidden rounded-lg border border-border/50">
            <div
              ref={renderRef}
              className={cn('relative', getPaddingClass(padding))}
              style={getBackgroundStyle(backgroundStyle)}
            >
              <svg
                className="pointer-events-none absolute inset-0 size-full"
                style={{ opacity: theme === 'light' ? 0.03 : 0.04, mixBlendMode: 'overlay' }}
              >
                <filter id="noise">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.8"
                    numOctaves="4"
                    stitchTiles="stitch"
                  />
                </filter>
                <rect width="100%" height="100%" filter="url(#noise)" />
              </svg>

              <div className="relative">
                {header && header(theme)}

                <div
                  className={cn('rounded-md', getContentPaddingClass(padding))}
                  style={getContentStyle(backgroundStyle)}
                >
                  {children(theme, backgroundStyle)}
                </div>

                {showBranding && (
                  <div
                    className="mt-3 flex items-center justify-end gap-1.5 font-mono text-[0.6875rem] tracking-wide"
                    style={{
                      color: theme === 'light' ? 'oklch(0.55 0.02 250)' : 'oklch(0.55 0.08 250)'
                    }}
                  >
                    <span style={{ opacity: 0.7 }}>via</span>
                    <span className="font-semibold">data-peek</span>
                  </div>
                )}
              </div>
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
                    <SelectItem value="brand-blue">Brand Blue</SelectItem>
                    <SelectItem value="brand-deep">Deep Blue</SelectItem>
                    <SelectItem value="midnight">Midnight</SelectItem>
                    <SelectItem value="raindrop">Raindrop</SelectItem>
                    <SelectItem value="falcon">Falcon</SelectItem>
                    <SelectItem value="sunset">Sunset</SelectItem>
                    <SelectItem value="breeze">Breeze</SelectItem>
                    <SelectItem value="vercel">Vercel</SelectItem>
                    <SelectItem value="supabase">Supabase</SelectItem>
                    <SelectItem value="candy">Candy</SelectItem>
                    <SelectItem value="solid-dark">Carbon</SelectItem>
                    <SelectItem value="solid-light">Light</SelectItem>
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
