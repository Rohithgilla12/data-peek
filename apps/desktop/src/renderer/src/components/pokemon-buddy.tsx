import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import {
  usePokemonBuddyStore,
  getActivePokemon,
  getPokemonSpriteUrl,
  getTypeColor,
  POKEMON_ROSTER,
  xpForLevel,
  type PokemonMove
} from '@/stores/pokemon-buddy-store'
import { cn } from '@/lib/utils'

// Move effect animation component
function MoveEffect({ move, onComplete }: { move: PokemonMove; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500)
    return () => clearTimeout(timer)
  }, [onComplete])

  const color = getTypeColor(move.type)

  return (
    <div className="pokemon-move-effect absolute -top-12 left-1/2 -translate-x-1/2 pointer-events-none">
      <div
        className="px-3 py-1.5 rounded-full text-xs font-bold text-white whitespace-nowrap animate-move-float"
        style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}80` }}
      >
        {move.name}!
      </div>
    </div>
  )
}

// Achievement toast
function AchievementToast({
  name,
  icon,
  description,
  onDismiss
}: {
  name: string
  icon: string
  description: string
  onDismiss: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="absolute -top-20 right-0 animate-achievement-pop">
      <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-card px-3 py-2 shadow-lg">
        <span className="text-lg">{icon}</span>
        <div className="min-w-0">
          <div className="text-xs font-bold text-yellow-400">{name}</div>
          <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
            {description}
          </div>
        </div>
      </div>
    </div>
  )
}

// Pokemon selector panel
function PokemonSelector({
  activePokemonId,
  onSelect,
  onClose
}: {
  activePokemonId: number
  onSelect: (id: number) => void
  onClose: () => void
}) {
  return (
    <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border border-border/50 bg-card p-3 shadow-xl animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">Choose Your Buddy</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {POKEMON_ROSTER.map((pokemon) => (
          <button
            key={pokemon.id}
            onClick={() => {
              onSelect(pokemon.id)
              onClose()
            }}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-md p-1.5 transition-all hover:bg-accent',
              activePokemonId === pokemon.id && 'bg-accent ring-1 ring-primary/50'
            )}
          >
            <img
              src={getPokemonSpriteUrl(pokemon.id)}
              alt={pokemon.name}
              className="size-10 pixelated"
              draggable={false}
            />
            <span className="text-[9px] text-muted-foreground leading-none">{pokemon.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Moves panel
function MovesPanel({
  moves,
  onUseMove,
  onClose
}: {
  moves: PokemonMove[]
  onUseMove: (move: PokemonMove) => void
  onClose: () => void
}) {
  return (
    <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg border border-border/50 bg-card p-3 shadow-xl animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">Moves</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {moves.map((move) => (
          <button
            key={move.name}
            onClick={() => {
              onUseMove(move)
              onClose()
            }}
            className="flex flex-col items-start rounded-md px-2 py-1.5 transition-all hover:brightness-110"
            style={{
              backgroundColor: `${getTypeColor(move.type)}20`,
              border: `1px solid ${getTypeColor(move.type)}40`
            }}
          >
            <span className="text-[10px] font-bold text-foreground">{move.name}</span>
            <span
              className="text-[8px] font-medium uppercase tracking-wider"
              style={{ color: getTypeColor(move.type) }}
            >
              {move.type}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function PokemonBuddy() {
  const {
    activePokemonId,
    buddyLevel,
    buddyXp,
    mood,
    isVisible,
    showMoveAnimation,
    positionX,
    latestAchievement,
    triggerMove,
    clearMoveAnimation,
    setPokemon,
    setVisible,
    dismissAchievement
  } = usePokemonBuddyStore()

  const [showSelector, setShowSelector] = useState(false)
  const [showMoves, setShowMoves] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startPos: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const pokemon = getActivePokemon(activePokemonId)
  const xpNeeded = xpForLevel(buddyLevel)
  const xpPercent = (buddyXp / xpNeeded) * 100

  // Animated sprite URL
  const spriteUrl = getPokemonSpriteUrl(activePokemonId, true)
  const fallbackUrl = getPokemonSpriteUrl(activePokemonId, false)
  const [currentSprite, setCurrentSprite] = useState(spriteUrl)

  // Walking animation - move the pokemon around slowly
  useEffect(() => {
    if (mood !== 'idle' || isDragging) return

    const walkInterval = setInterval(
      () => {
        const store = usePokemonBuddyStore.getState()
        const direction = Math.random() > 0.5 ? 1 : -1
        const distance = Math.random() * 8 + 2
        const newPos = Math.max(5, Math.min(95, store.positionX + direction * distance))
        usePokemonBuddyStore.setState({ positionX: newPos })
      },
      4000 + Math.random() * 3000
    )

    return () => clearInterval(walkInterval)
  }, [mood, isDragging])

  // Handle sprite load error - fallback to static
  const handleSpriteError = useCallback(() => {
    setCurrentSprite(fallbackUrl)
  }, [fallbackUrl])

  // Drag handling
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      dragRef.current = { startX: e.clientX, startPos: positionX }
    },
    [positionX]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const containerWidth = window.innerWidth
      const deltaX = e.clientX - dragRef.current.startX
      const deltaPercent = (deltaX / containerWidth) * 100
      const newPos = Math.max(5, Math.min(95, dragRef.current.startPos + deltaPercent))
      usePokemonBuddyStore.setState({ positionX: newPos })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      dragRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Find the active move for animation
  const activeMove = showMoveAnimation
    ? pokemon.moves.find((m) => m.name === showMoveAnimation)
    : null

  if (!isVisible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-3 right-3 z-50 rounded-full bg-card border border-border/50 p-1.5 shadow-md hover:bg-accent transition-colors"
        title="Show Pokemon Buddy"
      >
        <img src={fallbackUrl} alt={pokemon.name} className="size-6 pixelated" draggable={false} />
      </button>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-0 z-50 pointer-events-none"
      style={{ left: `${positionX}%`, transform: 'translateX(-50%)' }}
    >
      <div className="relative pointer-events-auto">
        {/* Achievement toast */}
        {latestAchievement && (
          <AchievementToast
            name={latestAchievement.name}
            icon={latestAchievement.icon}
            description={latestAchievement.description}
            onDismiss={dismissAchievement}
          />
        )}

        {/* Pokemon selector */}
        {showSelector && (
          <PokemonSelector
            activePokemonId={activePokemonId}
            onSelect={setPokemon}
            onClose={() => setShowSelector(false)}
          />
        )}

        {/* Moves panel */}
        {showMoves && (
          <MovesPanel
            moves={pokemon.moves}
            onUseMove={(move) => triggerMove(move.name)}
            onClose={() => setShowMoves(false)}
          />
        )}

        {/* Expanded info panel */}
        {isExpanded && (
          <div className="absolute bottom-full right-0 mb-2 w-48 rounded-lg border border-border/50 bg-card p-2.5 shadow-xl animate-fade-in-up">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-foreground">{pokemon.name}</span>
              <span className="text-[10px] text-muted-foreground">Lv.{buddyLevel}</span>
            </div>

            {/* XP bar */}
            <div className="mb-2">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-muted-foreground">
                  XP: {buddyXp}/{xpNeeded}
                </span>
              </div>
            </div>

            {/* Types */}
            <div className="flex gap-1 mb-2">
              {pokemon.types.map((type) => (
                <span
                  key={type}
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase text-white"
                  style={{ backgroundColor: getTypeColor(type) }}
                >
                  {type}
                </span>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setIsExpanded(false)
                  setShowMoves(true)
                }}
                className="flex-1 rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/80 transition-colors"
              >
                Moves
              </button>
              <button
                onClick={() => {
                  setIsExpanded(false)
                  setShowSelector(true)
                }}
                className="flex-1 rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/80 transition-colors"
              >
                Switch
              </button>
              <button
                onClick={() => setVisible(false)}
                className="rounded-md bg-accent p-1 text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors"
                title="Hide buddy"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        {/* Move effect animation */}
        {activeMove && <MoveEffect move={activeMove} onComplete={clearMoveAnimation} />}

        {/* The Pokemon sprite */}
        <div
          className={cn(
            'relative cursor-grab active:cursor-grabbing transition-transform',
            mood === 'happy' && 'pokemon-bounce',
            mood === 'excited' && 'pokemon-spin',
            mood === 'sad' && 'pokemon-sad',
            mood === 'attacking' && 'pokemon-attack',
            mood === 'sleeping' && 'pokemon-sleep',
            mood === 'idle' && 'pokemon-idle'
          )}
          onMouseDown={handleMouseDown}
          onClick={(e) => {
            if (!isDragging) {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
              setShowSelector(false)
              setShowMoves(false)
            }
          }}
        >
          <img
            src={currentSprite}
            alt={pokemon.name}
            className="size-16 pixelated drop-shadow-lg select-none"
            draggable={false}
            onError={handleSpriteError}
          />
          {/* Level badge */}
          <div className="absolute -top-1 -right-1 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold text-primary-foreground shadow-sm">
            {buddyLevel}
          </div>
        </div>
      </div>
    </div>
  )
}
