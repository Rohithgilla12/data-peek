import {
  type CellPosition,
  type CellSelection,
  type CellSnapshot,
  iterateSelection
} from './cell-grid-types'

export interface SelectionStats {
  cellCount: number
  numericCount: number
  sum?: number
  avg?: number
  min?: number
  max?: number
  distinctCount: number
  nullCount: number
  hasMasked?: boolean
}

export function computeSelectionStats(
  selection: CellSelection,
  getCell: (pos: CellPosition) => CellSnapshot
): SelectionStats {
  let cellCount = 0
  let numericCount = 0
  let sum = 0
  let min = Infinity
  let max = -Infinity
  let nullCount = 0
  let hasMasked = false

  const distinctSet = new Set<string>()
  const visited = new Set<string>()

  if (selection && selection.primary) {
    for (const pos of iterateSelection(selection)) {
      const key = `${pos.row}:${pos.col}`
      if (visited.has(key)) continue
      visited.add(key)

      cellCount++
      const snapshot = getCell(pos)

      if (snapshot?.isMasked) {
        hasMasked = true
        continue
      }

      const val = snapshot?.value

      if (val === null || val === undefined) {
        nullCount++
      } else {
        const distinctKey =
          typeof val === 'object' ? `obj:${JSON.stringify(val)}` : `${typeof val}:${String(val)}`
        distinctSet.add(distinctKey)

        if (typeof val === 'number' && Number.isFinite(val)) {
          numericCount++
          sum += val
          if (val < min) min = val
          if (val > max) max = val
        }
      }
    }
  }

  const distinctCount = distinctSet.size

  if (numericCount > 0) {
    return {
      cellCount,
      numericCount,
      sum,
      avg: sum / numericCount,
      min,
      max,
      distinctCount,
      nullCount,
      hasMasked: hasMasked ? true : undefined
    }
  }

  return {
    cellCount,
    numericCount: 0,
    distinctCount,
    nullCount,
    hasMasked: hasMasked ? true : undefined
  }
}
