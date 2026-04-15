/**
 * Tests for DragContext subscriber-driven reactivity
 *
 * Bug: Drag indicators don't update consistently during drag operations.
 * Root cause: Components read dragState once at render time via getDragState(),
 * but nothing triggers re-render when drag state changes (the state is stored
 * in a ref). The subscriber pattern exists in DragContext but is not used.
 *
 * These tests verify that:
 * 1. Components subscribing to drag updates re-render when drag state changes
 * 2. isDayInDragRange returns correct values after drag state updates
 * 3. Subscriber notifications happen synchronously (not debounced)
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { DragProvider, useDragContext } from '../DragContext'
import { useState, useEffect, ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <DragProvider>{children}</DragProvider>
}

describe('DragContext reactivity via subscribers', () => {
  it('subscriber is called on every setDragState, not debounced', () => {
    const subscriberFn = vi.fn()

    const { result } = renderHook(() => {
      const ctx = useDragContext()
      useEffect(() => {
        return ctx.subscribe(subscriberFn)
      }, [ctx])
      return ctx
    }, { wrapper })

    // Simulate rapid drag updates (like mouse moving across cells)
    act(() => {
      result.current.setDragState({
        assignmentId: 1,
        startDate: new Date(2026, 3, 10),
        endDate: new Date(2026, 3, 10),
        mode: 'create',
      })
    })

    act(() => {
      result.current.setDragState({
        assignmentId: 1,
        startDate: new Date(2026, 3, 10),
        endDate: new Date(2026, 3, 11),
        mode: 'create',
      })
    })

    act(() => {
      result.current.setDragState({
        assignmentId: 1,
        startDate: new Date(2026, 3, 10),
        endDate: new Date(2026, 3, 12),
        mode: 'create',
      })
    })

    // Each setDragState should have triggered a notification — no debouncing
    expect(subscriberFn).toHaveBeenCalledTimes(3)
  })

  it('isDayInDragRange reflects updated state after setDragState', () => {
    const { result } = renderHook(() => useDragContext(), { wrapper })

    // Initially no drag active
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 11))).toBe(false)

    // Start a create drag from Apr 10 to Apr 12
    act(() => {
      result.current.setDragState({
        assignmentId: 1,
        startDate: new Date(2026, 3, 10),
        endDate: new Date(2026, 3, 12),
        mode: 'create',
      })
    })

    // Apr 11 should be in range (between 10 and 12)
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 11))).toBe(true)
    // Apr 13 should not be in range
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 13))).toBe(false)
    // Different assignment should not be in range
    expect(result.current.isDayInDragRange(2, new Date(2026, 3, 11))).toBe(false)
  })

  it('subscriber-driven component re-renders with fresh drag state', () => {
    /**
     * This test simulates a component that subscribes to drag updates
     * and re-reads getDragState() on each subscriber notification.
     * This is the pattern needed to fix the drag indicator bug.
     */
    const renderCount = vi.fn()

    const { result: combined } = renderHook(() => {
      const { subscribe, getDragState, setDragState } = useDragContext()
      const [dragVersion, setDragVersion] = useState(0)
      useEffect(() => {
        return subscribe(() => setDragVersion(v => v + 1))
      }, [subscribe])

      const dragState = getDragState()
      renderCount()

      return { dragState, dragVersion, setDragState }
    }, { wrapper })

    expect(renderCount).toHaveBeenCalledTimes(1)
    expect(combined.current.dragState.mode).toBeNull()

    // Simulate drag start
    act(() => {
      combined.current.setDragState({
        assignmentId: 1,
        startDate: new Date(2026, 3, 10),
        endDate: new Date(2026, 3, 10),
        mode: 'create',
      })
    })

    // The subscription should have caused a re-render
    expect(renderCount).toHaveBeenCalledTimes(2)
    expect(combined.current.dragState.mode).toBe('create')
    expect(combined.current.dragState.assignmentId).toBe(1)

    // Simulate mouse entering a new cell (drag extends)
    act(() => {
      combined.current.setDragState({
        assignmentId: 1,
        startDate: new Date(2026, 3, 10),
        endDate: new Date(2026, 3, 12),
        mode: 'create',
      })
    })

    // Should re-render again with updated endDate
    expect(renderCount).toHaveBeenCalledTimes(3)
    expect(combined.current.dragState.endDate).toEqual(new Date(2026, 3, 12))
  })

  it('unsubscribe stops notifications', () => {
    const subscriberFn = vi.fn()

    const { result } = renderHook(() => {
      const ctx = useDragContext()
      const [unsub, setUnsub] = useState<(() => void) | null>(null)

      useEffect(() => {
        const u = ctx.subscribe(subscriberFn)
        setUnsub(() => u)
        return u
      }, [ctx])

      return { ctx, unsub }
    }, { wrapper })

    // First call should notify
    act(() => {
      result.current.ctx.setDragState({
        assignmentId: 1,
        startDate: new Date(),
        endDate: new Date(),
        mode: 'create',
      })
    })
    expect(subscriberFn).toHaveBeenCalledTimes(1)

    // Unsubscribe
    act(() => {
      result.current.unsub?.()
    })

    // Second call should not notify
    act(() => {
      result.current.ctx.setDragState({
        assignmentId: 2,
        startDate: new Date(),
        endDate: new Date(),
        mode: 'delete',
      })
    })
    expect(subscriberFn).toHaveBeenCalledTimes(1) // Still 1, not 2
  })

  it('move mode isDayInDragRange uses offset to calculate target range', () => {
    const { result } = renderHook(() => useDragContext(), { wrapper })

    // Start move drag with a source range of Apr 10-12, moving 3 days forward
    act(() => {
      result.current.setDragState({
        assignmentId: 1,
        startDate: new Date(2026, 3, 10),
        endDate: new Date(2026, 3, 13), // Current mouse position
        mode: 'move',
        moveSource: { startDate: '2026-04-10', endDate: '2026-04-12' },
        moveAnchor: '2026-04-10',
        moveOffset: 3,
      })
    })

    // Target range is Apr 13-15 (source + 3 days offset)
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 13))).toBe(true)
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 14))).toBe(true)
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 15))).toBe(true)

    // Source range (Apr 10-12) should NOT be in the drag range
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 10))).toBe(false)
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 11))).toBe(false)
    expect(result.current.isDayInDragRange(1, new Date(2026, 3, 12))).toBe(false)
  })
})
