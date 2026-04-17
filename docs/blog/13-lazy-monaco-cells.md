---
title: "Lazy-Loading Monaco Editor in a Cell-Based Notebook UI"
published: false
description: "How I solved the performance problem of multiple Monaco editor instances in a notebook UI by only mounting the editor on the focused cell."
tags: react, monaco, performance, typescript
series: "Building data-peek"
cover_image:
---

# Lazy-Loading Monaco Editor in a Cell-Based Notebook UI

The first version of the notebook UI mounted a Monaco editor for every SQL cell. It worked for 3 cells. With 10 cells it was sluggish. With 20 it was genuinely bad — slow initial render, janky scrolling, and memory usage that climbed noticeably on older machines.

Monaco is a full code editor. It initializes a worker thread for language services, builds a virtual DOM for the editor viewport, and manages its own event loop. One instance is fine. Twenty concurrent instances is not.

I needed a different approach.

## The Solution: One Live Editor at a Time

The core insight is that you can only type in one cell at a time. A notebook might have 30 cells, but only the focused cell needs a live Monaco instance. Every other cell just needs to show its content.

The implementation splits each SQL cell into two states:

- **Focused and editing**: a `<textarea>` (or Monaco for future enhancement) handles input
- **Unfocused**: a static `<pre>` element renders the content

This is simpler than it sounds, but there are a few subtleties in how focus, state, and keyboard navigation interact.

## Cell Focus Management

Focus state is managed in the parent `NotebookEditor` component, not in individual cells. A single `focusedCellIndex` integer tracks which cell is active:

```typescript
export function NotebookEditor({ tab }: NotebookEditorProps) {
  const [focusedCellIndex, setFocusedCellIndex] = useState<number>(0)
  // ...
  return (
    <>
      {cells.map((cell, index) => (
        <NotebookCell
          key={cell.id}
          cell={cell}
          isFocused={focusedCellIndex === index}
          onFocus={() => setFocusedCellIndex(index)}
          // ...
        />
      ))}
    </>
  )
}
```

Each `NotebookCell` receives `isFocused: boolean` as a prop. When `isFocused` is false, the cell renders its content as a static `<pre>` (for SQL) or rendered Markdown (for Markdown cells). When `isFocused` becomes true, the cell can enter edit mode.

There's a secondary bit of state inside each cell: `isEditing`. Focusing a cell doesn't immediately activate the editor — you have to click or press Enter to start typing. This matches Jupyter's modal behavior: a cell can be "selected" (focused) without being in "edit mode."

```typescript
const NotebookCell = memo(function NotebookCell({ cell, isFocused, onFocus, ... }) {
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setIsEditing(false)
    }
  }, [isFocused])

  // SQL cell render logic:
  // isEditing && isFocused → textarea (live editor)
  // otherwise → <pre> (static view)
})
```

The `useEffect` on `isFocused` is important: when another cell takes focus, this cell exits edit mode automatically. Without this, you could have a cell stuck in edit mode after focus moved elsewhere.

## The Static Pre Element

When a cell isn't being edited, it renders as a `<pre>` with a click handler:

```typescript
<pre
  className={cn(
    'font-mono text-sm text-foreground whitespace-pre-wrap break-all cursor-text min-h-[1.5rem]',
    !cell.content && 'text-muted-foreground/40 italic'
  )}
  onClick={(e) => {
    e.stopPropagation()
    onFocus()
    setIsEditing(true)
  }}
>
  {cell.content || 'Click to edit SQL…'}
</pre>
```

The `cursor-text` class signals that this is editable. Clicking it calls `onFocus()` (updates the parent's `focusedCellIndex`) and sets `isEditing(true)` locally. The two calls happen synchronously in the same event handler, so there's no visible flash.

For Markdown cells, the unfocused state renders through `ReactMarkdown` instead of `<pre>`. The click handler is on the outer `div`:

```typescript
<div
  className="prose prose-sm dark:prose-invert max-w-none cursor-text"
  onClick={(e) => {
    e.stopPropagation()
    onFocus()
    setIsEditing(true)
  }}
>
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.content}</ReactMarkdown>
</div>
```

## The Keyboard Model

The notebook has two layers of keyboard handling:

**Cell-level (inside a textarea):**

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
      return
    }

    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      runQuery().then(() => onRunAndAdvance())
      return
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      runQuery()
      return
    }
  },
  [runQuery, onRunAndAdvance]
)
```

`Shift+Enter` runs the query and calls `onRunAndAdvance`, which increments `focusedCellIndex` in the parent. This moves focus to the next cell automatically — the Jupyter "run and go to next" UX.

`Cmd+Enter` runs the query without moving focus — useful when you're iterating on a single query.

`Escape` exits edit mode, leaving the cell focused but not editing. This is the Jupyter "command mode" equivalent.

**Notebook-level (global keydown listener):**

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return

    if (e.key === 'j') {
      e.preventDefault()
      setFocusedCellIndex((prev) => Math.min(prev + 1, cells.length - 1))
    } else if (e.key === 'k') {
      e.preventDefault()
      setFocusedCellIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.shiftKey && e.key === 'D') {
      e.preventDefault()
      const cell = cells[focusedCellIndex]
      if (cell) handleDeleteCell(cell.id, focusedCellIndex)
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [cells, focusedCellIndex, handleDeleteCell])
```

`Cmd+J` and `Cmd+K` navigate between cells. I chose J/K over arrow keys because arrow keys inside a textarea move the cursor, and intercepting them would require tracking cursor position. J/K only fires with the modifier, so they don't interfere with typing.

The global listener has a closure over `cells` and `focusedCellIndex`, so it needs to be re-registered when those change. The cleanup function (`removeEventListener`) ensures there's never more than one active listener.

## Between-Cell Insert Points

One UX problem with a cell list: how do you insert a cell between two existing cells? A button at the bottom only inserts at the end. A button on each cell is visually noisy.

I borrowed the pattern from Notion: insert points appear on hover between cells. They're invisible by default and expand on mouse enter:

```typescript
function InsertPoint({ onInsert }: InsertPointProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-0.5 transition-all duration-150',
        isHovered ? 'opacity-100' : 'opacity-0 hover:opacity-100'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex-1 h-px bg-border/40" />
      <div className="flex gap-1">
        <button onClick={() => onInsert('sql')}>+ SQL</button>
        <button onClick={() => onInsert('markdown')}>+ Note</button>
      </div>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  )
}
```

An `InsertPoint` appears before the first cell and after every cell. The `handleAddCell` function in the editor uses the `insertAfterIndex` parameter to calculate `order`:

```typescript
const handleAddCell = useCallback(
  (type: 'sql' | 'markdown', insertAfterIndex?: number) => {
    if (!activeNotebook) return
    const order =
      insertAfterIndex !== undefined && cells[insertAfterIndex]
        ? cells[insertAfterIndex].order + 0.5
        : cells.length
    addCell(activeNotebook.id, { type, content: '', order })
    setFocusedCellIndex(insertAfterIndex !== undefined ? insertAfterIndex + 1 : cells.length)
  },
  [activeNotebook, cells, addCell]
)
```

The fractional `order` value (`existingOrder + 0.5`) lets new cells land between existing ones without renumbering everything. The next `reorderCells` call (e.g. on drag-drop) normalizes all indices back to integers.

## Auto-Save Integration

The debounced auto-save runs inside each cell's `handleContentChange`:

```typescript
const handleContentChange = useCallback(
  (value: string) => {
    updateCellContent(cell.id, value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      flushCellContent(cell.id, value)
    }, 500)
  },
  [cell.id, updateCellContent, flushCellContent]
)
```

`updateCellContent` is a synchronous Zustand mutation — the UI reflects the new content immediately. `flushCellContent` fires 500ms later via IPC and writes to SQLite. The `debounceRef` is local to the cell component via `useRef`, so each cell manages its own debounce timer independently.

One subtlety: the `useCallback` dependency array includes `cell.id`. If a cell is deleted and re-created with the same position but a new ID (which doesn't happen in the current implementation, but is a future risk), the callback will correctly use the new ID because the component re-mounts.

## Result Pinning UX

After running a SQL cell, a "Pin result" option appears in the cell's dropdown menu. Pinning captures the current `liveResult` into a `PinnedResult` object and persists it via IPC:

```typescript
const handlePinResult = useCallback(() => {
  if (!liveResult) return
  const pinned: PinnedResult = {
    columns: liveResult.fields.map((f) => f.name),
    rows: liveResult.rows,
    rowCount: liveResult.rows.length,
    executedAt: Date.now(),
    durationMs: durationMs ?? 0,
    error: null
  }
  pinResult(cell.id, pinned)
}, [cell.id, liveResult, durationMs, pinResult])
```

The cell's result area follows this priority logic:

1. If there's a live result (just ran): show it
2. Else if there's a pinned result: show it with a "Pinned" badge and timestamp
3. Else if idle: show the "not yet executed" hint

This means re-running always shows fresh results, but the pinned result is always visible as a fallback. The "Unpin" option appears in the same menu to remove it.

## React.memo for Cell List Performance

Every cell is wrapped in `React.memo`:

```typescript
export const NotebookCell = memo(function NotebookCell({ ... }) {
  // ...
})
```

Without memo, every `focusedCellIndex` change would re-render all cells. With memo, cells only re-render when their own props change. The only prop that changes when you navigate between cells is `isFocused` — and that only changes on the two cells involved in the transition (the one losing focus and the one gaining it).

This makes Cmd+J/K navigation fast even with 30+ cells. The alternative — not using memo — would re-render the entire cell list on every keypress.

## What I'd Do Differently

The `textarea` approach works well but lacks SQL syntax highlighting in edit mode. The original goal was to use Monaco for the focused cell and `<pre>` for everything else — one live Monaco instance, swapped between cells on focus. That's still the right architectural direction.

The challenge is that Monaco requires a DOM container with stable dimensions to initialize correctly. If the container isn't visible yet when `monaco.create()` is called, the editor renders incorrectly. Solving this requires either prerendering the container (hidden, not unmounted) or carefully sequencing the focus transition before the Monaco initialization.

For now, the `textarea` approach is good enough — it's lightweight, has no initialization cost, and supports all the keyboard shortcuts. If syntax highlighting becomes a frequent request, the architecture already supports it: swap the `textarea` for a lazily-initialized Monaco instance on the focused cell, keep everything else as-is.
