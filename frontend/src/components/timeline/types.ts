import type {
  Project,
  TeamMember,
  ProjectAssignment,
  DayAssignment,
  Milestone,
  DayOff,
  AssignmentGroup,
  AssignmentPriority,
  TimelineViewMode,
} from '@/types'

/**
 * Type for zoom level keys (moved from lib/timeline-constants.ts)
 */
export type ZoomLevel = 1 | 2 | 3 | 4

/**
 * Timeline Component Props
 */

/**
 * Props for TimelineViewContent component
 */
export interface TimelineViewContentProps {
  viewMode: TimelineViewMode
  // Data
  items: (Project | TeamMember)[]
  projects: Project[]
  members: TeamMember[]
  memberById: Map<number, TeamMember>
  projectById: Map<number, Project>
  projectAssignments: ProjectAssignment[]
  dayAssignments: DayAssignment[]
  milestones: Milestone[]
  dayOffs: DayOff[]
  settings: Record<string, string>
  assignmentGroups: AssignmentGroup[]
  dates: Date[]
  monthGroups: Array<{ month: string; count: number; firstDate: Date }>
  // Settings
  columnWidth: string
  zoomLevel: number
  expandedItems: Set<number>
  onToggleExpand: (id: number) => void
  isAdmin: boolean
  showOverlaps: boolean
  showTentative: boolean
  hideEmptyRows: boolean
  // Handlers
  handleMouseDown: (assignmentId: number, date: Date, e: React.MouseEvent) => void
  handleMouseEnter: (date: Date) => void
  handleAssignmentClick: (assignmentId: number, date: Date, e: React.MouseEvent) => void
  handleDeleteDayAssignment: (assignmentId: number, date: Date, e: React.MouseEvent) => void
  handleProjectCellClick: (projectId: number, date: Date, e: React.MouseEvent) => void
  handleMemberCellClick: (memberId: number, date: Date, e: React.MouseEvent) => void
  // Helper functions
  canEditProject: (projectId: number) => boolean
  canEditAssignment: (assignmentId: number) => boolean
  isDayOff: (memberId: number, date: Date) => boolean
  isNonWorkingDay: (memberId: number, date: Date) => boolean
  isDayInDragRange: (assignmentId: number, date: Date) => boolean
  getDragMode: () => 'create' | 'delete' | 'move' | null
  hasOverlap: (id: number, date: Date, mode: 'member' | 'project') => boolean
  getGroupPriority: (assignmentId: number, date: Date) => AssignmentPriority
  dragState: {
    mode: 'create' | 'delete' | 'move' | null
    assignmentId: number | null
    startDate: Date | null
    endDate: Date | null
    moveSource?: { startDate: string; endDate: string }
    moveOffset?: number
  }
}

/**
 * Props for AssignmentRow component
 */
export interface AssignmentRowProps {
  viewMode: TimelineViewMode
  assignment: ProjectAssignment
  parentItem: Project | TeamMember
  childItem: TeamMember | Project
  dates: Date[]
  columnWidth: string
  zoomLevel: number
  isAdmin: boolean
  showOverlaps: boolean
  // Data
  dayAssignments: DayAssignment[]
  assignmentGroups: AssignmentGroup[]
  projectAssignments: ProjectAssignment[]
  projects: Project[]
  dayOffs: DayOff[]
  milestones: Milestone[]
  // Handlers
  handleMouseDown: (assignmentId: number, date: Date, e: React.MouseEvent) => void
  handleMouseEnter: (date: Date) => void
  handleAssignmentClick: (assignmentId: number, date: Date, e: React.MouseEvent) => void
  handleDeleteDayAssignment: (assignmentId: number, date: Date, e: React.MouseEvent) => void
  handleProjectCellClick: (projectId: number, date: Date, e: React.MouseEvent) => void
  // Helper functions
  isDayInDragRange: (assignmentId: number, date: Date) => boolean
  getDragMode: () => 'create' | 'delete' | 'move' | null
  isDayOff: (memberId: number, date: Date) => boolean
  isNonWorkingDay: (memberId: number, date: Date) => boolean
  hasOverlap: (id: number, date: Date, mode: 'member' | 'project') => boolean
  canEditAssignment: (assignmentId: number) => boolean
  canEditProject: (projectId: number) => boolean
  getGroupPriority: (assignmentId: number, date: Date) => AssignmentPriority
  dragState: {
    mode: 'create' | 'delete' | 'move' | null
    assignmentId: number | null
    startDate: Date | null
    endDate: Date | null
    moveSource?: { startDate: string; endDate: string }
    moveOffset?: number
  }
}

/**
 * Props for AssignmentCommentOverlay component
 */
export interface AssignmentCommentOverlayProps {
  assignmentId: number
  dates: Date[]
  dayAssignments: any[]
  assignmentGroups: AssignmentGroup[]
  zoomLevel: number
  onCommentClick: (assignmentId: number, date: Date, event: React.MouseEvent) => void
  onCommentContextMenu: (assignmentId: number, date: Date, event: React.MouseEvent) => void
}

/**
 * Props for TimelineHeader component
 */
export interface TimelineHeaderProps {
  dates: Date[]
  monthGroups: Array<{ month: string; count: number; firstDate: Date }>
  columnWidth: string
  zoomLevel: number
  label?: string
}

/**
 * Props for TimelineItemHeader component
 */
export interface TimelineItemHeaderProps {
  type: 'project' | 'member'
  item: Project | TeamMember
  isExpanded: boolean
  canEdit: boolean
  onToggleExpand: (id: number) => void
  dates: Date[]
  columnWidth: string
  // Only for projects:
  milestones?: Milestone[]
  onMilestoneToggle?: (projectId: number, date: Date, event: React.MouseEvent) => void
  // Only for members:
  dayOffs?: DayOff[]
  onDayOffToggle?: (memberId: number, date: Date, event: React.MouseEvent) => void
  // For CollapsedAssignmentBar rendering:
  showOverlaps: boolean
  projectAssignments: ProjectAssignment[]
  dayAssignments: DayAssignment[]
  projects?: Project[] // Only needed for member view
  hasOverlap?: (id: number, date: Date, type: 'member' | 'project') => boolean // Only for member view
  isNonWorkingDay?: (memberId: number, date: Date) => boolean // Only for member view thin-line styling
}

/**
 * Props for ExpandedAssignmentBar component
 */
export interface ExpandedAssignmentBarProps {
  assignmentId: number
  date: Date
  projectAssignments: any[]
  dayAssignments: any[]
  project: any
  member: any
  isDayInDragRange: boolean
  dragMode: 'create' | 'delete' | 'move' | null
  isAdmin: boolean
  hasOverlap: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  getGroupPriority: (assignmentId: number, date: Date) => AssignmentPriority
  isNonWorkingDay: (memberId: number, date: Date) => boolean
  isHoliday: (date: Date) => boolean
  dragState: {
    mode: 'create' | 'delete' | 'move' | null
    assignmentId: number | null
    startDate: Date | null
    endDate: Date | null
    moveSource?: { startDate: string; endDate: string }
    moveOffset?: number
  }
}

/**
 * Props for CollapsedAssignmentBar component
 */
export interface CollapsedAssignmentBarProps {
  type: 'project' | 'member'
  id: number
  date: Date
  projectAssignments: any[]
  dayAssignments: any[]
  projects?: any[]
  isTentative?: boolean
  hasOverlap: boolean
  showOverlaps: boolean
  // For member view thin-line styling:
  memberId?: number
  isNonWorkingDay?: (memberId: number, date: Date) => boolean
  isHoliday?: (date: Date) => boolean
}

/**
 * Props for MilestoneIndicator component
 */
export interface MilestoneIndicatorProps {
  projectId: number
  date: Date
  milestones: Milestone[]
  canEdit: boolean
  onToggle: (projectId: number, date: Date, e: React.MouseEvent) => void
}

/**
 * Props for DayOffIndicator component
 */
export interface DayOffIndicatorProps {
  memberId: number
  date: Date
  dayOffs: DayOff[]
}

/**
 * Timeline Hook Types
 */

/**
 * Warning state interface for timeline warnings
 */
export interface TimelineWarning {
  type: 'holiday' | 'non-working-day'
  message: string | React.ReactNode
  onConfirm: () => void
  onSkip?: () => void
}

/**
 * Edit popover state interface
 */
export interface EditPopoverState {
  open: boolean
  position: { x: number; y: number }
  projectAssignmentId: number
  dateRange: { start: string; end: string }
  group: AssignmentGroup | null
}
