import { TimelineHeader } from './TimelineHeader'
import { TimelineItemHeader } from './TimelineItemHeader'
import { AssignmentRow } from './AssignmentRow'
import { hasAssignmentInDateRange } from '@/lib/timeline-helpers'
import type { Project, TeamMember, ProjectAssignment } from '@/types'
import type { TimelineViewContentProps } from './types'

/**
 * TimelineViewContent Component
 *
 * Renders the main timeline content with header and all rows for either by-project or by-member view.
 * Handles the layout and iteration of items (projects or members) and their expanded assignment rows.
 *
 * In by-project view:
 * - Shows projects with TimelineItemHeader
 * - When expanded, shows member rows (AssignmentRow) for each project assignment
 * - When collapsed, shows milestone indicators in the header row
 *
 * In by-member view:
 * - Shows members with TimelineItemHeader
 * - When expanded, shows project rows (AssignmentRow) for each member's assignments
 * - When collapsed, shows day-off indicators in the header row
 *
 * Features:
 * - Renders TimelineHeader component for date labels
 * - Loops over items (projects or members)
 * - For each item:
 *   - Renders TimelineItemHeader
 *   - If expanded: loops over assignments and renders AssignmentRow for each
 * - Handles both by-project and by-member views with conditional logic
 * - Proper overflow and scrolling
 * - Min-width styling for horizontal scroll
 *
 * @param viewMode - Current view mode ('by-project' or 'by-member')
 * @param items - Array of items to display (projects or members)
 * @param projects - All projects
 * @param members - All members
 * @param projectAssignments - All project assignments
 * @param dayAssignments - All day assignments
 * @param milestones - All milestones
 * @param dayOffs - All day-off records
 * @param settings - User settings
 * @param assignmentGroups - All assignment groups
 * @param dates - Array of dates to display
 * @param monthGroups - Month grouping data for header
 * @param columnWidth - Width class for date columns
 * @param zoomLevel - Current zoom level
 * @param expandedItems - Set of expanded item IDs
 * @param onToggleExpand - Handler for expand/collapse toggle
 * @param isAdmin - Whether current user has admin permissions
 * @param showOverlaps - Whether to show overlap visualization
 * @param showTentative - Whether to show tentative projects
 * @param handleMouseDown - Handler for mouse down (drag start)
 * @param handleMouseEnter - Handler for mouse enter (drag continue)
 * @param handleAssignmentClick - Handler for assignment click
 * @param handleDeleteDayAssignment - Handler for delete assignment
 * @param handleProjectCellClick - Handler for project cell click (milestone toggle)
 * @param canEditProject - Check if project can be edited
 * @param canEditAssignment - Check if assignment can be edited
 * @param isDayOff - Check if date is a day off for member
 * @param isDayInDragRange - Check if date is in drag range
 * @param hasOverlap - Check if date has overlap
 * @param getGroupPriority - Get priority for assignment on date
 */
export function TimelineViewContent({
  viewMode,
  items,
  projects,
  members: _members,
  memberById,
  projectById,
  projectAssignments,
  dayAssignments,
  milestones,
  dayOffs,
  settings: _settings,
  assignmentGroups,
  dates,
  monthGroups,
  columnWidth,
  zoomLevel,
  expandedItems,
  onToggleExpand,
  isAdmin,
  showOverlaps,
  showTentative,
  hideEmptyRows,
  handleMouseDown,
  handleMouseEnter,
  handleAssignmentClick,
  handleDeleteDayAssignment,
  handleProjectCellClick,
  handleMemberCellClick,
  canEditProject,
  canEditAssignment,
  isDayOff,
  isNonWorkingDay,
  isDayInDragRange,
  getDragMode,
  hasOverlap,
  getGroupPriority,
  dragState,
}: TimelineViewContentProps) {
  // Render by-project view
  if (viewMode === 'by-project') {
    const filteredProjects = items as Project[]

    return (
      <div className="overflow-auto max-h-full">
        <div className="min-w-max">
          {/* Header */}
          <TimelineHeader
            dates={dates}
            monthGroups={monthGroups}
            columnWidth={columnWidth}
            zoomLevel={zoomLevel}
          />

          {/* Projects */}
          {filteredProjects.map((project) => {
            const assignments = projectAssignments.filter(
              (pa: ProjectAssignment) => pa.projectId === project.id
            )

            // Filter assignments based on hideEmptyRows setting
            const visibleAssignments = hideEmptyRows
              ? assignments.filter((assignment: ProjectAssignment) =>
                  hasAssignmentInDateRange(dayAssignments, assignment.id, dates)
                )
              : assignments

            // Hide parent row if all children are filtered out
            if (hideEmptyRows && visibleAssignments.length === 0) {
              return null
            }

            return (
              <div key={project.id}>
                <TimelineItemHeader
                  type="project"
                  item={project}
                  isExpanded={expandedItems.has(project.id)}
                  canEdit={canEditProject(project.id)}
                  onToggleExpand={onToggleExpand}
                  dates={dates}
                  columnWidth={columnWidth}
                  milestones={milestones}
                  onMilestoneToggle={handleProjectCellClick}
                  showOverlaps={showOverlaps}
                  projectAssignments={projectAssignments}
                  dayAssignments={dayAssignments}
                />

                {expandedItems.has(project.id) &&
                  visibleAssignments.map((assignment: ProjectAssignment) => {
                      const member = memberById.get(assignment.teamMemberId)
                      if (!member) return null

                      return (
                        <AssignmentRow
                        key={assignment.id}
                        viewMode={viewMode}
                        assignment={assignment}
                        parentItem={project}
                        childItem={member}
                        dates={dates}
                        columnWidth={columnWidth}
                        zoomLevel={zoomLevel}
                        isAdmin={isAdmin}
                        showOverlaps={showOverlaps}
                        dayAssignments={dayAssignments}
                        assignmentGroups={assignmentGroups}
                        projectAssignments={projectAssignments}
                        projects={projects}
                        dayOffs={dayOffs}
                        milestones={milestones}
                        handleMouseDown={handleMouseDown}
                        handleMouseEnter={handleMouseEnter}
                        handleAssignmentClick={handleAssignmentClick}
                        handleDeleteDayAssignment={handleDeleteDayAssignment}
                        handleProjectCellClick={handleProjectCellClick}
                        isDayInDragRange={isDayInDragRange}
                        getDragMode={getDragMode}
                        isDayOff={isDayOff}
                        isNonWorkingDay={isNonWorkingDay}
                        hasOverlap={hasOverlap}
                        canEditAssignment={canEditAssignment}
                        canEditProject={canEditProject}
                        getGroupPriority={getGroupPriority}
                        dragState={dragState}
                      />
                    )
                  })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Render by-member view
  const filteredMembers = items as TeamMember[]

  return (
    <div className="overflow-auto max-h-full">
      <div className="min-w-max">
        {/* Header */}
        <TimelineHeader
          dates={dates}
          monthGroups={monthGroups}
          columnWidth={columnWidth}
          zoomLevel={zoomLevel}
          label="Team Members"
        />

        {/* Members */}
        {filteredMembers.map((member) => {
          const assignments = projectAssignments.filter(
            (pa: ProjectAssignment) => pa.teamMemberId === member.id
          )

          // Filter assignments based on hideEmptyRows setting
          const visibleAssignments = hideEmptyRows
            ? assignments.filter((assignment: ProjectAssignment) =>
                hasAssignmentInDateRange(dayAssignments, assignment.id, dates)
              )
            : assignments

          // Hide parent row if all children are filtered out
          if (hideEmptyRows && visibleAssignments.length === 0) {
            return null
          }

          return (
            <div key={member.id}>
              <TimelineItemHeader
                type="member"
                item={member}
                isExpanded={expandedItems.has(member.id)}
                canEdit={isAdmin}
                onToggleExpand={onToggleExpand}
                dates={dates}
                columnWidth={columnWidth}
                dayOffs={dayOffs}
                onDayOffToggle={handleMemberCellClick}
                showOverlaps={showOverlaps}
                projectAssignments={projectAssignments}
                dayAssignments={dayAssignments}
                projects={projects}
                hasOverlap={hasOverlap}
                isNonWorkingDay={isNonWorkingDay}
              />

              {expandedItems.has(member.id) &&
                visibleAssignments.map((assignment: ProjectAssignment) => {
                    const project = projectById.get(assignment.projectId)
                    if (!project) return null

                    // Hide tentative projects if showTentative is disabled
                    if (!showTentative && project.status === 'tentative') return null

                    return (
                      <AssignmentRow
                      key={assignment.id}
                      viewMode={viewMode}
                      assignment={assignment}
                      parentItem={member}
                      childItem={project}
                      dates={dates}
                      columnWidth={columnWidth}
                      zoomLevel={zoomLevel}
                      isAdmin={isAdmin}
                      showOverlaps={showOverlaps}
                      dayAssignments={dayAssignments}
                      assignmentGroups={assignmentGroups}
                      projectAssignments={projectAssignments}
                      projects={projects}
                      dayOffs={dayOffs}
                      milestones={milestones}
                      handleMouseDown={handleMouseDown}
                      handleMouseEnter={handleMouseEnter}
                      handleAssignmentClick={handleAssignmentClick}
                      handleDeleteDayAssignment={handleDeleteDayAssignment}
                      handleProjectCellClick={handleProjectCellClick}
                      isDayInDragRange={isDayInDragRange}
                      getDragMode={getDragMode}
                      isDayOff={isDayOff}
                      isNonWorkingDay={isNonWorkingDay}
                      hasOverlap={hasOverlap}
                      canEditAssignment={canEditAssignment}
                      canEditProject={canEditProject}
                      getGroupPriority={getGroupPriority}
                      dragState={dragState}
                    />
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
