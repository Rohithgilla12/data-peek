import * as React from 'react'
import type { CellPosition } from './cell-grid-types'
import {
  buildFindIndex,
  findMatches,
  locateMatch,
  type FindQuery,
  type FindResult
} from './grid-find'

interface UseGridFindOptions {
  /** Filtered and sorted rows before pagination, so find covers every page. */
  rows: ReadonlyArray<{ original: Record<string, unknown> }>
  columns: ReadonlyArray<{ name: string }>
  maskedColumns: ReadonlySet<string>
  pageIndex: number
  pageSize: number
  setPageIndex: (pageIndex: number) => void
  /** Grid column of `columns[0]`; edit mode prepends a select column. */
  colOffset: number
  /** Rows rendered on the current page. A pending focus waits until its row exists. */
  pageRowCount: number
  focusCell: (pos: CellPosition) => void
  /** Takes focus back when the find bar closes. */
  returnFocusTo: React.RefObject<HTMLElement | null>
}

export interface GridFind {
  open: boolean
  query: FindQuery
  result: FindResult
  /** Index into the matches of the match the user last stepped to, or null before the first step. */
  current: number | null
  /** Matches on the current page, in grid coordinates. */
  pageMatches: CellPosition[]
  /** The current match in grid coordinates, when it is on this page. */
  currentPos: CellPosition | null
  setOpen: (open: boolean) => void
  setQuery: (patch: Partial<FindQuery>) => void
  step: (direction: 1 | -1) => void
  close: () => void
}

const EMPTY_QUERY: FindQuery = { needle: '', caseSensitive: false, regex: false }
const NO_MATCHES: FindResult = { kind: 'ok', matches: [] }

interface PendingFocus {
  pageIndex: number
  pos: CellPosition
}

export function useGridFind({
  rows,
  columns,
  maskedColumns,
  pageIndex,
  pageSize,
  setPageIndex,
  colOffset,
  pageRowCount,
  focusCell,
  returnFocusTo
}: UseGridFindOptions): GridFind {
  const [open, setOpen] = React.useState(false)
  const [query, setQueryState] = React.useState<FindQuery>(EMPTY_QUERY)
  // Matching a large result can take tens of milliseconds; deferring it keeps
  // the input responsive while the previous highlights stay on screen.
  const deferredQuery = React.useDeferredValue(query)

  const index = React.useMemo(
    () =>
      open
        ? buildFindIndex(
            rows.map((row) => row.original),
            columns,
            (name) => maskedColumns.has(name)
          )
        : null,
    [open, rows, columns, maskedColumns]
  )

  const result = React.useMemo(
    () => (index ? findMatches(index, deferredQuery) : NO_MATCHES),
    [index, deferredQuery]
  )

  // The cursor remembers which result it indexes, so any new result (query
  // edit, re-sort, watch tick) drops it without an effect.
  const [cursor, setCursor] = React.useState<{ result: FindResult; index: number } | null>(null)
  const current = cursor && cursor.result === result ? cursor.index : null

  const [pendingFocus, setPendingFocus] = React.useState<PendingFocus | null>(null)

  const step = React.useCallback(
    (direction: 1 | -1) => {
      if (result.kind !== 'ok' || result.matches.length === 0) return
      const total = result.matches.length
      const next =
        current === null ? (direction === 1 ? 0 : total - 1) : (current + direction + total) % total
      setCursor({ result, index: next })
      const target = locateMatch(result.matches[next], pageSize)
      setPendingFocus({
        pageIndex: target.pageIndex,
        pos: { row: target.pos.row, col: target.pos.col + colOffset }
      })
      if (target.pageIndex !== pageIndex) setPageIndex(target.pageIndex)
    },
    [result, current, pageSize, colOffset, pageIndex, setPageIndex]
  )

  React.useEffect(() => {
    if (!pendingFocus) return
    if (pendingFocus.pageIndex !== pageIndex || pendingFocus.pos.row >= pageRowCount) return
    focusCell(pendingFocus.pos)
    setPendingFocus(null)
  }, [pendingFocus, pageIndex, pageRowCount, focusCell])

  const pageMatches = React.useMemo(() => {
    if (result.kind !== 'ok') return []
    const start = pageIndex * pageSize
    const end = start + pageSize
    const onPage: CellPosition[] = []
    for (const match of result.matches) {
      if (match.row >= end) break
      if (match.row >= start) onPage.push({ row: match.row - start, col: match.col + colOffset })
    }
    return onPage
  }, [result, pageIndex, pageSize, colOffset])

  const currentPos = React.useMemo(() => {
    if (current === null || result.kind !== 'ok') return null
    const target = locateMatch(result.matches[current], pageSize)
    if (target.pageIndex !== pageIndex) return null
    return { row: target.pos.row, col: target.pos.col + colOffset }
  }, [current, result, pageSize, pageIndex, colOffset])

  const setQuery = React.useCallback((patch: Partial<FindQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch }))
  }, [])

  const close = React.useCallback(() => {
    setOpen(false)
    setPendingFocus(null)
    returnFocusTo.current?.focus({ preventScroll: true })
  }, [returnFocusTo])

  return {
    open,
    query,
    result,
    current,
    pageMatches,
    currentPos,
    setOpen,
    setQuery,
    step,
    close
  }
}
