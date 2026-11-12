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

  const distinctSet = new Set<string>()
  const visited = new Set<string>()

  if (selection && selection.primary) {
    for (const pos of iterateSelection(selection)) {
      const key = `${pos.row}:${pos.col}`
      if (visited.has(key)) continue
      visited.add(key)

      cellCount++
      const snapshot = getCell(pos)
      const val = snapshot?.value

      if (val === null || val === undefined) {
        nullCount++
      } else {
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
        distinctSet.add(str)

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
      nullCount
    }
  }

  return {
    cellCount,
    numericCount,
    distinctCount,
    nullCount
  }
}
