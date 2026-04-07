'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTypewriter } from '@/hooks/use-typewriter'

interface Scene {
  query: string
  mobileQuery?: string
  results: {
    columns: string[]
    mobileColumns?: string[]
    rows: string[][]
    mobileRows?: string[][]
  }
}

const scenes: Scene[] = [
  {
    query: `SELECT name, status, latency_ms FROM services WHERE status != 'healthy' ORDER BY latency_ms DESC LIMIT 5;`,
    mobileQuery: `SELECT name, status FROM services WHERE status != 'healthy' LIMIT 5;`,
    results: {
      columns: ['name', 'status', 'latency_ms'],
      mobileColumns: ['name', 'status'],
      rows: [
        ['payment-api', 'degraded', '847'],
        ['auth-service', 'warning', '423'],
        ['email-worker', 'degraded', '389'],
        ['search-index', 'warning', '256'],
        ['cdn-proxy', 'warning', '198'],
      ],
      mobileRows: [
        ['payment-api', 'degraded'],
        ['auth-service', 'warning'],
        ['email-worker', 'degraded'],
        ['search-index', 'warning'],
        ['cdn-proxy', 'warning'],
      ],
    },
  },
  {
    query: `EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'dev@example.com';`,
    mobileQuery: `EXPLAIN SELECT * FROM users WHERE email = 'dev@example.com';`,
    results: {
      columns: ['QUERY PLAN'],
      rows: [
        ['Index Scan using idx_users_email on users'],
        ['  Index Cond: (email = \'dev@example.com\')'],
        ['  Rows Removed by Filter: 0'],
        ['Planning Time: 0.084 ms'],
        ['Execution Time: 0.031 ms'],
      ],
      mobileRows: [
        ['Index Scan using idx_users_email'],
        ['  Index Cond: (email = ...)'],
        ['Planning Time: 0.084 ms'],
        ['Execution Time: 0.031 ms'],
      ],
    },
  },
  {
    query: `SELECT date, COUNT(*) as signups FROM users GROUP BY date ORDER BY date DESC LIMIT 7;`,
    mobileQuery: `SELECT date, COUNT(*) as signups FROM users GROUP BY date LIMIT 5;`,
    results: {
      columns: ['date', 'signups', ''],
      mobileColumns: ['date', 'signups', ''],
      rows: [
        ['2026-03-18', '142', '██████████████████ '],
        ['2026-03-17', '128', '████████████████   '],
        ['2026-03-16', '95',  '████████████       '],
        ['2026-03-15', '167', '█████████████████████'],
        ['2026-03-14', '113', '██████████████     '],
        ['2026-03-13', '89',  '███████████        '],
        ['2026-03-12', '134', '█████████████████  '],
      ],
      mobileRows: [
        ['03-18', '142', '██████████████ '],
        ['03-17', '128', '████████████   '],
        ['03-16', '95',  '█████████      '],
        ['03-15', '167', '████████████████'],
        ['03-14', '113', '██████████     '],
      ],
    },
  },
]

function StatusBadge({ value }: { value: string }) {
  if (value === 'degraded') {
    return <span className="text-[--color-error]">{value}</span>
  }
  if (value === 'warning') {
    return <span className="text-[--color-warning]">{value}</span>
  }
  if (value === 'healthy') {
    return <span className="text-[--color-success]">{value}</span>
  }
  return <span>{value}</span>
}

function CellValue({ value, column }: { value: string; column: string }) {
  if (column === 'status') return <StatusBadge value={value} />
  if (column === '' && value.includes('█')) {
    return <span className="text-[--color-accent] opacity-70">{value}</span>
  }
  if (column === 'QUERY PLAN') {
    if (value.startsWith('  ')) {
      return <span className="text-[--color-text-secondary]">{value}</span>
    }
    if (value.includes('Time:')) {
      return (
        <span>
          <span className="text-[--color-text-secondary]">{value.split(':')[0]}:</span>
          <span className="text-[--color-success]">{value.split(':')[1]}</span>
        </span>
      )
    }
    return <span className="text-[--color-accent]">{value}</span>
  }
  return <span>{value}</span>
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia(reducedMotionQuery)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getReducedMotion() {
  return window.matchMedia(reducedMotionQuery).matches
}

function getReducedMotionServer() {
  return false
}

function subscribeResize(callback: () => void) {
  window.addEventListener('resize', callback)
  return () => window.removeEventListener('resize', callback)
}

function getIsMobile() {
  return window.innerWidth < 640
}

function getIsMobileServer() {
  return false
}

export function HeroTerminal() {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'executing' | 'results' | 'pause'>('typing')
  const [visibleRows, setVisibleRows] = useState(0)
  const isMobile = useSyncExternalStore(subscribeResize, getIsMobile, getIsMobileServer)
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServer,
  )
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const scene = scenes[sceneIndex]

  const queryText = isMobile && scene.mobileQuery ? scene.mobileQuery : scene.query
  const columns = isMobile && scene.results.mobileColumns ? scene.results.mobileColumns : scene.results.columns
  const rows = isMobile && scene.results.mobileRows ? scene.results.mobileRows : scene.results.rows

  const handleTypingComplete = useCallback(() => {
    if (prefersReducedMotion) {
      setPhase('results')
      setVisibleRows(rows.length)
      return
    }

    setPhase('executing')
    setTimeout(() => {
      setPhase('results')
      setVisibleRows(0)
    }, 400)
  }, [rows.length, prefersReducedMotion])

  const { text: typedQuery, isComplete: typingDone } = useTypewriter({
    text: queryText,
    startDelay: sceneIndex === 0 ? 600 : 200,
    onComplete: handleTypingComplete,
  })

  useEffect(() => {
    if (phase !== 'results') return
    if (prefersReducedMotion) return

    if (visibleRows < rows.length) {
      const timer = setTimeout(() => {
        setVisibleRows((v) => v + 1)
      }, 60)
      return () => clearTimeout(timer)
    }

    sceneTimerRef.current = setTimeout(() => {
      setPhase('pause')
      setTimeout(() => {
        setSceneIndex((i) => (i + 1) % scenes.length)
        setPhase('typing')
        setVisibleRows(0)
      }, 300)
    }, 3500)

    return () => {
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current)
    }
  }, [phase, visibleRows, rows.length, prefersReducedMotion])

  const showCursor = phase === 'typing' && !typingDone
  const showResults = phase === 'results' || (prefersReducedMotion && typingDone)

  const executingDots = useMemo(() => {
    if (phase !== 'executing') return ''
    return '...'
  }, [phase])

  return (
    <div className="w-full bg-[--color-background] overflow-hidden">
      <div className="flex flex-col">
        {/* Editor pane */}
        <div className="p-3 sm:p-4 md:p-5 border-b border-[--color-border-subtle]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[--color-text-muted]">
              query
            </span>
            <span className="text-[9px] sm:text-[10px] text-[--color-text-muted] opacity-50">
              {sceneIndex + 1}/{scenes.length}
            </span>
          </div>
          <pre className="text-xs sm:text-sm md:text-base leading-relaxed text-[--color-text-primary] whitespace-pre-wrap break-words">
            <span className="text-[--color-accent]">{'> '}</span>
            <span>{typedQuery}</span>
            {showCursor && (
              <span className="terminal-cursor inline-block w-[2px] h-[1em] bg-[--color-accent] ml-[1px] align-middle" />
            )}
          </pre>
        </div>

        {/* Results pane */}
        <div className="p-3 sm:p-4 md:p-5 min-h-[140px] sm:min-h-[180px]">
          {phase === 'executing' && (
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-[--color-text-muted]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[--color-accent] animate-pulse" />
              executing{executingDots}
            </div>
          )}

          {showResults && (
            <div className="text-[11px] sm:text-xs md:text-sm font-mono">
              {/* Column headers */}
              <div
                className="flex gap-2 sm:gap-4 pb-1.5 mb-1.5 border-b border-[--color-border-subtle] text-[--color-accent] font-medium"
                style={{
                  opacity: visibleRows > 0 || prefersReducedMotion ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {columns.map((col, i) => (
                  <span
                    key={i}
                    className={col === 'QUERY PLAN' ? 'flex-1' : 'min-w-[70px] sm:min-w-[100px]'}
                  >
                    {col}
                  </span>
                ))}
              </div>

              {/* Data rows */}
              {rows.map((row, rowIndex) => (
                <div
                  key={`${sceneIndex}-${rowIndex}`}
                  className="flex gap-2 sm:gap-4 py-0.5 sm:py-1 text-[--color-text-secondary]"
                  style={{
                    opacity: rowIndex < visibleRows ? 1 : 0,
                    transform: rowIndex < visibleRows ? 'translateY(0)' : 'translateY(6px)',
                    transition: 'opacity 0.25s ease, transform 0.25s ease',
                  }}
                >
                  {row.map((cell, cellIndex) => (
                    <span
                      key={cellIndex}
                      className={
                        columns[cellIndex] === 'QUERY PLAN'
                          ? 'flex-1 whitespace-pre'
                          : 'min-w-[70px] sm:min-w-[100px] truncate'
                      }
                    >
                      <CellValue value={cell} column={columns[cellIndex]} />
                    </span>
                  ))}
                </div>
              ))}

              {/* Row count */}
              {visibleRows >= rows.length && (
                <div
                  className="mt-3 pt-2 border-t border-[--color-border-subtle] text-[--color-text-muted] text-[10px] sm:text-xs"
                  style={{
                    opacity: 1,
                    animation: prefersReducedMotion
                      ? 'none'
                      : 'fade-in-up 0.3s ease forwards',
                  }}
                >
                  {rows.length} row{rows.length !== 1 ? 's' : ''} returned · 1.7ms
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
