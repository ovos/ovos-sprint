import { format, isFirstDayOfMonth, getDay, getISOWeek } from 'date-fns'
import { enGB } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { isWeekend, getHolidayName, isHoliday } from '@/lib/holidays'
import { ZOOM_PIXEL_WIDTHS } from '@/lib/timeline-constants'
import type { TimelineHeaderProps, ZoomLevel } from './types'

/**
 * Timeline z-index stacking order:
 *   z-20   Assignment bars & comment overlays
 *   z-30   Priority indicators & delete drag overlay
 *   z-50   Sticky sidebars (left-pinned columns)
 *   z-[60] Sticky timeline header (top-pinned rows)
 *   z-[65] AssignmentEditPopover (portaled, above all timeline chrome)
 *   z-[70] shadcn/ui overlays (Tooltip, Popover, Dialog, Select)
 *   z-[100] Toast notifications
 */

/**
 * TimelineHeader Component
 *
 * Renders the timeline header with month groups and date columns.
 * This is a two-row header structure:
 * - Top row: Month labels with proper column spanning
 * - Bottom row: Individual date cells with day of week, date, and week number
 *
 * Features:
 * - Month grouping with calculated pixel widths based on zoom level
 * - Date cells showing day of week (EEE), day of month (d)
 * - Week numbers displayed on Mondays
 * - Special borders for first day of month and week starts
 * - Today highlighting with primary color
 * - Holiday names displayed in date cells
 * - Weekend highlighting with muted text
 *
 * @param dates - Array of dates to display
 * @param monthGroups - Grouped months with count and first date
 * @param columnWidth - Tailwind CSS width class for columns
 * @param zoomLevel - Current zoom level (1-4)
 * @param label - Optional label for the sidebar header (defaults to "Projects")
 */
export function TimelineHeader({
  dates,
  monthGroups,
  columnWidth,
  zoomLevel,
  label = 'Projects',
}: TimelineHeaderProps) {
  const today = new Date()

  /**
   * Check if a date is the start of a week
   * First visible date always gets a separator, as do Mondays
   */
  const isWeekStart = (date: Date, dateIndex: number): boolean => {
    // First visible date always gets a separator
    if (dateIndex === 0) return true

    // Monday (getDay returns 1 for Monday) gets a separator
    return getDay(date) === 1
  }

  return (
    <div className="sticky top-0 bg-background z-[60] shadow-sm">
      {/* Month labels row */}
      <div className="flex border-b">
        <div className="w-64 border-r bg-muted/30"></div>
        {monthGroups.map((group, idx) => {
          // Calculate width based on column count and zoom level
          const pixelWidth = ZOOM_PIXEL_WIDTHS[zoomLevel as ZoomLevel] || 64
          const totalWidth = group.count * pixelWidth

          return (
            <div
              key={idx}
              style={{ width: `${totalWidth}px` }}
              className={cn(
                'p-2 text-center font-semibold text-sm bg-muted/50 border-r',
                isFirstDayOfMonth(group.firstDate) && 'border-l-4 border-l-border'
              )}
            >
              {group.month}
            </div>
          )
        })}
      </div>

      {/* Date row */}
      <div className="flex border-b-2">
        <div className="sticky left-0 z-50 w-64 p-3 font-semibold border-r bg-background shadow-[2px_0_4px_rgba(0,0,0,0.1)]">{label}</div>
        {dates.map((date, dateIndex) => {
          const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
          const isWeekendDay = isWeekend(date)
          const isHolidayDay = isHoliday(date)
          const isMonday = getDay(date) === 1

          return (
            <div
              key={date.toISOString()}
              className={cn(
                columnWidth,
                'p-2 text-center text-[10px] border-r',
                isWeekendDay && 'text-muted-foreground',
                isHolidayDay && 'bg-holiday',
                isToday && 'bg-muted/50',
                isFirstDayOfMonth(date) && 'border-l-4 border-l-border',
                isWeekStart(date, dateIndex) &&
                !isFirstDayOfMonth(date) &&
                'border-l-4 border-l-muted-foreground'
              )}
            >
              <div className={cn('font-medium', isToday && 'text-primary')}>
                {format(date, 'EEE', { locale: enGB })}
              </div>
              <div className={cn('text-xs', isToday && 'text-primary font-semibold')}>
                {format(date, 'd', { locale: enGB })}
              </div>
              {isMonday && (
                <div className="text-xs text-muted-foreground">W{getISOWeek(date)}</div>
              )}
              {isHolidayDay && (
                <div className="text-xs text-purple-700 dark:text-purple-400 font-medium truncate px-1">
                  {getHolidayName(date)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
