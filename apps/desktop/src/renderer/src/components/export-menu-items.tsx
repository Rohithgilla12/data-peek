import { Copy, Download, FileCode2, FileJson, FileSpreadsheet, type LucideIcon } from 'lucide-react'
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
  Icon: LucideIcon
}> = [
  { format: 'csv', label: 'CSV', Icon: FileSpreadsheet },
  { format: 'json', label: 'JSON', Icon: FileJson },
  { format: 'sql', label: 'SQL', Icon: FileCode2 }
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
              <Download className="size-4 text-muted-foreground" />
              Download file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSelect(format, 'clipboard')}>
              <Copy className="size-4 text-muted-foreground" />
              Copy to clipboard
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  )
}
