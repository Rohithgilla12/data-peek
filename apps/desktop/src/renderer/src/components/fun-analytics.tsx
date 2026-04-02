import { useState } from 'react'
import {
  Flame,
  Zap,
  Trophy,
  Target,
  Clock,
  Database,
  TrendingUp,
  RotateCcw,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import {
  usePokemonBuddyStore,
  getActivePokemon,
  getPokemonSpriteUrl,
  getQueryTitle,
  getRowComparison,
  ACHIEVEMENTS,
  xpForLevel,
  type Achievement
} from '@/stores/pokemon-buddy-store'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  return `${(ms / 3600000).toFixed(1)}h`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// Stat card for the metrics
function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color
}: {
  icon: typeof Flame
  label: string
  value: string
  subtitle?: string
  color?: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors">
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${color ?? 'var(--accent)'}20` }}
      >
        <Icon className="size-3.5" style={{ color: color ?? 'var(--muted-foreground)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground leading-none">{label}</div>
        <div className="text-xs font-semibold text-foreground leading-snug">{value}</div>
        {subtitle && (
          <div className="text-[9px] text-muted-foreground/70 leading-tight truncate">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

// Achievement badge
function AchievementBadge({
  achievement,
  unlocked
}: {
  achievement: Omit<Achievement, 'unlockedAt'> & { unlockedAt?: number }
  unlocked: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 transition-all',
        unlocked ? 'opacity-100' : 'opacity-40 grayscale'
      )}
      title={
        unlocked
          ? `${achievement.name}: ${achievement.description}`
          : `??? ${achievement.description}`
      }
    >
      <span className="text-sm">{achievement.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium text-foreground leading-none truncate">
          {unlocked ? achievement.name : '???'}
        </div>
        <div className="text-[9px] text-muted-foreground leading-tight truncate">
          {achievement.description}
        </div>
      </div>
    </div>
  )
}

export function FunAnalytics() {
  const {
    activePokemonId,
    buddyLevel,
    buddyXp,
    totalQueries,
    successfulQueries,
    failedQueries,
    totalRowsFetched,
    fastestQueryMs,
    slowestQueryMs,
    currentStreak,
    bestStreak,
    totalQueryTimeMs,
    achievements,
    resetStats
  } = usePokemonBuddyStore()

  const [isOpen, setIsOpen] = useState(false)
  const [showAchievements, setShowAchievements] = useState(false)

  const pokemon = getActivePokemon(activePokemonId)
  const { title } = getQueryTitle(totalQueries)
  const xpNeeded = xpForLevel(buddyLevel)
  const successRate = totalQueries > 0 ? ((successfulQueries / totalQueries) * 100).toFixed(1) : '0'
  const avgQueryTime = totalQueries > 0 ? formatDuration(totalQueryTimeMs / totalQueries) : '—'

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger>
            <Sparkles className="size-4 mr-1" />
            Fun Stats
            <ChevronRight className="ml-auto size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <div className="px-1 pb-2 space-y-2">
              {/* Player card */}
              <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-card/50 p-2">
                <img
                  src={getPokemonSpriteUrl(activePokemonId)}
                  alt={pokemon.name}
                  className="size-10 pixelated"
                  draggable={false}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    {title}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      Lv.{buddyLevel} {pokemon.name}
                    </span>
                  </div>
                  {/* XP bar */}
                  <div className="mt-1">
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${(buddyXp / xpNeeded) * 100}%` }}
                      />
                    </div>
                    <div className="text-[8px] text-muted-foreground/70 mt-0.5">
                      {buddyXp}/{xpNeeded} XP to next level
                    </div>
                  </div>
                </div>
              </div>

              {/* Key metrics */}
              <div className="space-y-0.5">
                <StatCard
                  icon={Target}
                  label="Queries Run"
                  value={formatNumber(totalQueries)}
                  subtitle={`${successRate}% success rate`}
                  color="#6b8cf5"
                />
                <StatCard
                  icon={Database}
                  label="Rows Fetched"
                  value={formatNumber(totalRowsFetched)}
                  subtitle={totalRowsFetched > 0 ? getRowComparison(totalRowsFetched) : undefined}
                  color="#78C850"
                />
                <StatCard
                  icon={Zap}
                  label="Fastest Query"
                  value={fastestQueryMs < 0 ? '—' : formatDuration(fastestQueryMs)}
                  subtitle={
                    slowestQueryMs > 0 ? `Slowest: ${formatDuration(slowestQueryMs)}` : undefined
                  }
                  color="#F8D030"
                />
                <StatCard
                  icon={Flame}
                  label="Current Streak"
                  value={`${currentStreak} ${currentStreak === 1 ? 'query' : 'queries'}`}
                  subtitle={bestStreak > 0 ? `Best: ${bestStreak} in a row` : undefined}
                  color="#F08030"
                />
                <StatCard
                  icon={Clock}
                  label="Total Query Time"
                  value={formatDuration(totalQueryTimeMs)}
                  subtitle={`Avg: ${avgQueryTime} per query`}
                  color="#A040A0"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Error Count"
                  value={failedQueries.toString()}
                  subtitle={
                    failedQueries > 0
                      ? `${((failedQueries / totalQueries) * 100).toFixed(1)}% error rate`
                      : 'Perfect record!'
                  }
                  color={failedQueries > 0 ? '#C03028' : '#78C850'}
                />
              </div>

              {/* Achievements section */}
              <button
                onClick={() => setShowAchievements(!showAchievements)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent/50 transition-colors"
              >
                <Trophy className="size-3.5 text-yellow-500" />
                Achievements ({achievements.length}/{ACHIEVEMENTS.length})
                <ChevronRight
                  className={cn(
                    'ml-auto size-3 transition-transform',
                    showAchievements && 'rotate-90'
                  )}
                />
              </button>

              {showAchievements && (
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {ACHIEVEMENTS.map((achDef) => {
                    const unlocked = achievements.find((a) => a.id === achDef.id)
                    return (
                      <AchievementBadge
                        key={achDef.id}
                        achievement={unlocked ?? achDef}
                        unlocked={!!unlocked}
                      />
                    )
                  })}
                </div>
              )}

              {/* Reset button */}
              {totalQueries > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Reset all fun stats? Your Pokemon buddy will go back to Lv.1!')) {
                      resetStats()
                    }
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/30 transition-colors"
                >
                  <RotateCcw className="size-3" />
                  Reset Stats
                </button>
              )}
            </div>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
