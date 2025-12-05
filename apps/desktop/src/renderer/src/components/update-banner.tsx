import { useEffect, useState } from 'react'
import { Download, RefreshCw, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useUpdateStore } from '@/stores/update-store'

export function UpdateBanner() {
  const {
    status,
    version,
    releaseNotes,
    downloadProgress,
    isBannerDismissed,
    dismissBanner,
    restartAndUpdate,
    initializeListener
  } = useUpdateStore()
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => initializeListener(), [initializeListener])

  // Open links in external browser
  const handleLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const link = target.closest('a')
    if (link?.href) {
      e.preventDefault()
      window.open(link.href, '_blank')
    }
  }

  if (status === 'downloading') {
    return (
      <div className="flex items-center gap-3 bg-blue-500/10 border-b border-blue-500/20 px-4 py-2">
        <Loader2 className="size-4 animate-spin text-blue-400" />
        <span className="text-sm text-blue-400">Downloading v{version}...</span>
        <Progress value={downloadProgress} className="h-1.5 flex-1 max-w-xs" />
        <span className="text-xs text-blue-400/70">{downloadProgress}%</span>
      </div>
    )
  }

  if (status === 'ready' && !isBannerDismissed) {
    return (
      <div className="bg-emerald-500/10 border-b border-emerald-500/20">
        <div className="flex items-center gap-3 px-4 py-2">
          <Download className="size-4 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">Update v{version} ready</span>
          {releaseNotes && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-emerald-400/70 hover:text-emerald-400"
              onClick={() => setShowChangelog(!showChangelog)}
            >
              {showChangelog ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {showChangelog ? 'Hide' : 'Changelog'}
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-3 text-xs text-emerald-400 hover:text-emerald-300"
            onClick={restartAndUpdate}
          >
            <RefreshCw className="size-3" />
            Restart to Update
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={dismissBanner}
          >
            <X className="size-3.5" />
          </Button>
        </div>
        {showChangelog && releaseNotes && (
          <div className="px-4 pb-3">
            <div
              className="changelog-content rounded-md bg-background/50 border border-border/50 p-4 max-h-64 overflow-y-auto text-sm"
              onClick={handleLinkClick}
              dangerouslySetInnerHTML={{ __html: releaseNotes }}
            />
          </div>
        )}
      </div>
    )
  }

  return null
}
