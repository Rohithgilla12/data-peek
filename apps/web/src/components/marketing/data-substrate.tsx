'use client'

import { useEffect, useRef } from 'react'

const data = [
  ['a3f7c291-4e2b', '2026-03-18T09:14:22Z', 'dev@acme.io', '200', '142', 'true'],
  ['b8e1d453-7a9f', '2026-03-18T09:13:58Z', 'ops@startup.co', '201', '89', 'true'],
  ['c2d4f876-1b3e', '2026-03-18T09:13:41Z', 'admin@corp.dev', '500', '2341', 'false'],
  ['d9a2c134-5e8d', '2026-03-18T09:12:09Z', 'api@tools.io', '200', '67', 'true'],
  ['e5f3b798-2c4a', '2026-03-18T09:11:33Z', 'test@demo.dev', '404', '12', 'false'],
  ['f1c8e267-9d5b', '2026-03-18T09:10:55Z', 'root@db.local', '200', '203', 'true'],
  ['a7d9f342-6e1c', '2026-03-18T09:10:12Z', 'user@app.run', '301', '45', 'true'],
  ['b4e2a895-3f7d', '2026-03-18T09:09:48Z', 'ci@build.dev', '200', '178', 'true'],
  ['c6f1d438-8a2e', '2026-03-18T09:08:27Z', 'sys@infra.co', '502', '5012', 'false'],
  ['d3a7e569-1c4f', '2026-03-18T09:07:59Z', 'dev@local.test', '200', '31', 'true'],
  ['e8b2c714-5d9a', '2026-03-18T09:06:33Z', 'qa@staging.io', '200', '92', 'true'],
  ['f2d4a896-7e3b', '2026-03-18T09:05:11Z', 'bot@cron.dev', '200', '156', 'true'],
  ['a1c3e578-9f2d', '2026-03-18T09:04:44Z', 'svc@mesh.run', '429', '0', 'false'],
  ['b5d7f139-4a6e', '2026-03-18T09:03:28Z', 'cli@term.local', '200', '88', 'true'],
  ['c9e1a352-8b4f', '2026-03-18T09:02:15Z', 'pg@data.peek', '200', '23', 'true'],
  ['d6f2b473-1c8a', '2026-03-18T09:01:02Z', 'ws@live.stream', '101', '7', 'true'],
  ['e4a8c695-3d2b', '2026-03-18T09:00:39Z', 'rpc@api.grpc', '200', '134', 'true'],
  ['f7b1d834-6e5c', '2026-03-18T08:59:17Z', 'job@queue.dev', '200', '267', 'true'],
  ['a2c9e416-8f3d', '2026-03-18T08:58:44Z', 'auth@sso.corp', '403', '0', 'false'],
  ['b6d3f578-2a7e', '2026-03-18T08:57:21Z', 'cdn@edge.fast', '200', '4', 'true'],
]

const flashIndices = [2, 7, 11, 15, 5, 18, 9, 13, 0, 16]

export function DataSubstrate() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let ticking = false

    function onScroll() {
      if (!ticking) {
        rafRef.current = requestAnimationFrame(() => {
          el!.style.setProperty('--scroll-y', String(window.scrollY))
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="absolute inset-0 flex flex-col justify-center gap-[2px] px-4 data-substrate-parallax"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          lineHeight: '18px',
          opacity: 0.04,
          color: 'var(--color-text-muted)',
        }}
      >
        {data.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 whitespace-nowrap">
            {row.map((cell, cellIndex) => (
              <span
                key={cellIndex}
                className={`min-w-[80px] ${flashIndices.includes(rowIndex) && cellIndex === (rowIndex * 3 + 1) % 6 ? 'data-flash' : ''}`}
                style={
                  flashIndices.includes(rowIndex) && cellIndex === (rowIndex * 3 + 1) % 6
                    ? { animationDelay: `${(rowIndex * 2.7 + cellIndex * 1.3) % 30}s` }
                    : undefined
                }
              >
                {cell}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
