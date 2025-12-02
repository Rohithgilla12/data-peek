'use client'

import { Loader2, Check, AlertCircle, ExternalLink, LogOut, Monitor, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useLicenseStore } from '@/stores/license-store'

interface LicenseSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LicenseSettingsModal({ open, onOpenChange }: LicenseSettingsModalProps) {
  const { status, deactivateLicense, openCustomerPortal, isLoading, error } = useLicenseStore()

  if (!status) {
    return null
  }

  const handleDeactivate = async () => {
    const result = await deactivateLicense()
    if (result.success) {
      onOpenChange(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const isExpired = status.daysUntilExpiry !== null && status.daysUntilExpiry <= 0
  const isExpiringSoon = status.daysUntilExpiry !== null && status.daysUntilExpiry <= 14

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>License Settings</DialogTitle>
          <DialogDescription>Manage your data-peek license.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* License Status Card */}
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 rounded-full p-1.5 ${
                  isExpired
                    ? 'bg-amber-500/10 text-amber-500'
                    : isExpiringSoon
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-green-500/10 text-green-500'
                }`}
              >
                {isExpired || isExpiringSoon ? (
                  <AlertCircle className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-medium">
                  {isExpired
                    ? 'License Expired'
                    : `${status.type === 'team' ? 'Team' : 'Individual'} License Active`}
                </h3>

                <div className="mt-3 space-y-2 text-sm">
                  {status.email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email</span>
                      <span>{status.email}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">{status.type}</span>
                  </div>

                  {status.expiresAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {isExpired ? 'Expired' : 'Renews'}
                      </span>
                      <span>
                        {formatDate(status.expiresAt)}
                        {!isExpired && status.daysUntilExpiry && (
                          <span className="text-muted-foreground ml-1">
                            ({status.daysUntilExpiry} days)
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  {status.devicesUsed !== undefined && status.devicesAllowed !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Devices</span>
                      <span className="flex items-center gap-1">
                        <Monitor className="size-3" />
                        {status.devicesUsed} of {status.devicesAllowed} used
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isExpired && (
              <div className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-500">
                Your subscription has ended.
                {status.perpetualVersion && (
                  <>
                    {' '}
                    You can continue using data-peek v{status.perpetualVersion} for commercial use.
                  </>
                )}{' '}
                Renew to access the latest updates.
              </div>
            )}
          </div>

          {/* Perpetual Version Info */}
          {status.perpetualVersion && !isExpired && (
            <p className="mt-4 text-xs text-muted-foreground">
              If your subscription ends, you can continue using data-peek v{status.perpetualVersion}{' '}
              (your perpetual version) for commercial use.
            </p>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="gap-2"
            onClick={openCustomerPortal}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            Manage Subscription
            <ExternalLink className="size-3" />
          </Button>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={handleDeactivate}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Deactivate
            </Button>

            {isExpired && (
              <Button
                onClick={() => window.open('https://datapeek.dev/pricing', '_blank')}
                className="gap-2"
              >
                Renew License
                <ExternalLink className="size-3" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
