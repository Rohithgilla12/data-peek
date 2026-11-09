import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeftIcon, MonitorIcon, MoonIcon, SunIcon } from '@/components/icons'
import { Button, Input, Switch, cn, keys } from '@data-peek/ui'
import { useTheme } from '@/components/theme-provider'
import { useLicenseStore, useSettingsStore } from '@/stores'
import { McpSettingsSection } from '@/components/mcp-settings-section'
import { AuditSettingsSection } from '@/components/audit-settings-section'
import { TimeMachineSettingsSection } from '@/components/time-machine-settings-section'
import { AISettingsSection } from './ai-settings-section'
import { SETTINGS_SECTIONS, parseSettingsSection, type SettingsSection } from './sections'
import { SettingRow, SettingsGroup } from './settings-layout'

const SECTION_BODY: Record<SettingsSection, () => React.JSX.Element> = {
  general: GeneralSection,
  ai: AISettingsSection,
  integrations: McpSettingsSection,
  history: HistorySection,
  shortcuts: ShortcutsSection,
  license: LicenseSection
}

export function SettingsPage() {
  const section = parseSettingsSection(useSearch({ from: '/settings' }).section)
  const navigate = useNavigate()
  const Body = SECTION_BODY[section]
  const label = SETTINGS_SECTIONS.find((s) => s.id === section)?.label

  return (
    <div className="flex flex-1 min-h-0">
      <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border/50 p-3">
        <Link
          to="/"
          className="mb-3 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Link>
        {SETTINGS_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === section ? 'page' : undefined}
            onClick={() => navigate({ to: '/settings', search: { section: s.id } })}
            className={cn(
              'rounded-md px-2 py-1.5 text-left text-sm transition-colors',
              s.id === section
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl space-y-8 px-8 py-6 pb-12">
          <h1 className="text-lg font-semibold">{label}</h1>
          <Body />
        </div>
      </div>
    </div>
  )
}

const THEMES = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon }
] as const

function GeneralSection() {
  const { theme, setTheme } = useTheme()
  const s = useSettingsStore()

  return (
    <>
      <SettingsGroup title="Appearance">
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                theme === value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Editor">
        <SettingRow
          id="hide-editor"
          label="Collapse the editor for table previews"
          description="Opening a table shows its rows first. The editor stays one click away."
        >
          <Switch
            id="hide-editor"
            checked={s.hideQueryEditorByDefault}
            onCheckedChange={s.setHideQueryEditorByDefault}
          />
        </SettingRow>
        <SettingRow
          id="hide-quick-query-panel"
          label="Hide the quick query panel"
          description="Keeps the sidebar to schemas and saved items."
        >
          <Switch
            id="hide-quick-query-panel"
            checked={s.hideQuickQueryPanel}
            onCheckedChange={s.setHideQuickQueryPanel}
          />
        </SettingRow>
        <SettingRow
          id="query-timeout"
          label="Query timeout (seconds)"
          description="Cancel queries that run longer than this. Leave empty for no limit."
        >
          <Input
            id="query-timeout"
            type="number"
            min={0}
            className="w-24"
            value={s.queryTimeoutMs === 0 ? '' : s.queryTimeoutMs / 1000}
            placeholder="0"
            onChange={(e) => {
              const parsed = e.target.value ? parseFloat(e.target.value) : 0
              const seconds = isNaN(parsed) || parsed < 0 ? 0 : parsed
              s.setQueryTimeoutMs(Math.round(seconds * 1000))
            }}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Results">
        <SettingRow
          id="expand-json"
          label="Expand JSON cells"
          description="Open JSON values expanded instead of collapsed."
        >
          <Switch
            id="expand-json"
            checked={s.expandJsonByDefault}
            onCheckedChange={s.setExpandJsonByDefault}
          />
        </SettingRow>
        <SettingRow
          id="json-depth"
          label="JSON expansion depth"
          description="Levels to expand, 1 to 10."
        >
          <Input
            id="json-depth"
            type="number"
            min={1}
            max={10}
            className="w-24"
            value={s.jsonExpandDepth}
            onChange={(e) => {
              const val = parseInt(e.target.value)
              if (!isNaN(val)) s.setJsonExpandDepth(val)
            }}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Extras">
        <SettingRow
          id="pokemon-buddy"
          label="Pokemon buddy"
          description="A small companion in the sidebar that reacts to your queries."
        >
          <Switch
            id="pokemon-buddy"
            checked={s.pokemonBuddyEnabled}
            onCheckedChange={s.setPokemonBuddyEnabled}
          />
        </SettingRow>
      </SettingsGroup>

      <div className="border-t border-border/50 pt-4">
        <Button variant="ghost" size="sm" onClick={s.resetSettings}>
          Reset to defaults
        </Button>
      </div>
    </>
  )
}

function HistorySection() {
  return (
    <>
      <TimeMachineSettingsSection />
      <AuditSettingsSection />
    </>
  )
}

function LicenseSection() {
  const status = useLicenseStore((s) => s.status)
  const openSettingsModal = useLicenseStore((s) => s.openSettingsModal)
  const openActivationModal = useLicenseStore((s) => s.openActivationModal)
  const isPersonal = !status || status.type === 'personal'
  const expired = !!status?.daysUntilExpiry && status.daysUntilExpiry <= 0

  return (
    <SettingsGroup title="Status">
      <SettingRow
        label={isPersonal ? 'Personal use (free)' : `${status.type} license`}
        description={
          isPersonal
            ? 'Free for personal projects. Commercial use needs a license.'
            : (status.email ?? undefined)
        }
      >
        <div className="flex items-center gap-3">
          {!isPersonal && (
            <span className={cn('text-xs', expired ? 'text-warning' : 'text-success')}>
              {expired ? 'Expired' : 'Active'}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={isPersonal ? openActivationModal : openSettingsModal}
          >
            {isPersonal ? 'Activate license' : 'Manage license'}
          </Button>
        </div>
      </SettingRow>
    </SettingsGroup>
  )
}

const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: 'Tabs',
    items: [
      { keys: [keys.mod, 'T'], label: 'New Ask tab' },
      { keys: [keys.mod, keys.shift, 'T'], label: 'New SQL tab' },
      { keys: [keys.mod, 'W'], label: 'Close tab' },
      { keys: [keys.mod, '1-9'], label: 'Go to tab by number' },
      { keys: [keys.mod, keys.alt, '→'], label: 'Next tab' },
      { keys: [keys.mod, keys.alt, '←'], label: 'Previous tab' }
    ]
  },
  {
    group: 'Connections',
    items: [
      { keys: [keys.mod, 'P'], label: 'Switch connection' },
      { keys: [keys.mod, keys.shift, '1-9'], label: 'Go to connection by number' }
    ]
  },
  {
    group: 'Editor',
    items: [
      { keys: [keys.mod, 'Enter'], label: 'Run query' },
      { keys: [keys.mod, keys.shift, 'F'], label: 'Format SQL' },
      { keys: [keys.mod, keys.shift, 'W'], label: 'Toggle Watch Mode' },
      { keys: [keys.mod, keys.shift, 'H'], label: 'Toggle Time Machine' }
    ]
  },
  {
    group: 'Editing data',
    items: [
      { keys: [keys.mod, 'S'], label: 'Save pending changes' },
      { keys: [keys.mod, keys.shift, 'Z'], label: 'Discard all changes' },
      { keys: [keys.mod, keys.shift, 'A'], label: 'Add row' },
      { keys: ['Esc'], label: 'Exit edit mode' },
      { keys: ['Click'], label: 'Open foreign key in side panel' },
      { keys: [keys.mod, 'Click'], label: 'Open foreign key in new tab' }
    ]
  },
  {
    group: 'App',
    items: [
      { keys: [keys.mod, 'K'], label: 'Command palette' },
      { keys: [keys.mod, 'B'], label: 'Toggle sidebar' },
      { keys: [keys.mod, 'I'], label: 'AI assistant panel' },
      { keys: [keys.mod, ','], label: 'Settings' }
    ]
  }
]

function ShortcutsSection() {
  return (
    <>
      {SHORTCUTS.map(({ group, items }) => (
        <SettingsGroup key={group} title={group}>
          <div className="divide-y divide-border/30">
            {items.map(({ keys: combo, label }) => (
              <div key={label} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{label}</span>
                <span className="flex items-center gap-1">
                  {combo.map((k) => (
                    <kbd
                      key={k}
                      className="rounded border border-border/50 bg-muted px-1.5 py-0.5 text-xs text-foreground"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </SettingsGroup>
      ))}
    </>
  )
}
