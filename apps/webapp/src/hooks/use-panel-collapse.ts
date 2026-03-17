import { useState } from 'react'

interface UsePanelCollapseOptions {
  /** Initial collapsed state for editor */
  initialEditorCollapsed?: boolean
  /** Initial collapsed state for results */
  initialResultsCollapsed?: boolean
}

interface UsePanelCollapseReturn {
  isEditorCollapsed: boolean
  setIsEditorCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  isResultsCollapsed: boolean
  setIsResultsCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  toggleEditor: () => void
  toggleResults: () => void
}

export function usePanelCollapse(options: UsePanelCollapseOptions = {}): UsePanelCollapseReturn {
  const { initialEditorCollapsed = false, initialResultsCollapsed = false } = options

  const [isEditorCollapsed, setIsEditorCollapsed] = useState(initialEditorCollapsed)
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(initialResultsCollapsed)

  const toggleEditor = () => setIsEditorCollapsed((prev) => !prev)
  const toggleResults = () => setIsResultsCollapsed((prev) => !prev)

  return {
    isEditorCollapsed,
    setIsEditorCollapsed,
    isResultsCollapsed,
    setIsResultsCollapsed,
    toggleEditor,
    toggleResults
  }
}
