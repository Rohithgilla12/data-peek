'use client'

import { motion, useMotionValue, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Globe } from 'lucide-react'

const POKEMON_SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/25.gif"

type Mood = 'idle' | 'happy' | 'excited' | 'sleeping' | 'drag'

export function PokemonBuddy() {
  const [mood, setMood] = useState<Mood>('idle')
  const [isVisible, setIsVisible] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  
  useEffect(() => {
    // Show after a delay
    const timer = setTimeout(() => setIsVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Randomized moods
  useEffect(() => {
    if (!isVisible || mood === 'drag') return

    const interval = setInterval(() => {
      const rand = Math.random()
      if (rand > 0.8) setMood('happy')
      else if (rand > 0.95) setMood('excited')
      else if (rand > 0.7) setMood('sleeping')
      else setMood('idle')

      // Reset mood after 2s
      setTimeout(() => setMood('idle'), 2000)
    }, 8000)

    return () => clearInterval(interval)
  }, [isVisible, mood])

  const handleDragStart = () => {
    setMood('drag')
    setMessage("Wheee! You're moving me!")
  }

  const handleDragEnd = () => {
    setMood('happy')
    setTimeout(() => {
      setMood('idle')
      setMessage(null)
    }, 2000)
  }

  const handleClick = () => {
    setIsExpanded(!isExpanded)
    setMood('excited')
    setMessage("I'm your data-peek helper!")
    setTimeout(() => setMessage(null), 3000)
  }

  if (!isVisible) return null

  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-4 pointer-events-none">
      {/* Speech Bubble */}
      <AnimatePresence>
        {(message || isExpanded) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            {...({ className: "pointer-events-auto glass p-4 rounded-2xl border-white/20 shadow-2xl max-w-[200px]" } as any)}
          >
            <div className="text-[11px] font-mono text-[--color-text-secondary] leading-relaxed">
              {message || "Hey! I'm Pikachu. I love helping developers peek at their data. Try grabbing me!"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Sprite */}
      <motion.div
        drag
        dragConstraints={{ left: -500, right: 0, top: -500, bottom: 0 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        {...({ 
          className: `pointer-events-auto relative group cursor-grab active:cursor-grabbing ${
            mood === 'happy' ? 'animate-bounce' : ''
          } ${mood === 'excited' ? 'animate-spin' : ''} ${
            mood === 'sleeping' ? 'opacity-60 grayscale-[0.5]' : ''
          }`
        } as any)}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1.5 }}
        whileHover={{ scale: 1.8 }}
        whileDrag={{ scale: 2, rotate: 10 }}
      >
        {/* Glow effect */}
        <div className="absolute inset-0 bg-yellow-400/20 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <img
          src={POKEMON_SPRITE}
          alt="Pokemon Buddy"
          className="relative w-12 h-12 pixelated select-none"
          draggable={false}
        />

        {/* Status indicator */}
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-[#0a0a0b] shadow-sm" />
      </motion.div>
    </div>
  )
}
