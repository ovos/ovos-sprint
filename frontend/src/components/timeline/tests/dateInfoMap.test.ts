/**
 * Tests for Phase 1: dateInfoMap computation extracted from AssignmentRow
 *
 * Tests the pure functions computeWeekStarts and computeDateInfo,
 * which will be extracted from the inline useMemo in AssignmentRow.tsx.
 *
 * These functions precompute date metadata (isWeekend, isHoliday, isToday,
 * isFirstDayOfMonth, isWeekStart) for all dates in a single pass,
 * replacing the 27-dependency inline useMemo pattern.
 */
import { describe, it, expect } from 'vitest'

// These are exported from AssignmentRow.tsx
import { computeWeekStarts, computeDateInfo } from '../AssignmentRow'

// Helper to create a date range
function makeDates(start: string, count: number): Date[] {
  const dates: Date[] = []
  const d = new Date(start)
  for (let i = 0; i < count; i++) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

describe('computeWeekStarts', () => {
  it('marks the first date as a week start', () => {
    // Wednesday 2026-04-15
    const dates = makeDates('2026-04-15', 1)
    const result = computeWeekStarts(dates)
    expect(result).toEqual([true])
  })

  it('marks Mondays as week starts', () => {
    // Mon Apr 13 - Fri Apr 17 2026
    const dates = makeDates('2026-04-13', 5)
    const result = computeWeekStarts(dates)
    // Mon=true (first), Tue=false, Wed=false, Thu=false, Fri=false
    expect(result).toEqual([true, false, false, false, false])
  })

  it('marks boundary when crossing a week (Mon after Sun)', () => {
    // Sat Apr 18, Sun Apr 19, Mon Apr 20 2026
    const dates = makeDates('2026-04-18', 3)
    const result = computeWeekStarts(dates)
    // Sat=true (first), Sun=false (same ISO week as Sat), Mon=true (new ISO week)
    expect(result).toEqual([true, false, true])
  })

  it('handles non-contiguous dates (e.g. weekends skipped)', () => {
    // Fri Apr 17, Mon Apr 20 2026 (skip weekend)
    const fri = new Date('2026-04-17')
    const mon = new Date('2026-04-20')
    const result = computeWeekStarts([fri, mon])
    // Fri=true (first), Mon=true (different ISO week)
    expect(result).toEqual([true, true])
  })

  it('returns empty array for empty input', () => {
    expect(computeWeekStarts([])).toEqual([])
  })

  it('handles month boundary correctly', () => {
    // Wed Apr 29, Thu Apr 30, Fri May 1 2026
    const dates = makeDates('2026-04-29', 3)
    const result = computeWeekStarts(dates)
    // Wed=true (first), Thu=false, Fri=false (same ISO week)
    expect(result).toEqual([true, false, false])
  })
})

describe('computeDateInfo', () => {
  it('returns a Map with an entry for each date', () => {
    const dates = makeDates('2026-04-13', 7) // Mon-Sun
    const map = computeDateInfo(dates)
    expect(map.size).toBe(7)
  })

  it('keys the Map by date.toISOString()', () => {
    const dates = makeDates('2026-04-13', 3)
    const map = computeDateInfo(dates)
    for (const d of dates) {
      expect(map.has(d.toISOString())).toBe(true)
    }
  })

  it('correctly identifies weekends', () => {
    // Sat Apr 18 2026, Sun Apr 19 2026
    const sat = new Date('2026-04-18T00:00:00.000Z')
    const sun = new Date('2026-04-19T00:00:00.000Z')
    const mon = new Date('2026-04-20T00:00:00.000Z')
    const map = computeDateInfo([sat, sun, mon])

    expect(map.get(sat.toISOString())!.isWeekend).toBe(true)
    expect(map.get(sun.toISOString())!.isWeekend).toBe(true)
    expect(map.get(mon.toISOString())!.isWeekend).toBe(false)
  })

  it('correctly identifies Austrian holidays', () => {
    // May 1 2026 is Labour Day (Austrian holiday)
    const labourDay = new Date(2026, 4, 1) // Month is 0-indexed
    const normalDay = new Date(2026, 4, 2)
    const map = computeDateInfo([labourDay, normalDay])

    expect(map.get(labourDay.toISOString())!.isHoliday).toBe(true)
    expect(map.get(normalDay.toISOString())!.isHoliday).toBe(false)
  })

  it('correctly identifies first day of month', () => {
    // Apr 30 2026, May 1 2026
    const apr30 = new Date(2026, 3, 30)
    const may1 = new Date(2026, 4, 1)
    const may2 = new Date(2026, 4, 2)
    const map = computeDateInfo([apr30, may1, may2])

    expect(map.get(apr30.toISOString())!.isFirstDayOfMonth).toBe(false)
    expect(map.get(may1.toISOString())!.isFirstDayOfMonth).toBe(true)
    expect(map.get(may2.toISOString())!.isFirstDayOfMonth).toBe(false)
  })

  it('includes isWeekStart from computeWeekStarts', () => {
    // Fri Apr 17, Mon Apr 20 2026 (non-contiguous)
    const fri = new Date('2026-04-17')
    const mon = new Date('2026-04-20')
    const map = computeDateInfo([fri, mon])

    expect(map.get(fri.toISOString())!.isWeekStart).toBe(true) // first date
    expect(map.get(mon.toISOString())!.isWeekStart).toBe(true) // Monday
  })

  it('identifies today correctly', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const map = computeDateInfo([yesterday, today])

    expect(map.get(today.toISOString())!.isToday).toBe(true)
    expect(map.get(yesterday.toISOString())!.isToday).toBe(false)
  })

  it('preserves Date object identity in the result', () => {
    const dates = makeDates('2026-04-13', 3)
    const map = computeDateInfo(dates)

    for (const d of dates) {
      const info = map.get(d.toISOString())!
      expect(info.date).toBe(d) // same reference
    }
  })

  it('each entry conforms to IndexedDateInfo shape', () => {
    const dates = makeDates('2026-04-13', 1)
    const map = computeDateInfo(dates)
    const entry = map.get(dates[0].toISOString())!

    // Check all required fields exist and have correct types
    expect(typeof entry.dateStr).toBe('string')
    expect(entry.date).toBeInstanceOf(Date)
    expect(typeof entry.isWeekend).toBe('boolean')
    expect(typeof entry.isHoliday).toBe('boolean')
    expect(typeof entry.isToday).toBe('boolean')
    expect(typeof entry.isFirstDayOfMonth).toBe('boolean')
    expect(typeof entry.isWeekStart).toBe('boolean')
  })
})
