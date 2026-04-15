import { createContext, useContext, useRef, useCallback, useMemo, ReactNode } from 'react'
import { format } from 'date-fns'
import { addDaysToDateString, isDateInRange } from '@/lib/timeline-helpers'

/**
 * DragContext - Isolated drag state management
 *
 * This context prevents Timeline component from re-rendering on every drag state update.
 * Instead, only the cells that subscribe to drag updates will re-render.
 *
 * Key optimizations:
 * - Drag state stored in ref for instant updates without re-renders
 * - Only triggers re-render for cells in the drag range via subscribers
 * - Stable API (no new function references on every render)
 */

interface DragState {
  assignmentId: number | null
  startDate: Date | null
  endDate: Date | null
  mode: 'create' | 'delete' | 'move' | null
  moveSource?: { startDate: string; endDate: string } // Original range when moving
  moveAnchor?: string // The date where the user clicked (anchor point for movement)
  moveOffset?: number // Number of days moved from anchor position
}

interface DragContextValue {
  // Get current drag state (from ref, doesn't cause re-render)
  getDragState: () => DragState
  // Set drag state (updates ref + notifies subscribers)
  setDragState: (state: DragState) => void
  // Check if a specific date is in the drag range (stable function)
  isDayInDragRange: (assignmentId: number, date: Date) => boolean
  // Subscribe to drag updates (for cells that need to show drag feedback)
  subscribe: (callback: () => void) => () => void
}

const DragContext = createContext<DragContextValue | undefined>(undefined)

interface DragProviderProps {
  children: ReactNode
}

export function DragProvider({ children }: DragProviderProps) {
  // Store drag state in a ref to avoid re-renders
  const dragStateRef = useRef<DragState>({
    assignmentId: null,
    startDate: null,
    endDate: null,
    mode: null,
  })

  // Subscribers that want to be notified of drag updates
  const subscribersRef = useRef<Set<() => void>>(new Set())

  // Get current drag state (stable reference)
  const getDragState = useCallback(() => {
    return dragStateRef.current
  }, [])

  // Set drag state and notify subscribers
  const setDragState = useCallback((newState: DragState) => {
    dragStateRef.current = newState

    // Synchronously toggle body class so CSS disables comment overlay pointer events
    // immediately, without waiting for React's render cycle
    if (newState.assignmentId) {
      document.body.classList.add('timeline-dragging')
    } else {
      document.body.classList.remove('timeline-dragging')
    }

    // Notify all subscribers (individual cells) -- no forceUpdate needed,
    // the subscriber pattern directly notifies cells that need re-rendering
    subscribersRef.current.forEach(callback => callback())
  }, [])

  // Check if date is in drag range (stable reference)
  const isDayInDragRange = useCallback((assignmentId: number, date: Date): boolean => {
    const state = dragStateRef.current

    if (
      state.assignmentId !== assignmentId ||
      !state.startDate ||
      !state.endDate
    ) {
      return false
    }

    // Use string-based comparison to avoid timezone issues
    const dateStr = format(date, 'yyyy-MM-dd')

    // For MOVE mode, calculate the target range based on offset
    // Don't show intermediate days, only show where the block will land
    if (state.mode === 'move' && state.moveSource && state.moveOffset !== undefined) {
      // Apply offset to get new range using string-based helper
      const newStartStr = addDaysToDateString(state.moveSource.startDate, state.moveOffset)
      const newEndStr = addDaysToDateString(state.moveSource.endDate, state.moveOffset)

      return isDateInRange(dateStr, newStartStr, newEndStr)
    }

    // For CREATE and DELETE modes, use the current drag range
    const startStr = format(state.startDate, 'yyyy-MM-dd')
    const endStr = format(state.endDate, 'yyyy-MM-dd')

    // Normalize to ensure start <= end for comparison
    const normalizedStart = startStr < endStr ? startStr : endStr
    const normalizedEnd = startStr > endStr ? startStr : endStr

    return isDateInRange(dateStr, normalizedStart, normalizedEnd)
  }, [])

  // Subscribe to drag updates
  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback)

    // Return unsubscribe function
    return () => {
      subscribersRef.current.delete(callback)
    }
  }, [])

  // Memoize the context value -- all four functions are stable (useCallback with [] deps),
  // so this object reference never changes, preventing consumer re-renders from context
  const value: DragContextValue = useMemo(() => ({
    getDragState,
    setDragState,
    isDayInDragRange,
    subscribe,
  }), [getDragState, setDragState, isDayInDragRange, subscribe])

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>
}

export function useDragContext() {
  const context = useContext(DragContext)
  if (!context) {
    throw new Error('useDragContext must be used within a DragProvider')
  }
  return context
}
