import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Pokemon data with their types, moves, and sprite IDs
export interface PokemonData {
  id: number
  name: string
  types: string[]
  moves: PokemonMove[]
}

export interface PokemonMove {
  name: string
  type: string
  description: string
}

// Achievement definitions
export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlockedAt?: number
}

export type BuddyMood = 'idle' | 'happy' | 'sad' | 'excited' | 'sleeping' | 'attacking'

// Available starter Pokemon with their moves
export const POKEMON_ROSTER: PokemonData[] = [
  {
    id: 25,
    name: 'Pikachu',
    types: ['electric'],
    moves: [
      { name: 'Thunderbolt', type: 'electric', description: 'A strong electric blast!' },
      { name: 'Quick Attack', type: 'normal', description: 'Strikes first with speed!' },
      { name: 'Iron Tail', type: 'steel', description: 'Slams with a hardened tail!' },
      { name: 'Volt Tackle', type: 'electric', description: 'A reckless full-body charge!' }
    ]
  },
  {
    id: 1,
    name: 'Bulbasaur',
    types: ['grass', 'poison'],
    moves: [
      { name: 'Vine Whip', type: 'grass', description: 'Strikes with slender vines!' },
      { name: 'Razor Leaf', type: 'grass', description: 'Launches sharp leaves!' },
      { name: 'Solar Beam', type: 'grass', description: 'A powerful beam of light!' },
      { name: 'Sludge Bomb', type: 'poison', description: 'Hurls toxic sludge!' }
    ]
  },
  {
    id: 4,
    name: 'Charmander',
    types: ['fire'],
    moves: [
      { name: 'Flamethrower', type: 'fire', description: 'A scorching blast of fire!' },
      { name: 'Dragon Rage', type: 'dragon', description: 'A fierce dragon attack!' },
      { name: 'Slash', type: 'normal', description: 'Slashes with sharp claws!' },
      { name: 'Fire Spin', type: 'fire', description: 'Traps foe in a fire vortex!' }
    ]
  },
  {
    id: 7,
    name: 'Squirtle',
    types: ['water'],
    moves: [
      { name: 'Water Gun', type: 'water', description: 'Shoots water at the foe!' },
      { name: 'Bubble Beam', type: 'water', description: 'Fires concentrated bubbles!' },
      { name: 'Skull Bash', type: 'normal', description: 'Tucks in, then rams!' },
      { name: 'Hydro Pump', type: 'water', description: 'A huge volume of water!' }
    ]
  },
  {
    id: 133,
    name: 'Eevee',
    types: ['normal'],
    moves: [
      { name: 'Swift', type: 'normal', description: 'Star-shaped rays that never miss!' },
      { name: 'Bite', type: 'dark', description: 'Bites with sharp fangs!' },
      { name: 'Shadow Ball', type: 'ghost', description: 'A shadowy blob attack!' },
      { name: 'Last Resort', type: 'normal', description: 'An all-out attack!' }
    ]
  },
  {
    id: 39,
    name: 'Jigglypuff',
    types: ['normal', 'fairy'],
    moves: [
      { name: 'Sing', type: 'normal', description: 'Lulls the foe to sleep!' },
      { name: 'Pound', type: 'normal', description: 'Pounds with stubby arms!' },
      { name: 'Rollout', type: 'rock', description: 'Rolls into the foe!' },
      { name: 'Hyper Voice', type: 'normal', description: 'An earsplitting shout!' }
    ]
  },
  {
    id: 143,
    name: 'Snorlax',
    types: ['normal'],
    moves: [
      { name: 'Body Slam', type: 'normal', description: 'A full-body slam!' },
      { name: 'Rest', type: 'psychic', description: 'Sleeps to restore HP!' },
      { name: 'Hyper Beam', type: 'normal', description: 'A destructive beam attack!' },
      { name: 'Crunch', type: 'dark', description: 'Crunches with sharp fangs!' }
    ]
  },
  {
    id: 150,
    name: 'Mewtwo',
    types: ['psychic'],
    moves: [
      { name: 'Psychic', type: 'psychic', description: 'A powerful psychic attack!' },
      { name: 'Shadow Ball', type: 'ghost', description: 'A shadowy blob attack!' },
      { name: 'Aura Sphere', type: 'fighting', description: 'A blast of aura power!' },
      { name: 'Psystrike', type: 'psychic', description: 'A peculiar psychic wave!' }
    ]
  }
]

// Fun titles based on query count
export function getQueryTitle(count: number): { title: string; rank: number } {
  if (count >= 10000) return { title: 'SQL Deity', rank: 10 }
  if (count >= 5000) return { title: 'Query Grandmaster', rank: 9 }
  if (count >= 2000) return { title: 'Database Wizard', rank: 8 }
  if (count >= 1000) return { title: 'SQL Sorcerer', rank: 7 }
  if (count >= 500) return { title: 'Data Alchemist', rank: 6 }
  if (count >= 200) return { title: 'Query Knight', rank: 5 }
  if (count >= 100) return { title: 'Table Turner', rank: 4 }
  if (count >= 50) return { title: 'Row Wrangler', rank: 3 }
  if (count >= 20) return { title: 'SELECT Star', rank: 2 }
  if (count >= 5) return { title: 'Query Padawan', rank: 1 }
  return { title: 'Fresh DBA', rank: 0 }
}

// Fun row count comparisons
export function getRowComparison(totalRows: number): string {
  if (totalRows >= 10_000_000)
    return `enough rows to fill ${Math.floor(totalRows / 200_000)} phone books`
  if (totalRows >= 1_000_000)
    return `${(totalRows / 1_000_000).toFixed(1)}M rows — a small country's census`
  if (totalRows >= 100_000) return `more rows than seats in a football stadium`
  if (totalRows >= 10_000)
    return `${(totalRows / 1000).toFixed(1)}K rows — a small town's population`
  if (totalRows >= 1000) return `like reading a 1000-page book of data`
  if (totalRows >= 100) return `a respectable spreadsheet's worth`
  if (totalRows >= 10) return `a handful of data nuggets`
  return `just getting started!`
}

// XP required for each level
export function xpForLevel(level: number): number {
  return Math.floor(10 * Math.pow(1.5, level - 1))
}

// All possible achievements
export const ACHIEVEMENTS: Omit<Achievement, 'unlockedAt'>[] = [
  { id: 'first_query', name: 'Hello World', description: 'Run your first query', icon: '🎯' },
  {
    id: 'ten_queries',
    name: 'Getting Warmed Up',
    description: 'Run 10 queries',
    icon: '🔥'
  },
  {
    id: 'hundred_queries',
    name: 'Century Club',
    description: 'Run 100 queries',
    icon: '💯'
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Execute a query under 10ms',
    icon: '⚡'
  },
  {
    id: 'big_data',
    name: 'Big Data Energy',
    description: 'Fetch 10,000+ rows in one query',
    icon: '📊'
  },
  {
    id: 'streak_5',
    name: 'On Fire',
    description: '5 successful queries in a row',
    icon: '🔥'
  },
  {
    id: 'streak_20',
    name: 'Unstoppable',
    description: '20 successful queries in a row',
    icon: '🚀'
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Query after midnight',
    icon: '🦉'
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Query before 6 AM',
    icon: '🐤'
  },
  {
    id: 'error_recovery',
    name: 'Resilient',
    description: 'Succeed after 3 consecutive errors',
    icon: '💪'
  },
  {
    id: 'pokemon_master',
    name: 'Pokemon Master',
    description: 'Try all Pokemon buddies',
    icon: '🏆'
  },
  {
    id: 'level_10',
    name: 'Double Digits',
    description: 'Reach buddy level 10',
    icon: '⭐'
  }
]

interface PokemonBuddyState {
  // Pokemon state
  activePokemonId: number
  buddyLevel: number
  buddyXp: number
  mood: BuddyMood
  isVisible: boolean
  showMoveAnimation: string | null
  positionX: number // 0-100 percentage position

  // Fun analytics
  totalQueries: number
  successfulQueries: number
  failedQueries: number
  totalRowsFetched: number
  fastestQueryMs: number
  slowestQueryMs: number
  currentStreak: number
  bestStreak: number
  totalQueryTimeMs: number
  consecutiveErrors: number
  triedPokemon: number[]

  // Achievements
  achievements: Achievement[]

  // Notification for new achievements
  latestAchievement: Achievement | null

  // Actions
  setPokemon: (id: number) => void
  setMood: (mood: BuddyMood) => void
  setVisible: (visible: boolean) => void
  setPositionX: (x: number) => void
  triggerMove: (moveName: string) => void
  clearMoveAnimation: () => void

  // Analytics actions
  recordQuerySuccess: (durationMs: number, rowCount: number) => void
  recordQueryError: () => void
  dismissAchievement: () => void
  resetStats: () => void
}

// Single mood-reset timer — cleared and re-set on each mood change to avoid races
let moodResetTimer: ReturnType<typeof setTimeout> | null = null

function scheduleMoodReset(set: (s: Partial<PokemonBuddyState>) => void, delayMs = 2000) {
  if (moodResetTimer) clearTimeout(moodResetTimer)
  moodResetTimer = setTimeout(() => {
    moodResetTimer = null
    set({ mood: 'idle' })
  }, delayMs)
}

export const usePokemonBuddyStore = create<PokemonBuddyState>()(
  persist(
    (set, get) => ({
      // Initial state
      activePokemonId: 25,
      buddyLevel: 1,
      buddyXp: 0,
      mood: 'idle',
      isVisible: true,
      showMoveAnimation: null,
      positionX: 80,

      // Analytics
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      totalRowsFetched: 0,
      fastestQueryMs: -1,
      slowestQueryMs: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalQueryTimeMs: 0,
      consecutiveErrors: 0,
      triedPokemon: [],

      // Achievements
      achievements: [],
      latestAchievement: null,

      // Actions
      setPokemon: (id) => {
        const state = get()
        const newTriedPokemon = state.triedPokemon.includes(id)
          ? state.triedPokemon
          : [...state.triedPokemon, id]

        set({
          activePokemonId: id,
          mood: 'happy',
          triedPokemon: newTriedPokemon
        })

        // Check pokemon master achievement
        if (newTriedPokemon.length >= POKEMON_ROSTER.length) {
          const existing = state.achievements.find((a) => a.id === 'pokemon_master')
          if (!existing) {
            const achievement: Achievement = {
              ...ACHIEVEMENTS.find((a) => a.id === 'pokemon_master')!,
              unlockedAt: Date.now()
            }
            set({
              achievements: [...state.achievements, achievement],
              latestAchievement: achievement
            })
          }
        }

        scheduleMoodReset(set)
      },

      setMood: (mood) => set({ mood }),
      setVisible: (visible) => set({ isVisible: visible }),
      setPositionX: (x) => set({ positionX: Math.max(0, Math.min(100, x)) }),

      triggerMove: (moveName) => {
        set({ showMoveAnimation: moveName, mood: 'attacking' })
        scheduleMoodReset((partial) => set({ ...partial, showMoveAnimation: null }), 1500)
      },

      clearMoveAnimation: () => set({ showMoveAnimation: null }),

      recordQuerySuccess: (durationMs, rowCount) => {
        const state = get()
        const newTotal = state.totalQueries + 1
        const newSuccessful = state.successfulQueries + 1
        const newStreak = state.currentStreak + 1
        const newBestStreak = Math.max(state.bestStreak, newStreak)
        const newTotalRows = state.totalRowsFetched + rowCount
        const newFastest =
          state.fastestQueryMs < 0 ? durationMs : Math.min(state.fastestQueryMs, durationMs)
        const newSlowest = Math.max(state.slowestQueryMs, durationMs)
        const wasConsecutiveErrors = state.consecutiveErrors >= 3

        // Calculate XP: base 1 + bonus for speed + bonus for rows
        let xpGained = 1
        if (durationMs < 100) xpGained += 1
        if (durationMs < 10) xpGained += 2
        if (rowCount > 1000) xpGained += 1
        if (rowCount > 10000) xpGained += 2

        let newXp = state.buddyXp + xpGained
        let newLevel = state.buddyLevel
        while (newXp >= xpForLevel(newLevel)) {
          newXp -= xpForLevel(newLevel)
          newLevel++
        }

        const newMood = durationMs < 100 ? 'excited' : 'happy'

        const update: Partial<PokemonBuddyState> = {
          totalQueries: newTotal,
          successfulQueries: newSuccessful,
          totalRowsFetched: newTotalRows,
          fastestQueryMs: newFastest,
          slowestQueryMs: newSlowest,
          currentStreak: newStreak,
          bestStreak: newBestStreak,
          totalQueryTimeMs: state.totalQueryTimeMs + durationMs,
          consecutiveErrors: 0,
          buddyXp: newXp,
          buddyLevel: newLevel,
          mood: newMood
        }

        // Check achievements
        const newAchievements = [...state.achievements]
        let latestAchievement: Achievement | null = null

        const checkAchievement = (id: string) => {
          if (!newAchievements.find((a) => a.id === id)) {
            const def = ACHIEVEMENTS.find((a) => a.id === id)
            if (def) {
              const ach = { ...def, unlockedAt: Date.now() }
              newAchievements.push(ach)
              latestAchievement = ach
            }
          }
        }

        if (newTotal === 1) checkAchievement('first_query')
        if (newTotal >= 10) checkAchievement('ten_queries')
        if (newTotal >= 100) checkAchievement('hundred_queries')
        if (durationMs < 10) checkAchievement('speed_demon')
        if (rowCount >= 10000) checkAchievement('big_data')
        if (newStreak >= 5) checkAchievement('streak_5')
        if (newStreak >= 20) checkAchievement('streak_20')
        if (newLevel >= 10) checkAchievement('level_10')
        if (wasConsecutiveErrors) checkAchievement('error_recovery')

        const hour = new Date().getHours()
        if (hour >= 0 && hour < 4) checkAchievement('night_owl')
        if (hour >= 4 && hour < 6) checkAchievement('early_bird')

        update.achievements = newAchievements
        if (latestAchievement) update.latestAchievement = latestAchievement

        set(update)

        // Reset mood after delay
        scheduleMoodReset(set)
      },

      recordQueryError: () => {
        const state = get()
        set({
          totalQueries: state.totalQueries + 1,
          failedQueries: state.failedQueries + 1,
          currentStreak: 0,
          consecutiveErrors: state.consecutiveErrors + 1,
          mood: 'sad'
        })

        scheduleMoodReset(set, 3000)
      },

      dismissAchievement: () => set({ latestAchievement: null }),

      resetStats: () =>
        set({
          totalQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          totalRowsFetched: 0,
          fastestQueryMs: -1,
          slowestQueryMs: 0,
          currentStreak: 0,
          bestStreak: 0,
          totalQueryTimeMs: 0,
          consecutiveErrors: 0,
          buddyLevel: 1,
          buddyXp: 0,
          achievements: []
        })
    }),
    {
      name: 'data-peek-pokemon-buddy',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activePokemonId: state.activePokemonId,
        buddyLevel: state.buddyLevel,
        buddyXp: state.buddyXp,
        isVisible: state.isVisible,
        positionX: state.positionX,
        totalQueries: state.totalQueries,
        successfulQueries: state.successfulQueries,
        failedQueries: state.failedQueries,
        totalRowsFetched: state.totalRowsFetched,
        fastestQueryMs: state.fastestQueryMs,
        slowestQueryMs: state.slowestQueryMs,
        currentStreak: state.currentStreak,
        bestStreak: state.bestStreak,
        totalQueryTimeMs: state.totalQueryTimeMs,
        triedPokemon: state.triedPokemon,
        achievements: state.achievements
      })
    }
  )
)

// Helper to get active Pokemon data
export function getActivePokemon(id: number): PokemonData {
  return POKEMON_ROSTER.find((p) => p.id === id) ?? POKEMON_ROSTER[0]
}

// Local sprite imports — bundled so the app works offline
const staticSprites = import.meta.glob('@/assets/sprites/static/*.png', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const animatedSprites = import.meta.glob('@/assets/sprites/animated/*.gif', {
  eager: true,
  import: 'default'
}) as Record<string, string>

export function getPokemonSpriteUrl(pokemonId: number, animated = false): string {
  if (animated) {
    const key = Object.keys(animatedSprites).find((k) => k.endsWith(`/${pokemonId}.gif`))
    if (key) return animatedSprites[key]
  }
  const key = Object.keys(staticSprites).find((k) => k.endsWith(`/${pokemonId}.png`))
  return key ? staticSprites[key] : ''
}

// Type color mapping for moves
export function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    normal: '#A8A878',
    fire: '#F08030',
    water: '#6890F0',
    electric: '#F8D030',
    grass: '#78C850',
    ice: '#98D8D8',
    fighting: '#C03028',
    poison: '#A040A0',
    ground: '#E0C068',
    flying: '#A890F0',
    psychic: '#F85888',
    bug: '#A8B820',
    rock: '#B8A038',
    ghost: '#705898',
    dragon: '#7038F8',
    dark: '#705848',
    steel: '#B8B8D0',
    fairy: '#EE99AC'
  }
  return colors[type] ?? '#A8A878'
}
