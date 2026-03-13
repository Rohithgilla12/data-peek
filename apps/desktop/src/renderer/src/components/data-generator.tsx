import { useCallback, useEffect, useState } from 'react'
import {
  Play,
  Square,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Shuffle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTabStore, useConnectionStore, useDataGenStore } from '@/stores'
import type { DataGeneratorTab } from '@/stores/tab-store'
import type { ColumnGenerator, GeneratorType } from '@data-peek/shared'
import { cn } from '@/lib/utils'

const GENERATOR_TYPES: { value: GeneratorType; label: string }[] = [
  { value: 'auto-increment', label: 'Auto Increment' },
  { value: 'uuid', label: 'UUID' },
  { value: 'faker', label: 'Faker' },
  { value: 'random-int', label: 'Random Integer' },
  { value: 'random-float', label: 'Random Float' },
  { value: 'random-boolean', label: 'Random Boolean' },
  { value: 'random-date', label: 'Random Date' },
  { value: 'random-enum', label: 'Random Enum' },
  { value: 'fk-reference', label: 'FK Reference' },
  { value: 'fixed', label: 'Fixed Value' },
  { value: 'null', label: 'Always NULL' },
  { value: 'expression', label: 'Expression' }
]

interface DataGeneratorProps {
  tabId: string
}

export function DataGenerator({ tabId }: DataGeneratorProps) {
  const tab = useTabStore((s) => s.getTab(tabId)) as DataGeneratorTab | undefined
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const getActiveConnection = useConnectionStore((s) => s.getActiveConnection)
  const schemas = useConnectionStore((s) => s.schemas)

  const tabState = useDataGenStore((s) => s.getTab(tabId))
  const initForTable = useDataGenStore((s) => s.initForTable)
  const updateGenerator = useDataGenStore((s) => s.updateGenerator)
  const updateConfig = useDataGenStore((s) => s.updateConfig)
  const startGenerate = useDataGenStore((s) => s.startGenerate)
  const cancelGenerate = useDataGenStore((s) => s.cancelGenerate)
  const fetchPreview = useDataGenStore((s) => s.fetchPreview)

  const [rowCountInput, setRowCountInput] = useState('100')
  const [seedInput, setSeedInput] = useState('')

  const schemaName = tab?.schemaName ?? ''
  const tableName = tab?.tableName ?? ''

  useEffect(() => {
    if (!tab || tabState) return

    const schema = schemas.find((s) => s.name === schemaName)
    const tableInfo = schema?.tables.find((t) => t.name === tableName)

    if (!tableInfo) return

    const columns = tableInfo.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      isNullable: c.isNullable,
      isPrimaryKey: c.isPrimaryKey
    }))

    const foreignKeys = tableInfo.columns
      .filter((c) => c.foreignKey != null)
      .map((c) => ({
        columnName: c.name,
        referencedTable: c.foreignKey!.referencedTable,
        referencedColumn: c.foreignKey!.referencedColumn
      }))

    initForTable(tabId, schemaName, tableName, columns, foreignKeys)
  }, [tab, tabState, schemaName, tableName, schemas, tabId, initForTable])

  const handleGenerate = useCallback(async () => {
    const connection = getActiveConnection()
    if (!connection || !tabState) return

    const rowCount = parseInt(rowCountInput, 10)
    if (isNaN(rowCount) || rowCount < 1 || rowCount > 10000) return

    const seed = seedInput.trim() ? parseInt(seedInput.trim(), 10) : undefined
    updateConfig(tabId, { rowCount, seed: isNaN(seed ?? NaN) ? undefined : seed })

    await startGenerate(tabId, connection)
  }, [getActiveConnection, tabState, rowCountInput, seedInput, tabId, updateConfig, startGenerate])

  const handleCancel = useCallback(async () => {
    await cancelGenerate()
  }, [cancelGenerate])

  const handlePreview = useCallback(async () => {
    const connection = getActiveConnection()
    if (!connection || !tabState) return

    const rowCount = parseInt(rowCountInput, 10)
    if (!isNaN(rowCount) && rowCount >= 1) {
      updateConfig(tabId, { rowCount })
    }

    await fetchPreview(tabId, connection)
  }, [getActiveConnection, tabState, rowCountInput, tabId, updateConfig, fetchPreview])

  if (!tab) return null

  if (!tabState) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { columnGenerators, previewRows, previewColumns, progress, isGenerating, isPreviewing, result, error } = tabState

  const progressPercent =
    progress && progress.totalRows > 0
      ? Math.round((progress.rowsInserted / progress.totalRows) * 100)
      : 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Shuffle className="size-4 text-muted-foreground" />
          <div>
            <span className="text-sm font-medium">
              {schemaName}.{tableName}
            </span>
            <span className="text-xs text-muted-foreground ml-2">Data Generator</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Rows</label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={rowCountInput}
              onChange={(e) => setRowCountInput(e.target.value)}
              className="h-7 w-24 text-xs"
              disabled={isGenerating}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Seed</label>
            <Input
              type="number"
              placeholder="optional"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              className="h-7 w-24 text-xs"
              disabled={isGenerating}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={isGenerating || isPreviewing}
            className="h-7 text-xs gap-1.5"
          >
            {isPreviewing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Eye className="size-3.5" />
            )}
            Preview
          </Button>

          {isGenerating ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              className="h-7 text-xs gap-1.5"
            >
              <Square className="size-3.5" />
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleGenerate}
              className="h-7 text-xs gap-1.5"
              disabled={!activeConnectionId}
            >
              <Play className="size-3.5" />
              Generate
            </Button>
          )}
        </div>
      </div>

      {isGenerating && progress && (
        <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="capitalize">{progress.phase}…</span>
            <span>
              {progress.rowsInserted} / {progress.totalRows} rows
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {result && (
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2 border-b text-xs shrink-0',
            result.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'
          )}
        >
          {result.success ? (
            <CheckCircle2 className="size-3.5 shrink-0" />
          ) : (
            <AlertCircle className="size-3.5 shrink-0" />
          )}
          {result.success
            ? `Inserted ${result.rowsInserted} rows in ${result.durationMs}ms`
            : result.error ?? 'Generation failed'}
        </div>
      )}

      {error && !result && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-destructive/10 text-destructive text-xs shrink-0">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/20 shrink-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Column Generators
            </span>
          </div>

          <ScrollArea className="flex-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-8">Skip</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Column</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-40">Generator</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Options</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Null %</th>
                </tr>
              </thead>
              <tbody>
                {columnGenerators.map((gen) => (
                  <ColumnRow
                    key={gen.columnName}
                    generator={gen}
                    onUpdate={(updates) => updateGenerator(tabId, gen.columnName, updates)}
                    disabled={isGenerating}
                  />
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>

        {previewRows && previewRows.length > 0 && (
          <div className="w-[45%] border-l flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b bg-muted/20 shrink-0">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Preview (5 rows)
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      {previewColumns.map((col) => (
                        <th key={col} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b last:border-0 hover:bg-muted/30">
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="px-3 py-1.5 text-muted-foreground font-mono whitespace-nowrap max-w-[160px] truncate">
                            {cell === null ? (
                              <span className="text-muted-foreground/50 italic">null</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}

interface ColumnRowProps {
  generator: ColumnGenerator
  onUpdate: (updates: Partial<ColumnGenerator>) => void
  disabled: boolean
}

function ColumnRow({ generator, onUpdate, disabled }: ColumnRowProps) {
  return (
    <tr className={cn('border-b last:border-0 hover:bg-muted/20', generator.skip && 'opacity-40')}>
      <td className="px-4 py-1.5 text-center">
        <Checkbox
          checked={generator.skip}
          onCheckedChange={(checked) => onUpdate({ skip: !!checked })}
          disabled={disabled}
        />
      </td>
      <td className="px-4 py-1.5 font-medium">{generator.columnName}</td>
      <td className="px-4 py-1.5 text-muted-foreground font-mono">{generator.dataType}</td>
      <td className="px-4 py-1.5">
        <Select
          value={generator.generatorType}
          onValueChange={(v) => onUpdate({ generatorType: v as GeneratorType })}
        >
          <SelectTrigger className="h-6 text-xs" disabled={disabled || generator.skip}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GENERATOR_TYPES.map((gt) => (
              <SelectItem key={gt.value} value={gt.value} className="text-xs">
                {gt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-1.5">
        <GeneratorOptions generator={generator} onUpdate={onUpdate} disabled={disabled} />
      </td>
      <td className="px-4 py-1.5">
        <Input
          type="number"
          min={0}
          max={100}
          value={generator.nullPercentage}
          onChange={(e) => onUpdate({ nullPercentage: parseInt(e.target.value, 10) || 0 })}
          className="h-6 w-16 text-xs"
          disabled={disabled || generator.skip}
        />
      </td>
    </tr>
  )
}

interface GeneratorOptionsProps {
  generator: ColumnGenerator
  onUpdate: (updates: Partial<ColumnGenerator>) => void
  disabled: boolean
}

function GeneratorOptions({ generator, onUpdate, disabled }: GeneratorOptionsProps) {
  const type = generator.generatorType

  if (type === 'faker') {
    return (
      <Input
        placeholder="e.g. internet.email"
        value={generator.fakerMethod ?? ''}
        onChange={(e) => onUpdate({ fakerMethod: e.target.value })}
        className="h-6 text-xs w-40 font-mono"
        disabled={disabled || generator.skip}
      />
    )
  }

  if (type === 'random-int' || type === 'random-float') {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          placeholder="min"
          value={generator.minValue ?? ''}
          onChange={(e) => onUpdate({ minValue: parseFloat(e.target.value) || 0 })}
          className="h-6 w-16 text-xs"
          disabled={disabled || generator.skip}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          placeholder="max"
          value={generator.maxValue ?? ''}
          onChange={(e) => onUpdate({ maxValue: parseFloat(e.target.value) || 0 })}
          className="h-6 w-16 text-xs"
          disabled={disabled || generator.skip}
        />
      </div>
    )
  }

  if (type === 'fixed' || type === 'expression') {
    return (
      <Input
        placeholder="value"
        value={generator.fixedValue ?? ''}
        onChange={(e) => onUpdate({ fixedValue: e.target.value })}
        className="h-6 text-xs w-40"
        disabled={disabled || generator.skip}
      />
    )
  }

  if (type === 'random-enum') {
    return (
      <Input
        placeholder="a,b,c"
        value={generator.enumValues?.join(',') ?? ''}
        onChange={(e) => onUpdate({ enumValues: e.target.value.split(',').map((v) => v.trim()) })}
        className="h-6 text-xs w-40"
        disabled={disabled || generator.skip}
      />
    )
  }

  if (type === 'fk-reference') {
    return (
      <span className="text-muted-foreground font-mono text-xs">
        {generator.fkTable}.{generator.fkColumn}
      </span>
    )
  }

  return null
}
