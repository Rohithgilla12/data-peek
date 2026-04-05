'use client'

import { trpc } from '@/lib/trpc-client'
import { ProBadge } from './pro-badge'

interface ProGateProps {
  feature: string
  children: React.ReactNode
}

export function ProGate({ feature, children }: ProGateProps) {
  const { data } = trpc.usage.current.useQuery()

  if (!data) return <>{children}</>
  if (data.plan === 'pro') return <>{children}</>

  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <ProBadge feature={feature} />
          <span className="text-xs text-muted-foreground">Upgrade to unlock</span>
        </div>
      </div>
    </div>
  )
}
