import * as React from 'react'
import { Check } from 'lucide-react'
import type { CellCopyEvent, CellGridGeometry } from './cell-grid-types'

interface CopyFlashProps {
  /** Latest copy event; null when nothing to flash. Each fire is a fresh envelope. */
  event: CellCopyEvent | null
  geometry: CellGridGeometry
}

/**
 * Floating "Copied" pill anchored to the copied cell. Re-triggers whenever the
 * event reference changes, so back-to-back copies on the same cell re-fire.
 */
export const CopyFlash = React.memo(function CopyFlash({ event, geometry }: CopyFlashProps) {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (!event) return
    setVisible(true)
    const timeout = window.setTimeout(() => setVisible(false), 900)
    return () => window.clearTimeout(timeout)
  }, [event])

  if (!event || !visible) return null

  const { pos } = event
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
          background: 'var(--cell-flash-bg)',
          color: 'var(--cell-flash-fg)',
          boxShadow: 'var(--cell-flash-shadow)'
        }}
      >
        <Check size={10} strokeWidth={3} />
        copied
      </div>
    </div>
  )
})
