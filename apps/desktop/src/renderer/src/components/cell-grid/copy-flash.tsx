import * as React from 'react'
import { Check } from 'lucide-react'
import type { CellPosition, CellGridGeometry } from './cell-grid-context'

interface CopyFlashProps {
  /** Cell that was copied — null when nothing to flash */
  pos: CellPosition | null
  /** Increments each time a copy event fires so the same cell can re-flash */
  nonce: number
  geometry: CellGridGeometry
}

/**
 * Briefly surfaces a "Copied" pill at the focused cell — replaces the need for
 * a global toast library. Rises ~12px and fades in 900ms.
 */
export const CopyFlash = React.memo(function CopyFlash({
  pos,
  nonce,
  geometry
}: CopyFlashProps) {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (!pos) return
    setVisible(true)
    const timeout = window.setTimeout(() => setVisible(false), 900)
    return () => window.clearTimeout(timeout)
    // re-run on every copy nonce, even for same pos
  }, [pos, nonce])

  if (!pos || !visible) return null

  const { rowHeight, columnWidths, columnOffsets, headerHeight } = geometry
  const w = columnWidths[pos.col] ?? 0
  if (w === 0) return null

  const x = (columnOffsets[pos.col] ?? 0) + w / 2
  const y = headerHeight + pos.row * rowHeight - 4

  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`,
        zIndex: 25,
        pointerEvents: 'none'
      }}
    >
      <div
        className="copy-flash-pill"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px 2px 6px',
          borderRadius: 999,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          background: 'oklch(0.65 0.15 250)',
          color: 'oklch(0.99 0 0)',
          boxShadow: '0 4px 12px -4px oklch(0.65 0.15 250 / 0.5)'
        }}
      >
        <Check size={10} strokeWidth={3} />
        copied
      </div>
    </div>
  )
})
