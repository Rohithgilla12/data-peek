'use client'

import { useRef, useCallback } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  onFormat?: () => void
  editorRef?: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
}

export function SqlEditor({ value, onChange, onExecute, onFormat, editorRef }: SqlEditorProps) {
  const localRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleMount: OnMount = useCallback((editor, monaco) => {
    localRef.current = editor
    if (editorRef) editorRef.current = editor

    monaco.editor.defineTheme('data-peek-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '6b8cf5', fontStyle: 'bold' },
        { token: 'string', foreground: '98c379' },
        { token: 'number', foreground: 'e5c07b' },
        { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
        { token: 'operator', foreground: 'abb2bf' },
      ],
      colors: {
        'editor.background': '#0a0a0f',
        'editor.foreground': '#e5e7eb',
        'editor.lineHighlightBackground': '#111118',
        'editor.selectionBackground': '#6b8cf533',
        'editorCursor.foreground': '#6b8cf5',
        'editorLineNumber.foreground': '#3a3f4b',
        'editorLineNumber.activeForeground': '#6b8cf5',
      },
    })

    monaco.editor.setTheme('data-peek-dark')

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onExecute()
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      onFormat?.()
    })

    editor.focus()
  }, [onExecute, onFormat, editorRef])

  return (
    <Editor
      height="100%"
      language="sql"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', monospace",
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'line',
        scrollbar: {
          vertical: 'auto',
          horizontal: 'auto',
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
      }}
      loading={
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Loading editor...
        </div>
      }
    />
  )
}
