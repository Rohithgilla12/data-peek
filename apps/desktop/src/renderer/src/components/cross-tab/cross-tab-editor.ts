/**
 * Monaco providers for cross-tab @name references — completion, hover, and
 * diagnostics. Follows the singleton-provider + module-state pattern from
 * sql-editor.tsx: the active editor pushes refs via updateCrossTabRefs and
 * the providers read the latest snapshot.
 */

import type * as monaco from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import type { DatabaseType } from '@data-peek/shared'
import { parseTabReferences } from '@/lib/cross-tab-parser'
import type { CrossTabRef } from '@/lib/cross-tab-integration'

let currentRefs: CrossTabRef[] = []
let providersRegistered = false

const MARKER_OWNER = 'cross-tab'

export function updateCrossTabRefs(refs: CrossTabRef[]): void {
  currentRefs = refs
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
        suggestions: filterRefs(currentRefs, tok.partial).map((r) => ({
          label: `@${r.name}`,
          kind: monacoInstance.languages.CompletionItemKind.Variable,
          insertText: r.name,
          range,
          detail: r.hasResult ? `${r.rowCount} rows · ${r.colCount} cols` : 'not run yet',
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
      if (lineText[word.startColumn - 2] !== '@') return null
      const ref = currentRefs.find((r) => r.name === word.word.toLowerCase())
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
            value: ref.hasResult
              ? `${ref.rowCount} rows · ${ref.colCount} columns`
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
  const byName = new Map(currentRefs.map((r) => [r.name, r]))
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
    } else if (!known.hasResult) {
      markers.push({
        ...base,
        severity: monacoInstance.MarkerSeverity.Warning,
        message: `@${ref.name} hasn't been run yet.`
      })
    }
  }
  monacoInstance.editor.setModelMarkers(model, MARKER_OWNER, markers)
}
