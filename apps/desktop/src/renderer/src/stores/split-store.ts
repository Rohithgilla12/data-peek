import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SplitDirection, SplitLayout, PaneNode, PaneLeaf, PaneSplit } from '@data-peek/shared'

const DEFAULT_PANE_ID = 'pane-main'

function createDefaultLayout(): SplitLayout {
  return {
    root: {
      type: 'leaf',
      id: DEFAULT_PANE_ID,
      activeTabId: null,
      tabIds: []
    },
    focusedPaneId: DEFAULT_PANE_ID
  }
}

function generatePaneId(): string {
  return `pane-${crypto.randomUUID().slice(0, 8)}`
}

function generateSplitId(): string {
  return `split-${crypto.randomUUID().slice(0, 8)}`
}

// Helper to find a pane by ID in the tree
function findPaneById(node: PaneNode, paneId: string): PaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined
  }
  return findPaneById(node.children[0], paneId) || findPaneById(node.children[1], paneId)
}

// Helper to find all leaf panes
function getAllLeafPanes(node: PaneNode): PaneLeaf[] {
  if (node.type === 'leaf') {
    return [node]
  }
  return [...getAllLeafPanes(node.children[0]), ...getAllLeafPanes(node.children[1])]
}

// Helper to find the pane containing a tab
function findPaneByTabId(node: PaneNode, tabId: string): PaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.tabIds.includes(tabId) ? node : undefined
  }
  return findPaneByTabId(node.children[0], tabId) || findPaneByTabId(node.children[1], tabId)
}

// Helper to update a pane in the tree (immutably)
function updatePaneInTree(
  node: PaneNode,
  paneId: string,
  updater: (pane: PaneLeaf) => PaneLeaf
): PaneNode {
  if (node.type === 'leaf') {
    return node.id === paneId ? updater(node) : node
  }
  return {
    ...node,
    children: [
      updatePaneInTree(node.children[0], paneId, updater),
      updatePaneInTree(node.children[1], paneId, updater)
    ] as [PaneNode, PaneNode]
  }
}

// Helper to replace a node in the tree
function replaceNodeInTree(node: PaneNode, targetId: string, replacement: PaneNode): PaneNode {
  if (node.type === 'leaf') {
    return node.id === targetId ? replacement : node
  }
  if (node.id === targetId) {
    return replacement
  }
  return {
    ...node,
    children: [
      replaceNodeInTree(node.children[0], targetId, replacement),
      replaceNodeInTree(node.children[1], targetId, replacement)
    ] as [PaneNode, PaneNode]
  }
}

// Helper to find parent of a node
function findParentSplit(root: PaneNode, targetId: string): PaneSplit | null {
  if (root.type === 'leaf') return null

  for (const child of root.children) {
    if (child.id === targetId) return root
    const found = findParentSplit(child, targetId)
    if (found) return found
  }
  return null
}

// Helper to simplify tree after removing a pane (collapse single-child splits)
function simplifyTree(node: PaneNode): PaneNode {
  if (node.type === 'leaf') return node

  const simplified: PaneSplit = {
    ...node,
    children: [simplifyTree(node.children[0]), simplifyTree(node.children[1])] as [
      PaneNode,
      PaneNode
    ]
  }

  return simplified
}

interface SplitState {
  // Layout tree
  layout: SplitLayout
  _hasHydrated: boolean

  // Actions
  splitPane: (paneId: string, direction: SplitDirection) => string
  closePane: (paneId: string) => void
  focusPane: (paneId: string) => void

  // Tab-pane association
  addTabToPane: (tabId: string, paneId?: string) => void
  removeTabFromPane: (tabId: string) => void
  moveTabToPane: (tabId: string, targetPaneId: string) => void
  setActivePaneTab: (paneId: string, tabId: string) => void

  // Resize
  updatePaneSizes: (splitId: string, sizes: [number, number]) => void

  // Computed helpers
  getPaneById: (paneId: string) => PaneLeaf | undefined
  getTabPane: (tabId: string) => string | undefined
  getAllPaneIds: () => string[]
  getFocusedPane: () => PaneLeaf | undefined
  getActiveTabId: () => string | null

  // Migration helper
  setHasHydrated: (state: boolean) => void
}

export const useSplitStore = create<SplitState>()(
  persist(
    (set, get) => ({
      layout: createDefaultLayout(),
      _hasHydrated: false,

      splitPane: (paneId, direction) => {
        const newPaneId = generatePaneId()
        const splitId = generateSplitId()

        set((state) => {
          const pane = findPaneById(state.layout.root, paneId)
          if (!pane) return state

          // Keep all tabs in the original pane, create empty new pane
          // The original pane stays as-is, new pane is empty
          const newPane: PaneLeaf = {
            type: 'leaf',
            id: newPaneId,
            activeTabId: null,
            tabIds: []
          }

          // Original pane keeps all its tabs
          const updatedOriginalPane: PaneLeaf = {
            ...pane
          }

          const newSplit: PaneSplit = {
            type: 'split',
            id: splitId,
            direction,
            children: [updatedOriginalPane, newPane],
            sizes: [50, 50]
          }

          const newRoot = replaceNodeInTree(state.layout.root, paneId, newSplit)

          return {
            layout: {
              root: newRoot,
              // Keep focus on original pane with the tab
              focusedPaneId: paneId
            }
          }
        })

        return newPaneId
      },

      closePane: (paneId) => {
        set((state) => {
          const allPanes = getAllLeafPanes(state.layout.root)
          if (allPanes.length <= 1) {
            // Can't close the last pane, just clear its tabs
            return {
              layout: {
                ...state.layout,
                root: updatePaneInTree(state.layout.root, paneId, (pane) => ({
                  ...pane,
                  tabIds: [],
                  activeTabId: null
                }))
              }
            }
          }

          // Find the parent split
          const parent = findParentSplit(state.layout.root, paneId)
          if (!parent) return state

          // Get the sibling that will replace the parent
          const sibling = parent.children[0].id === paneId ? parent.children[1] : parent.children[0]

          // Replace parent split with sibling
          let newRoot: PaneNode
          if (state.layout.root.id === parent.id) {
            newRoot = sibling
          } else {
            newRoot = replaceNodeInTree(state.layout.root, parent.id, sibling)
          }

          // Update focused pane if needed
          const newPanes = getAllLeafPanes(newRoot)
          const newFocusedPaneId =
            newPanes.find((p) => p.id !== paneId)?.id ?? newPanes[0]?.id ?? DEFAULT_PANE_ID

          return {
            layout: {
              root: simplifyTree(newRoot),
              focusedPaneId:
                state.layout.focusedPaneId === paneId
                  ? newFocusedPaneId
                  : state.layout.focusedPaneId
            }
          }
        })
      },

      focusPane: (paneId) => {
        set((state) => ({
          layout: {
            ...state.layout,
            focusedPaneId: paneId
          }
        }))
      },

      addTabToPane: (tabId, paneId) => {
        set((state) => {
          const targetPaneId = paneId ?? state.layout.focusedPaneId
          return {
            layout: {
              ...state.layout,
              root: updatePaneInTree(state.layout.root, targetPaneId, (pane) => ({
                ...pane,
                tabIds: pane.tabIds.includes(tabId) ? pane.tabIds : [...pane.tabIds, tabId],
                activeTabId: tabId
              }))
            }
          }
        })
      },

      removeTabFromPane: (tabId) => {
        set((state) => {
          const pane = findPaneByTabId(state.layout.root, tabId)
          if (!pane) return state

          const newTabIds = pane.tabIds.filter((id) => id !== tabId)
          const newActiveTabId =
            pane.activeTabId === tabId
              ? (newTabIds[newTabIds.length - 1] ?? null)
              : pane.activeTabId

          return {
            layout: {
              ...state.layout,
              root: updatePaneInTree(state.layout.root, pane.id, (p) => ({
                ...p,
                tabIds: newTabIds,
                activeTabId: newActiveTabId
              }))
            }
          }
        })
      },

      moveTabToPane: (tabId, targetPaneId) => {
        set((state) => {
          const sourcePaneId = get().getTabPane(tabId)
          if (!sourcePaneId || sourcePaneId === targetPaneId) return state

          // Remove from source pane
          let newRoot = updatePaneInTree(state.layout.root, sourcePaneId, (pane) => {
            const newTabIds = pane.tabIds.filter((id) => id !== tabId)
            return {
              ...pane,
              tabIds: newTabIds,
              activeTabId: pane.activeTabId === tabId ? (newTabIds[0] ?? null) : pane.activeTabId
            }
          })

          // Add to target pane
          newRoot = updatePaneInTree(newRoot, targetPaneId, (pane) => ({
            ...pane,
            tabIds: [...pane.tabIds, tabId],
            activeTabId: tabId
          }))

          return {
            layout: {
              ...state.layout,
              root: newRoot,
              focusedPaneId: targetPaneId
            }
          }
        })
      },

      setActivePaneTab: (paneId, tabId) => {
        set((state) => ({
          layout: {
            ...state.layout,
            root: updatePaneInTree(state.layout.root, paneId, (pane) => ({
              ...pane,
              activeTabId: pane.tabIds.includes(tabId) ? tabId : pane.activeTabId
            })),
            focusedPaneId: paneId
          }
        }))
      },

      updatePaneSizes: (splitId, sizes) => {
        set((state) => {
          const updateSizes = (node: PaneNode): PaneNode => {
            if (node.type === 'leaf') return node
            if (node.id === splitId) {
              return { ...node, sizes }
            }
            return {
              ...node,
              children: [updateSizes(node.children[0]), updateSizes(node.children[1])] as [
                PaneNode,
                PaneNode
              ]
            }
          }

          return {
            layout: {
              ...state.layout,
              root: updateSizes(state.layout.root)
            }
          }
        })
      },

      getPaneById: (paneId) => {
        return findPaneById(get().layout.root, paneId)
      },

      getTabPane: (tabId) => {
        const pane = findPaneByTabId(get().layout.root, tabId)
        return pane?.id
      },

      getAllPaneIds: () => {
        return getAllLeafPanes(get().layout.root).map((p) => p.id)
      },

      getFocusedPane: () => {
        return findPaneById(get().layout.root, get().layout.focusedPaneId)
      },

      getActiveTabId: () => {
        const focusedPane = get().getFocusedPane()
        return focusedPane?.activeTabId ?? null
      },

      setHasHydrated: (state) => {
        set({ _hasHydrated: state })
      }
    }),
    {
      name: 'data-peek-split-layout',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        layout: state.layout
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      }
    }
  )
)
