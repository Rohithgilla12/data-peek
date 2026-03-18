import { useState } from 'react'
import { Loader2, Key, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useLicenseStore } from '@/stores/license-store'
import { buildTrackingUrl } from '@shared/index'

const UTM_PARAMS = { source: 'desktop', medium: 'app', content: 'activation_modal' }

interface LicenseActivationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LicenseActivationModal({ open, onOpenChange }: LicenseActivationModalProps) {
  const { activateLicense, activateLicenseOffline, isLoading, error } = useLicenseStore()

  const [email, setEmail] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const resetForm = () => {
    setEmail('')
    setLicenseKey('')
    setLocalError(null)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const handleActivate = async () => {
    if (!email || !licenseKey) {
      setLocalError('Please enter both email and license key')
      return
    }

    // Basic email validation
    if (!email.includes('@')) {
      setLocalError('Please enter a valid email address')
      return
    }

    setLocalError(null)

    // Try online activation first, fall back to offline for development
    const result = await activateLicense(licenseKey, email)

    if (result.success) {
      handleClose()
    } else if (result.error?.includes('Network error')) {
      // For development/testing: try offline activation
      const offlineResult = await activateLicenseOffline(licenseKey, email, 'individual', 365)
      if (offlineResult.success) {
        handleClose()
      } else {
        setLocalError(offlineResult.error || 'Activation failed')
      }
    } else {
      setLocalError(result.error || 'Activation failed')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && email && licenseKey) {
      handleActivate()
    }
  }

  const isValid = email && licenseKey

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-5" />
            Activate License
          </DialogTitle>
          <DialogDescription>
            Enter your license key and email to activate data-peek for commercial use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="license-key" className="text-sm font-medium">
              License Key
            </label>
            <Input
              id="license-key"
              placeholder="DP-XXXX-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              className="font-mono"
            />
          </div>

          {(localError || error) && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {localError || error}
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have a license?{' '}
              <a
                href={buildTrackingUrl('/pricing', UTM_PARAMS)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Purchase one
                <ExternalLink className="size-3" />
              </a>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Need to manage your license?{' '}
              <a
                href={buildTrackingUrl('/dashboard', UTM_PARAMS)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                License Dashboard
                <ExternalLink className="size-3" />
              </a>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleActivate} disabled={!isValid || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Activating...
              </>
            ) : (
              'Activate'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
