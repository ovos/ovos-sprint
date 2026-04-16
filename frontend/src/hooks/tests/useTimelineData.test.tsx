/**
 * Tests for useTimelineData hook — staleTime configuration (Phase 2)
 *
 * Verifies that:
 * 1. Static data queries (projects, members, settings, team relationships)
 *    use a 5-minute staleTime
 * 2. Date-range queries (day assignments, milestones, day-offs, assignment groups)
 *    use a 30-second staleTime
 * 3. Project assignments use a 1-minute staleTime
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// Mock the API client — all endpoints return empty arrays/objects
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/settings') return Promise.resolve({ data: {} })
      return Promise.resolve({ data: [] })
    }),
  },
}))

// Mock the filter functions to pass through
vi.mock('@/lib/timeline-filters', () => ({
  applyProjectFilters: vi.fn().mockReturnValue([]),
  applyMemberFilters: vi.fn().mockReturnValue([]),
}))

import { useTimelineData } from '../useTimelineData'

const FIVE_MINUTES = 5 * 60 * 1000
const ONE_MINUTE = 60 * 1000
const THIRTY_SECONDS = 30 * 1000

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useTimelineData staleTime configuration', () => {
  const startDate = new Date('2026-04-01')
  const endDate = new Date('2026-04-30')
  const dates = [startDate, endDate]

  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestClient()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('sets 5-minute staleTime on static data queries', async () => {
    const wrapper = createWrapper(queryClient)

    renderHook(
      () => useTimelineData(startDate, endDate, [], true, dates),
      { wrapper }
    )

    // Wait for all queries to resolve
    await waitFor(() => {
      const projectsQuery = queryClient.getQueryCache().find({ queryKey: ['projects'] })
      expect(projectsQuery).toBeDefined()
      expect(projectsQuery!.state.data).toBeDefined()
    })

    // Check staleTime on static queries
    const staticQueryKeys = [
      ['projects'],
      ['members'],
      ['settings'],
      ['teams', 'members', 'relationships'],
    ]

    for (const key of staticQueryKeys) {
      const query = queryClient.getQueryCache().find({ queryKey: key })
      expect(query, `Query ${JSON.stringify(key)} should exist`).toBeDefined()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((query!.options as any).staleTime).toBe(FIVE_MINUTES)
    }
  })

  it('sets 30-second staleTime on date-range queries', async () => {
    const wrapper = createWrapper(queryClient)

    renderHook(
      () => useTimelineData(startDate, endDate, [], true, dates),
      { wrapper }
    )

    await waitFor(() => {
      const queries = queryClient.getQueryCache().findAll({ queryKey: ['assignments', 'days'] })
      expect(queries.length).toBeGreaterThan(0)
      expect(queries[0].state.data).toBeDefined()
    })

    // Date-range queries include date params in the key, so use findAll for partial matching
    const dateRangeQueryPrefixes = [
      ['assignments', 'days'],
      ['milestones'],
      ['day-offs'],
      ['assignment-groups'],
    ]

    for (const prefix of dateRangeQueryPrefixes) {
      const queries = queryClient.getQueryCache().findAll({ queryKey: prefix })
      expect(queries.length, `Query ${JSON.stringify(prefix)} should exist`).toBeGreaterThan(0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((queries[0].options as any).staleTime).toBe(THIRTY_SECONDS)
    }
  })

  it('sets 1-minute staleTime on project assignments query', async () => {
    const wrapper = createWrapper(queryClient)

    renderHook(
      () => useTimelineData(startDate, endDate, [], true, dates),
      { wrapper }
    )

    await waitFor(() => {
      const query = queryClient.getQueryCache().find({ queryKey: ['assignments', 'projects'] })
      expect(query?.state.data).toBeDefined()
    })

    const query = queryClient.getQueryCache().find({ queryKey: ['assignments', 'projects'] })
    expect(query).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((query!.options as any).staleTime).toBe(ONE_MINUTE)
  })
})
