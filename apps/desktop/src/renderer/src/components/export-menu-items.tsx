import {
  CopyIcon,
  DownloadIcon,
  FileCodeIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  type IconComponent
} from '@/components/icons'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@data-peek/ui'
import type { ExportDestination, ExportFormat } from '@/lib/export'

const exportFormats: Array<{
  format: ExportFormat
  label: string
  Icon: IconComponent
}> = [
  { format: 'csv', label: 'CSV', Icon: FileSpreadsheetIcon },
  { format: 'json', label: 'JSON', Icon: FileJsonIcon },
  { format: 'sql', label: 'SQL', Icon: FileCodeIcon },
  { format: 'markdown', label: 'Markdown', Icon: FileTextIcon }
]

interface ExportMenuItemsProps {
  onSelect: (format: ExportFormat, destination: ExportDestination) => void
}

export function ExportMenuItems({ onSelect }: ExportMenuItemsProps) {
  return (
    <>
      {exportFormats.map(({ format, label, Icon }) => (
        <DropdownMenuSub key={format}>
          <DropdownMenuSubTrigger>
            <Icon className="size-4 text-muted-foreground" />
            {label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuItem onClick={() => onSelect(format, 'download')}>
              <DownloadIcon className="size-4 text-muted-foreground" />
              Download file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSelect(format, 'clipboard')}>
              <CopyIcon className="size-4 text-muted-foreground" />
              Copy to clipboard
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  )
}
