'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { UpgradeDialog } from './upgrade-dialog'

interface ProBadgeProps {
  feature?: string
}

export function ProBadge({ feature }: ProBadgeProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent hover:bg-accent/20 transition-colors"
      >
        <Lock className="h-2.5 w-2.5" />
        Pro
      </button>
      <UpgradeDialog open={open} onClose={() => setOpen(false)} feature={feature} />
    </>
  )
}
