import { memo, useMemo, useCallback } from 'react'
import { format, isSameDay, isFirstDayOfMonth, getDay, getISOWeek } from 'date-fns'
import { enGB } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import { cn, getInitials, getAvatarColor } from '@/lib/utils'
import { isHoliday, isWeekend } from '@/lib/holidays'
import { isDayAssigned } from '@/lib/timeline-helpers'
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar'
import { ExpandedAssignmentBar } from './ExpandedAssignmentBar'
import { AssignmentCommentOverlay } from './AssignmentCommentOverlay'
import { DeleteDragOverlay } from './DeleteDragOverlay'
import { MilestoneIndicator } from './MilestoneIndicator'
import type { TeamMember, Project } from '@/types'
import type { AssignmentRowProps, IndexedDateInfo } from './types'

/**
 * Compute week-start boundaries for an array of dates.
 * A date is a week start if it's the first date, a Monday, or if the
 * previous date is in a different ISO week (handles skipped weekends).
 */
export function computeWeekStarts(dates: Date[]): boolean[] {
  return dates.map((date, index) => {
    if (index === 0) return true
    if (getDay(date) === 1) return true
    const prevDate = dates[index - 1]
    if (getISOWeek(prevDate) !== getISOWeek(date)) return true
    return false
  })
}

/**
 * Precompute date metadata for all dates in a single pass.
 * Returns a Map keyed by date.toISOString() for O(1) lookup.
 *
 * This separates pure date computation (depends only on `dates`)
 * from render-time logic (depends on assignment state, handlers, etc.),
 * enabling a much smaller useMemo dependency array.
 */
export function computeDateInfo(dates: Date[]): Map<string, IndexedDateInfo> {
  const weekStarts = computeWeekStarts(dates)
  const today = new Date()
  const map = new Map<string, IndexedDateInfo>()
  dates.forEach((date, index) => {
    map.set(date.toISOString(), {
      date,
      dateStr: date.toISOString(),
      isWeekend: isWeekend(date),
      isHoliday: isHoliday(date),
      isToday: isSameDay(date, today),
      isFirstDayOfMonth: isFirstDayOfMonth(date),
      isWeekStart: weekStarts[index],
    })
  })
  return map
}

/**
 * AssignmentRow Component
 *
 * Renders a single assignment row showing dates with assignment bars, day-off indicators, and milestones.
 * Used in both by-project and by-member views within expanded items.
 *
 * In by-project view (member rows):
 * - Shows member avatar and name
 * - Shows member role badge
 * - Date cells can have day-off indicators
 * - Assignment bars colored based on overlap (orange if overlap, green otherwise)
 *
 * In by-member view (project rows):
 * - Shows project customer and name
 * - Shows project status (Clock icon for tentative)
 * - Date cells can have milestone indicators
 * - Assignment bars always green
 *
 * Features:
 * - Responsive row structure with sticky sidebar
 * - Uses all small components: DayOffIndicator, ExpandedAssignmentBar, AssignmentCommentOverlay, MilestoneIndicator
 * - Week start and month start borders on date cells
 * - Today highlighting
 * - Holiday and weekend styling
 * - Interactive drag-to-assign functionality
 * - Click/right-click to delete assignments
 *
 * Memoized to prevent unnecessary re-renders during drag operations.
 *
 * @param viewMode - Current view mode ('by-project' or 'by-member')
 * @param assignment - The project assignment to render
 * @param parentItem - The expanded parent (project or member)
 * @param childItem - The row item (member or project)
 * @param dates - Array of dates to display
 * @param columnWidth - Width class for date columns
 * @param zoomLevel - Current zoom level
 * @param isAdmin - Whether current user has admin permissions
 * @param showOverlaps - Whether to show overlap visualization
 * @param dayAssignments - All day assignments
 * @param assignmentGroups - All assignment groups
 * @param projectAssignments - All project assignments
 * @param projects - All projects
 * @param dayOffs - All day-off records
 * @param milestones - All milestones
 * @param handleMouseDown - Handler for mouse down (drag start)
 * @param handleMouseEnter - Handler for mouse enter (drag continue)
 * @param handleAssignmentClick - Handler for assignment click
 * @param handleDeleteDayAssignment - Handler for delete assignment
 * @param handleProjectCellClick - Handler for project cell click (milestone toggle)
 * @param isDayInDragRange - Check if date is in drag range
 * @param isDayOff - Check if date is a day off for member
 * @param hasOverlap - Check if date has overlap
 * @param canEditAssignment - Check if assignment can be edited
 * @param canEditProject - Check if project can be edited
 * @param getGroupPriority - Get priority for assignment on date
 */
const AssignmentRowComponent: React.FC<AssignmentRowProps> = ({
  viewMode,
  assignment,
  parentItem,
  childItem,
  dates,
  columnWidth,
  zoomLevel,
  isAdmin,
  showOverlaps: _showOverlaps,
  dayAssignments,
  assignmentGroups,
  projectAssignments,
  projects: _projects,
  dayOffs: _dayOffs,
  milestones,
  handleMouseDown,
  handleMouseEnter,
  handleAssignmentClick,
  handleDeleteDayAssignment,
  handleProjectCellClick,
  isDayInDragRange,
  getDragMode,
  isDayOff,
  isNonWorkingDay,
  hasOverlap,
  canEditAssignment: _canEditAssignment,
  canEditProject,
  getGroupPriority,
  dragState,
}) => {
  // Precompute date metadata (isWeekend, isHoliday, isToday, etc.) in a single pass.
  // Depends only on `dates` — pure module-level functions (isWeekend, isHoliday) have no runtime state.
  const dateInfoMap = useMemo(() => computeDateInfo(dates), [dates])

  // Curried handler factories for ExpandedAssignmentBar — stable references for React.memo
  const handleBarMouseDown = useCallback((_assignmentId: number, _date: Date) => (e: React.MouseEvent) => {
    const isDeleteTrigger = e.button === 2 || e.ctrlKey || e.metaKey
    const isMoveTrigger = e.altKey
    if (!isDeleteTrigger && !isMoveTrigger) {
      e.stopPropagation()
    }
  }, [])

  const handleBarClick = useCallback((assignmentId: number, date: Date) => (e: React.MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey && isDayAssigned(dayAssignments, assignmentId, date)) {
      handleAssignmentClick(assignmentId, date, e)
    }
  }, [dayAssignments, handleAssignmentClick])

  const handleBarContextMenu = useCallback((_assignmentId: number, _date: Date) => (e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  // Render by-project view (member rows)
  if (viewMode === 'by-project') {
    const member = childItem as TeamMember
    const project = parentItem as Project

    return (
      <div key={assignment.id} className="flex border-t bg-background hover:bg-muted/20 transition-colors relative">
        <div className="sticky left-0 z-50 w-64 p-2.5 pl-12 border-r flex items-center gap-2 bg-background shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
          <span className="absolute top-[11px] left-[38px] w-1.5 h-3 border-l-2 border-b-2 border-gray-300"></span>
          <Avatar className="h-6 w-6 ring-1 ring-border/50">
            <AvatarImage src={member.avatarUrl || undefined} />
            <AvatarFallback
              className="text-xs"
              style={{
                backgroundColor: getAvatarColor(member.firstName, member.lastName).bg,
                color: getAvatarColor(member.firstName, member.lastName).text,
              }}
            >
              {getInitials(member.firstName, member.lastName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm">
            {member.firstName} {member.lastName}
          </span>
        </div>
        {/* Date cells — dateInfoMap provides precomputed metadata, isDayOff is per-member */}
        {dates.map((date) => {
          const info = dateInfoMap.get(date.toISOString())!
          const dayOff = isDayOff(member.id, date)
          return (
            <div
              key={info.dateStr}
              className={cn(
                columnWidth, 'border-r group relative flex items-center justify-center select-none',
                project.status === 'tentative' && 'bg-background',
                info.isWeekend && 'bg-weekend',
                info.isHoliday && 'bg-holiday',
                dayOff && 'bg-dayOff',
                info.isToday && 'bg-primary/10 border-x-2 border-x-primary',
                isAdmin && 'cursor-pointer',
                info.isFirstDayOfMonth && 'border-l-4 border-l-border',
                info.isWeekStart && !info.isFirstDayOfMonth && 'border-l-4 border-l-muted-foreground'
              )}
              onMouseDown={(_e) =>
                handleMouseDown(assignment.id, info.date, _e)
              }
              onMouseEnter={() => handleMouseEnter(info.date)}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey) {
                  // Regular click - no action on cell
                }
              }}
              onContextMenu={(_e) => {
                _e.preventDefault()
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-muted-foreground/40 dark:text-muted-foreground/60 font-medium">
                  {format(info.date, 'EEE', { locale: enGB })}
                </span>
              </div>
              <ExpandedAssignmentBar
                assignmentId={assignment.id}
                date={info.date}
                projectAssignments={projectAssignments}
                dayAssignments={dayAssignments}
                project={project}
                member={member}
                isDayInDragRange={isDayInDragRange(assignment.id, info.date)}
                dragMode={getDragMode()}
                isAdmin={isAdmin}
                hasOverlap={hasOverlap(member.id, info.date, 'member')}
                onMouseDown={handleBarMouseDown(assignment.id, info.date)}
                onClick={handleBarClick(assignment.id, info.date)}
                onContextMenu={handleBarContextMenu(assignment.id, info.date)}
                getGroupPriority={getGroupPriority}
                isNonWorkingDay={isNonWorkingDay}
                isHoliday={isHoliday}
                dragState={dragState}
              />
            </div>
          )
        })}
        {/* Comment overlay rendered at row level to appear above all bar segments */}
        <AssignmentCommentOverlay
          assignmentId={assignment.id}
          dates={dates}
          dayAssignments={dayAssignments}
          assignmentGroups={assignmentGroups}
          zoomLevel={zoomLevel}
          onCommentClick={(assignmentId, date, e) => {
            handleAssignmentClick(assignmentId, date, e)
          }}
          onCommentContextMenu={(assignmentId, date, e) => {
            handleDeleteDayAssignment(assignmentId, date, e)
          }}
        />
        {/* Delete drag overlay */}
        <DeleteDragOverlay
          assignmentId={assignment.id}
          dates={dates}
          isDayInDragRange={isDayInDragRange}
          getDragMode={getDragMode}
          zoomLevel={zoomLevel}
        />
      </div>
    )
  }

  // Render by-member view (project rows)
  const project = childItem as Project
  const member = parentItem as TeamMember

  return (
    <div key={assignment.id} className="flex border-t bg-background hover:bg-muted/20 transition-colors relative">
      <div className="sticky left-0 z-50 w-64 p-2 pl-12 border-r bg-background shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
        <span className="absolute top-[8px] left-[38px] w-1.5 h-3 border-l-2 border-b-2 border-gray-300"></span>
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "text-sm font-medium",
            project.status === 'tentative' && 'text-muted-foreground'
          )}>{project.name}</div>
          {project.status === 'tentative' ? (
            <div className="flex items-center text-sm font-medium text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
            </div>
          ) : (
            ""
          )}
        </div>
        <div className={cn(
          "text-xs",
          project.status === 'tentative' && 'text-muted-foreground'
        )}>
          {project.customer?.icon && `${project.customer.icon} `}
          {project.customer?.name}
        </div>
      </div>
      {/* Date cells — dateInfoMap provides precomputed metadata, isDayOff is per-member */}
      {dates.map((date) => {
        const info = dateInfoMap.get(date.toISOString())!
        const dayOff = isDayOff(member.id, date)
        return (
          <div
            key={info.dateStr}
            className={cn(
              columnWidth, 'border-r group relative flex items-center justify-center select-none',
              project.status === 'tentative' && 'bg-background',
              info.isWeekend && 'bg-weekend',
              info.isHoliday && 'bg-holiday',
              dayOff && 'bg-dayOff',
              info.isToday && 'bg-primary/10 border-x-2 border-x-primary',
              isAdmin && 'cursor-pointer',
              info.isFirstDayOfMonth && 'border-l-4 border-l-border',
              info.isWeekStart && !info.isFirstDayOfMonth && 'border-l-4 border-l-muted-foreground'
            )}
            onMouseDown={(_e) =>
              handleMouseDown(assignment.id, info.date, _e)
            }
            onMouseEnter={() => handleMouseEnter(info.date)}
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey) {
                // Regular click - no action on cell
              }
            }}
            onContextMenu={(_e) => {
              _e.preventDefault()
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <span className="text-xs text-muted-foreground/40 dark:text-muted-foreground/80 font-medium">
                {format(info.date, 'EEE', { locale: enGB })}
              </span>
            </div>
            <MilestoneIndicator
              projectId={project.id}
              date={info.date}
              milestones={milestones}
              canEdit={canEditProject(project.id)}
              onToggle={handleProjectCellClick}
            />
            <ExpandedAssignmentBar
              assignmentId={assignment.id}
              date={info.date}
              projectAssignments={projectAssignments}
              dayAssignments={dayAssignments}
              project={project}
              member={member}
              isDayInDragRange={isDayInDragRange(assignment.id, info.date)}
              dragMode={getDragMode()}
              isAdmin={isAdmin}
              hasOverlap={false}
              onMouseDown={handleBarMouseDown(assignment.id, info.date)}
              onClick={handleBarClick(assignment.id, info.date)}
              onContextMenu={handleBarContextMenu(assignment.id, info.date)}
              getGroupPriority={getGroupPriority}
              isNonWorkingDay={isNonWorkingDay}
              isHoliday={isHoliday}
              dragState={dragState}
            />
          </div>
        )
      })}
      {/* Comment overlay rendered at row level to appear above all bar segments */}
      <AssignmentCommentOverlay
        assignmentId={assignment.id}
        dates={dates}
        dayAssignments={dayAssignments}
        assignmentGroups={assignmentGroups}
        zoomLevel={zoomLevel}
        onCommentClick={(assignmentId, date, e) => {
          handleAssignmentClick(assignmentId, date, e)
        }}
        onCommentContextMenu={(assignmentId, date, e) => {
          handleDeleteDayAssignment(assignmentId, date, e)
        }}
      />
      {/* Delete drag overlay */}
      <DeleteDragOverlay
        assignmentId={assignment.id}
        dates={dates}
        isDayInDragRange={isDayInDragRange}
        getDragMode={getDragMode}
        zoomLevel={zoomLevel}
      />
    </div>
  )
}

// Memoize the component to prevent re-renders when props haven't changed
// This is critical for performance during drag operations
export const AssignmentRow = memo(AssignmentRowComponent)
