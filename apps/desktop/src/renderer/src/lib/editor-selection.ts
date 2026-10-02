import type { editor } from 'monaco-editor'

/**
 * The editor's selected text, trimmed, or `undefined` when the selection is
 * empty or only whitespace. Callers run this instead of the whole query.
 */
export function getSelectedSql(ed: editor.ICodeEditor | null | undefined): string | undefined {
  const selection = ed?.getSelection()
  if (!selection || selection.isEmpty()) return undefined
  return ed?.getModel()?.getValueInRange(selection)?.trim() || undefined
}
