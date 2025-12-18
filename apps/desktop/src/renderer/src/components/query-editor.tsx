import { useState } from 'react'
import {
  Play,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  Database,
  Wand2,
  Bookmark
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useQueryStore, useConnectionStore } from '@/stores'
import { DataTable } from '@/components/data-table'
import { SQLEditor } from '@/components/sql-editor'
import { formatSQL } from '@/lib/sql-formatter'
import { SaveQueryDialog } from '@/components/save-query-dialog'
import { keys } from '@/lib/utils'

export function QueryEditor() {
  const activeConnection = useConnectionStore((s) => s.getActiveConnection())
  const schemas = useConnectionStore((s) => s.schemas)
  const { currentQuery, isExecuting, result, error } = useQueryStore()
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)
  const executeQuery = useQueryStore((s) => s.executeQuery)

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  const handleRunQuery = () => {
    console.log('[QueryEditor] handleRunQuery called')
    console.log('[QueryEditor] activeConnection:', activeConnection)
    console.log('[QueryEditor] isExecuting:', isExecuting)
    console.log('[QueryEditor] currentQuery:', currentQuery)

    if (!activeConnection || isExecuting || !currentQuery.trim()) {
      console.log('[QueryEditor] Skipping - conditions not met')
      return
    }
    console.log('[QueryEditor] Calling executeQuery...')
    executeQuery(activeConnection)
  }

  const handleFormatQuery = () => {
    if (!currentQuery.trim()) return
    const formatted = formatSQL(currentQuery)
    setCurrentQuery(formatted)
  }

  if (!activeConnection) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4">
          <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
            <Database className="size-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-medium">No Connection Selected</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a database connection from the sidebar to start querying.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Query Editor Section */}
      <div className="flex flex-col border-b border-border/40 shrink-0">
        {/* Monaco SQL Editor */}
        <div className="p-3 pb-0">
          <SQLEditor
            value={currentQuery}
            onChange={setCurrentQuery}
            onRun={handleRunQuery}
            onFormat={handleFormatQuery}
            height={160}
            placeholder="SELECT * FROM your_table LIMIT 100;"
            schemas={schemas}
          />
        </div>

        {/* Editor Toolbar */}
        <div className="flex items-center justify-between bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 h-7"
              disabled={isExecuting || !currentQuery.trim()}
              onClick={handleRunQuery}
            >
              {isExecuting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Run
              <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {keys.mod}
                {keys.enter}
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7"
              disabled={!currentQuery.trim()}
              onClick={handleFormatQuery}
            >
              <Wand2 className="size-3.5" />
              Format
              <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {keys.mod}
                {keys.shift}F
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7"
              disabled={!currentQuery.trim()}
              onClick={() => setSaveDialogOpen(true)}
            >
              <Bookmark className="size-3.5" />
              Save
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${activeConnection.isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
              />
              {activeConnection.name}
            </span>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-md text-center space-y-2">
              <AlertCircle className="size-8 text-red-400 mx-auto" />
              <h3 className="font-medium text-red-400">Query Error</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : result ? (
          <>
            {/* Results Table */}
            <div className="flex-1 overflow-hidden p-3">
              <DataTable
                columns={result.columns}
                data={result.rows as Record<string, unknown>[]}
                pageSize={50}
              />
            </div>

            {/* Results Footer */}
            <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-3 py-1.5 shrink-0">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  {result.rowCount} rows returned
                </span>
                <span>{result.durationMs}ms</span>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-7">
                      <Download className="size-3.5" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <FileSpreadsheet className="size-4 text-muted-foreground" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <FileJson className="size-4 text-muted-foreground" />
                      Export as JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">Run a query to see results</p>
              <p className="text-xs text-muted-foreground/70">
                Click on a table in the sidebar to generate a SELECT query
              </p>
            </div>
          </div>
        )}
      </div>

      <SaveQueryDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        query={currentQuery}
      />
    </div>
  )
}
