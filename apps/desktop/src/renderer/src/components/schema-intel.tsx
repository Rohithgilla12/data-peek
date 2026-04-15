import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Play,
  SearchCode,
  ShieldAlert
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn
} from '@data-peek/ui'
import {
  SCHEMA_INTEL_CHECKS,
  type SchemaIntelCheckDefinition,
  type SchemaIntelCheckId,
  type SchemaIntelFinding,
  type SchemaIntelSeverity
} from '@data-peek/shared'

import { useConnectionStore } from '@/stores/connection-store'
import { useIntelStore } from '@/stores/intel-store'
import { useTabStore } from '@/stores/tab-store'

interface SchemaIntelPanelProps {
  tabId: string
}

const SEVERITY_ORDER: Record<SchemaIntelSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2
}

function severityBadgeClass(severity: SchemaIntelSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'warning':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    default:
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
  }
}

function SeverityIcon({ severity }: { severity: SchemaIntelSeverity }) {
  if (severity === 'critical') return <ShieldAlert className="size-3.5 text-red-400" />
  if (severity === 'warning') return <AlertTriangle className="size-3.5 text-amber-400" />
  return <Info className="size-3.5 text-blue-400" />
}

export function SchemaIntelPanel({ tabId }: SchemaIntelPanelProps) {
  const tab = useTabStore((s) => s.getTab(tabId))
  const connections = useConnectionStore((s) => s.connections)
  const connection = connections.find((c) => c.id === tab?.connectionId)
  const createQueryTab = useTabStore((s) => s.createQueryTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)

  const report = useIntelStore((s) => (connection ? s.reports[connection.id] : undefined))
  const isRunning = useIntelStore((s) =>
    connection ? Boolean(s.running[connection.id]) : false
  )
  const error = useIntelStore((s) => (connection ? s.errors[connection.id] : null))
  const selectedChecks = useIntelStore((s) =>
    connection ? s.selectedChecks[connection.id] : undefined
  )
  const run = useIntelStore((s) => s.run)
  const setSelectedChecks = useIntelStore((s) => s.setSelectedChecks)

  const availableChecks = useMemo<SchemaIntelCheckDefinition[]>(() => {
    if (!connection) return []
    return SCHEMA_INTEL_CHECKS.filter((c) =>
      c.supportedDbTypes.includes(connection.dbType)
    )
  }, [connection])

  const effectiveSelected: SchemaIntelCheckId[] = useMemo(() => {
    if (!selectedChecks) return availableChecks.map((c) => c.id)
    return selectedChecks.filter((id) =>
      availableChecks.some((c) => c.id === id)
    )
  }, [selectedChecks, availableChecks])

  const [expandedChecks, setExpandedChecks] = useState<Record<SchemaIntelCheckId, boolean>>(
    () =>
      Object.fromEntries(SCHEMA_INTEL_CHECKS.map((c) => [c.id, true])) as Record<
        SchemaIntelCheckId,
        boolean
      >
  )

  // Group findings by checkId, with severity sort within.
  const findingsByCheck = useMemo(() => {
    const map = new Map<SchemaIntelCheckId, SchemaIntelFinding[]>()
    if (!report) return map
    for (const f of report.findings) {
      const list = map.get(f.checkId) ?? []
      list.push(f)
      map.set(f.checkId, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    }
    return map
  }, [report])

  // Auto-run the first time this panel is opened for a new connection.
  useEffect(() => {
    if (!connection) return
    if (!report && !isRunning && !error) {
      run(connection, effectiveSelected.length > 0 ? effectiveSelected : undefined)
    }
    // We intentionally only depend on connection.id for the initial auto-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.id])

  if (!connection) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No connection selected
      </div>
    )
  }

  const toggleCheck = (id: SchemaIntelCheckId, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...effectiveSelected, id]))
      : effectiveSelected.filter((c) => c !== id)
    setSelectedChecks(connection.id, next)
  }

  const handleRun = () => {
    run(connection, effectiveSelected.length > 0 ? effectiveSelected : undefined)
  }

  const totalFindings = report?.findings.length ?? 0
  const criticalCount = report?.findings.filter((f) => f.severity === 'critical').length ?? 0
  const warningCount = report?.findings.filter((f) => f.severity === 'warning').length ?? 0
  const infoCount = report?.findings.filter((f) => f.severity === 'info').length ?? 0

  const openInTab = (sql: string) => {
    const id = createQueryTab(connection.id, sql)
    setActiveTab(id)
  }

  const copySql = async (sql: string) => {
    try {
      await navigator.clipboard.writeText(sql)
    } catch {
      // clipboard may be blocked in some contexts; ignore silently
    }
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <SearchCode className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Schema Intel</span>
            <span className="text-xs text-muted-foreground">
              · {connection.name || connection.host}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <span className="text-xs text-muted-foreground">
                Ran in {report.durationMs}ms
              </span>
            )}
            <Button size="sm" onClick={handleRun} disabled={isRunning} className="gap-2">
              {isRunning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {isRunning ? 'Running…' : report ? 'Re-run' : 'Run checks'}
            </Button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[280px_1fr] overflow-hidden">
          {/* Left rail: checks */}
          <div className="flex flex-col overflow-y-auto border-r">
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Checks
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Toggle which diagnostics to run.
              </p>
            </div>
            <div className="flex flex-col px-2 pb-4">
              {availableChecks.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Schema Intel isn&apos;t supported for this database yet.
                </p>
              ) : (
                availableChecks.map((check) => {
                  const enabled = effectiveSelected.includes(check.id)
                  const findings = findingsByCheck.get(check.id) ?? []
                  const wasSkipped = report?.skipped.find((s) => s.checkId === check.id)
                  return (
                    <label
                      key={check.id}
                      className={cn(
                        'group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/60',
                        !enabled && 'opacity-70'
                      )}
                    >
                      <Checkbox
                        checked={enabled}
                        onCheckedChange={(v) => toggleCheck(check.id, Boolean(v))}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium leading-tight">
                            {check.title}
                          </span>
                          {report &&
                            (findings.length > 0 ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'h-5 px-1.5 text-[10px] font-semibold',
                                  severityBadgeClass(check.severity)
                                )}
                              >
                                {findings.length}
                              </Badge>
                            ) : wasSkipped ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-muted-foreground">
                                    skipped
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  {wasSkipped.reason}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <CheckCircle2 className="size-3 text-green-500" />
                            ))}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {check.description}
                        </p>
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          {/* Right panel: findings */}
          <div className="flex flex-col overflow-y-auto">
            {error && (
              <div className="m-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            {!report && !error && !isRunning && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                <Activity className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Run the diagnostics to surface schema issues.
                </p>
              </div>
            )}

            {isRunning && !report && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Analyzing schema…</p>
              </div>
            )}

            {report && (
              <>
                {/* Summary strip */}
                <div className="flex items-center gap-4 border-b px-4 py-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="size-3.5 text-red-400" />
                    <span className="font-medium">{criticalCount}</span>
                    <span className="text-muted-foreground">critical</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 text-amber-400" />
                    <span className="font-medium">{warningCount}</span>
                    <span className="text-muted-foreground">warning</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Info className="size-3.5 text-blue-400" />
                    <span className="font-medium">{infoCount}</span>
                    <span className="text-muted-foreground">info</span>
                  </div>
                  <div className="ml-auto text-muted-foreground">
                    {totalFindings === 0
                      ? 'No findings. Schema looks clean.'
                      : `${totalFindings} finding${totalFindings === 1 ? '' : 's'}`}
                  </div>
                </div>

                {/* Findings grouped by check */}
                <div className="flex flex-col gap-3 p-3">
                  {availableChecks
                    .filter((c) => effectiveSelected.includes(c.id))
                    .map((check) => {
                      const findings = findingsByCheck.get(check.id) ?? []
                      const open = expandedChecks[check.id] !== false
                      return (
                        <Card key={check.id} className="overflow-hidden">
                          <Collapsible
                            open={open}
                            onOpenChange={(v) =>
                              setExpandedChecks((prev) => ({ ...prev, [check.id]: v }))
                            }
                          >
                            <CollapsibleTrigger asChild>
                              <CardHeader className="cursor-pointer py-3 hover:bg-muted/40">
                                <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
                                  <div className="flex min-w-0 items-center gap-2">
                                    {open ? (
                                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="truncate">{check.title}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {findings.length > 0 ? (
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'h-5 px-1.5 text-[10px] font-semibold',
                                          severityBadgeClass(check.severity)
                                        )}
                                      >
                                        {findings.length} finding
                                        {findings.length === 1 ? '' : 's'}
                                      </Badge>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground">
                                        clean
                                      </span>
                                    )}
                                  </div>
                                </CardTitle>
                              </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="pt-0">
                                {findings.length === 0 ? (
                                  <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                                    <CheckCircle2 className="size-3.5 text-green-500" />
                                    No issues found for this check.
                                  </p>
                                ) : (
                                  <div className="flex flex-col divide-y divide-border/60">
                                    {findings.map((finding, i) => (
                                      <FindingRow
                                        key={`${finding.checkId}-${i}`}
                                        finding={finding}
                                        onCopy={copySql}
                                        onOpenInTab={openInTab}
                                      />
                                    ))}
                                  </div>
                                )}
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      )
                    })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

function FindingRow({
  finding,
  onCopy,
  onOpenInTab
}: {
  finding: SchemaIntelFinding
  onCopy: (sql: string) => void
  onOpenInTab: (sql: string) => void
}) {
  const [showSql, setShowSql] = useState(false)
  const hasSql = Boolean(finding.suggestedSql)

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5">
        <SeverityIcon severity={finding.severity} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs font-medium leading-tight">{finding.title}</Label>
          <Badge
            variant="outline"
            className={cn(
              'h-4 px-1 text-[9px] font-semibold uppercase',
              severityBadgeClass(finding.severity)
            )}
          >
            {finding.severity}
          </Badge>
        </div>
        {finding.detail && (
          <p className="mt-1 text-[11px] text-muted-foreground">{finding.detail}</p>
        )}
        {finding.entity && (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {finding.entity.kind}
            {': '}
            {finding.entity.schema ? `${finding.entity.schema}.` : ''}
            {finding.entity.name}
          </p>
        )}
        {hasSql && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setShowSql((v) => !v)}
            >
              {showSql ? 'Hide fix' : 'Show fix'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onCopy(finding.suggestedSql!)}
            >
              <Copy className="mr-1 size-3" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onOpenInTab(finding.suggestedSql!)}
            >
              Open in new tab
            </Button>
          </div>
        )}
        {hasSql && showSql && (
          <pre className="mt-2 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-snug">
            {finding.suggestedSql}
          </pre>
        )}
      </div>
    </div>
  )
}

interface SchemaIntelHeaderButtonProps {
  findingsCount: number
  severity: SchemaIntelSeverity
}

/** Small inline component used elsewhere to show a summary pill (optional). */
export function SchemaIntelBadge({
  findingsCount,
  severity
}: SchemaIntelHeaderButtonProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 px-1.5 text-[10px] font-semibold',
        severityBadgeClass(severity)
      )}
    >
      {findingsCount}
    </Badge>
  )
}

export default SchemaIntelPanel
