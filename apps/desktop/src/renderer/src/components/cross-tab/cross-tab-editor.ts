/**
 * Monaco providers for cross-tab @name references — completion, hover, and
 * diagnostics. The completion/hover providers are registered once globally for
 * the 'sql' language and fire for whichever model is focused, so refs are kept
 * per-model: a second SQLEditor mounting (a dashboard widget dialog, the sidebar
 * quick query, a notebook cell) must not clobber the active tab editor's refs.
 */

import type * as monaco from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import type { DatabaseType } from '@data-peek/shared'
import { parseTabReferences } from '@/lib/cross-tab-parser'
import type { CrossTabRef } from '@/lib/cross-tab-integration'

const refsByModel = new Map<string, CrossTabRef[]>()
let providersRegistered = false

const MARKER_OWNER = 'cross-tab'

function refsFor(model: monaco.editor.ITextModel): CrossTabRef[] {
  return refsByModel.get(model.uri.toString()) ?? []
}

export function updateCrossTabRefs(model: monaco.editor.ITextModel, refs: CrossTabRef[]): void {
  refsByModel.set(model.uri.toString(), refs)
}

/** Forget a model's refs + markers when its editor unmounts. */
export function disposeCrossTabRefs(model: monaco.editor.ITextModel): void {
  refsByModel.delete(model.uri.toString())
}

/** True when the text immediately before the cursor is an @-token being typed (not @@, not email). */
export function atTokenBeforeCursor(textBeforeCursor: string): {
  active: boolean
  partial: string
} {
  const m = textBeforeCursor.match(/@([a-z0-9_]*)$/i)
  if (!m) return { active: false, partial: '' }
  const at = textBeforeCursor.length - m[0].length
  const prev = at > 0 ? textBeforeCursor[at - 1] : ''
  if (/[A-Za-z0-9_.$@]/.test(prev)) return { active: false, partial: '' }
  return { active: true, partial: m[1].toLowerCase() }
}

export function filterRefs(refs: CrossTabRef[], partial: string): CrossTabRef[] {
  if (!partial) return refs
  return refs.filter((r) => r.name.startsWith(partial))
}

/** Register the completion + hover providers once, globally. */
export function ensureCrossTabProviders(monacoInstance: Monaco): void {
  if (providersRegistered) return
  providersRegistered = true

  monacoInstance.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['@'],
    provideCompletionItems: (model, position) => {
      const textBeforeCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })
      const tok = atTokenBeforeCursor(textBeforeCursor)
      if (!tok.active) return { suggestions: [] }
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      return {
        suggestions: filterRefs(refsFor(model), tok.partial).map((r) => ({
          label: `@${r.name}`,
          kind: monacoInstance.languages.CompletionItemKind.Variable,
          insertText: r.name,
          range,
          detail:
            r.result.kind === 'ready'
              ? `${r.result.rowCount} rows · ${r.result.colCount} cols`
              : 'not run yet',
          documentation: { value: `Result of tab **${r.tabTitle}**` },
          sortText: '0' + r.name
        }))
      }
    }
  })

  monacoInstance.languages.registerHoverProvider('sql', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const lineText = model.getLineContent(position.lineNumber)
      // Monaco columns are 1-based; startColumn-2 indexes the char just before the word.
      if (lineText[word.startColumn - 2] !== '@') return null
      const ref = refsFor(model).find((r) => r.name === word.word.toLowerCase())
      if (!ref) return null
      return {
        range: new monacoInstance.Range(
          position.lineNumber,
          word.startColumn - 1,
          position.lineNumber,
          word.endColumn
        ),
        contents: [
          { value: `**@${ref.name}** — tab "${ref.tabTitle}"` },
          {
            value:
              ref.result.kind === 'ready'
                ? `${ref.result.rowCount} rows · ${ref.result.colCount} columns`
                : "_hasn't been run yet_"
          }
        ]
      }
    }
  })
}

/**
 * Recompute diagnostic markers for the model. Unknown names → Error; named
 * but not-yet-run → Warning. For mysql/mssql, only known names are parsed
 * (so @vars aren't flagged).
 */
export function updateCrossTabMarkers(
  monacoInstance: Monaco,
  model: monaco.editor.ITextModel,
  dbType: DatabaseType
): void {
  const byName = new Map(refsFor(model).map((r) => [r.name, r]))
  const knownNames = dbType === 'mysql' || dbType === 'mssql' ? new Set(byName.keys()) : undefined
  const parsed = parseTabReferences(model.getValue(), { dialect: dbType, knownNames })

  const markers: monaco.editor.IMarkerData[] = []
  for (const ref of parsed.references) {
    const known = byName.get(ref.name)
    const start = model.getPositionAt(ref.start)
    const end = model.getPositionAt(ref.end)
    const base = {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column
    }
    if (!known) {
      markers.push({
        ...base,
        severity: monacoInstance.MarkerSeverity.Error,
        message: `No tab named @${ref.name} on this connection.`
      })
    } else if (known.result.kind === 'not_run') {
      markers.push({
        ...base,
        severity: monacoInstance.MarkerSeverity.Warning,
        message: `@${ref.name} hasn't been run yet.`
      })
    }
  }
  monacoInstance.editor.setModelMarkers(model, MARKER_OWNER, markers)
}

/** Clear all cross-tab diagnostic markers from a model (e.g. when the tab has no connection/dialect). */
export function clearCrossTabMarkers(
  monacoInstance: Monaco,
  model: monaco.editor.ITextModel
): void {
  monacoInstance.editor.setModelMarkers(model, MARKER_OWNER, [])
}
