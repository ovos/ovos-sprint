/**
 * Tests for useTimelineMutations hook
 *
 * Bug: Toast notification not shown when a new assignment is created.
 * The createBatchDayAssignmentsMutation (the only creation mutation actually
 * called in the UI) has no toast() call in onSuccess or onSettled, while
 * every other mutation shows a toast on success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// Mock the API client
vi.mock('@/api/client', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

// Track toast calls
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

import { useTimelineMutations } from '../useTimelineMutations'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useTimelineMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows toast when batch day assignments are created', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useTimelineMutations(), { wrapper })

    // Trigger the batch create mutation
    result.current.createBatchDayAssignmentsMutation.mutate({
      projectAssignmentId: 1,
      dates: ['2026-04-15'],
    })

    // Wait for the mutation to settle
    await waitFor(() => {
      expect(result.current.createBatchDayAssignmentsMutation.isSuccess).toBe(true)
    })

    // Toast should have been called with a creation message
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Assignment created' })
    )
  })

  it('shows toast when a single day assignment is created', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useTimelineMutations(), { wrapper })

    // Trigger the single create mutation
    result.current.createDayAssignmentMutation.mutate({
      projectAssignmentId: 1,
      date: '2026-04-15',
    })

    await waitFor(() => {
      expect(result.current.createDayAssignmentMutation.isSuccess).toBe(true)
    })

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Assignment created' })
    )
  })

  it('shows toast when day assignment is deleted (existing behavior)', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useTimelineMutations(), { wrapper })

    result.current.deleteDayAssignmentMutation.mutate(1)

    await waitFor(() => {
      expect(result.current.deleteDayAssignmentMutation.isSuccess).toBe(true)
    })

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Assignment deleted' })
    )
  })

  it('shows toast when batch day assignments are deleted (existing behavior)', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useTimelineMutations(), { wrapper })

    result.current.deleteBatchDayAssignmentsMutation.mutate([1, 2])

    await waitFor(() => {
      expect(result.current.deleteBatchDayAssignmentsMutation.isSuccess).toBe(true)
    })

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Assignments deleted' })
    )
  })
})
