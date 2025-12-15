import * as React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useSettingsStore, PAGE_SIZE_OPTIONS, type PageSizeOption } from '@/stores/settings-store'

interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  pageSize: number
  totalRows: number
  filteredRows?: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  canPreviousPage: boolean
  canNextPage: boolean
}

export function PaginationControls({
  currentPage,
  totalPages,
  pageSize,
  totalRows,
  filteredRows,
  onPageChange,
  onPageSizeChange,
  canPreviousPage,
  canNextPage
}: PaginationControlsProps) {
  const { setDefaultPageSize } = useSettingsStore()
  const [jumpToPage, setJumpToPage] = React.useState('')

  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endRow = Math.min(currentPage * pageSize, filteredRows ?? totalRows)
  const displayTotalRows = filteredRows ?? totalRows

  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value, 10) as PageSizeOption
    onPageSizeChange(newSize)
    setDefaultPageSize(newSize)
  }

  const handleJumpToPage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(jumpToPage, 10)
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        onPageChange(page)
        setJumpToPage('')
      }
    }
  }

  const handleJumpToPageBlur = () => {
    const page = parseInt(jumpToPage, 10)
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page)
    }
    setJumpToPage('')
  }

  return (
    <div className="flex items-center justify-between py-2 shrink-0">
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground">
          {displayTotalRows === 0 ? (
            'No rows'
          ) : (
            <>
              Rows{' '}
              <span className="font-medium text-foreground">
                {startRow}-{endRow}
              </span>{' '}
              of{' '}
              <span className="font-medium text-foreground">
                {displayTotalRows.toLocaleString()}
              </span>
              {filteredRows !== undefined && filteredRows !== totalRows && (
                <span className="text-muted-foreground/70">
                  {' '}
                  (filtered from {totalRows.toLocaleString()})
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-7 w-[70px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Go to</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={jumpToPage}
              onChange={(e) => setJumpToPage(e.target.value)}
              onKeyDown={handleJumpToPage}
              onBlur={handleJumpToPageBlur}
              placeholder={String(currentPage)}
              className="h-7 w-[60px] text-xs text-center"
            />
            <span className="text-xs text-muted-foreground">of {totalPages}</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onPageChange(1)}
            disabled={!canPreviousPage}
            title="First page"
          >
            <ChevronsLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canPreviousPage}
            title="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canNextPage}
            title="Next page"
          >
            <ChevronRight className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onPageChange(totalPages)}
            disabled={!canNextPage}
            title="Last page"
          >
            <ChevronsRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
