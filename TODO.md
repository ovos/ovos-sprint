# OVOS Sprint - Feature Roadmap

## In Progress

### Timeline Performance Optimizations

**Priority**: High | **Type**: Performance | **Estimate**: ~3 hours

A comprehensive review of the timeline's rendering pipeline revealed several performance bottlenecks that compound under real-world data loads. The optimizations below are ordered by risk-to-impact ratio: low-risk, high-impact changes first.

---

### Phase 1: Refactor AssignmentRow Inline useMemo into Top-Level Memoization

**Severity**: Medium | **Risk**: Low | **Files**: `AssignmentRow.tsx`, `types.ts`

> **Review note (corrected description):** The original description stated "`useMemo` is called inside `.map()`" — this is inaccurate. The actual pattern is a single `useMemo` **wrapping** the entire `.map()` block inline in JSX (lines 153–237 and 294–385). This does **not** violate the Rules of Hooks since hook call order is consistent (the `if (viewMode === 'by-project')` early return means each component instance always takes the same branch). However, the pattern is still problematic because the dependency arrays contain **27 items**, making the memo cache invalidate on nearly every render.

**Current pattern** (lines 153–237, repeated at 294–385):
```tsx
// Single useMemo wrapping the full date-cell computation + render
{useMemo(() => {
  const dateProperties = dates.map((date, index) => ({
    date,
    isWeekend: isWeekend(date),
    isHoliday: isHoliday(date),
    isDayOff: isDayOff(member.id, date),  // ← member-specific
    isToday: isSameDay(date, today),
    isFirstDayOfMonth: isFirstDayOfMonth(date),
    isWeekStart: isWeekStart(date, index),
    dateStr: date.toISOString()
  }))
  return dateProperties.map((props) => (
    <div key={props.dateStr} ...>
      <ExpandedAssignmentBar ... />
    </div>
  ))
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [dates, member.id, assignment.id, project.id, project.status, columnWidth,
    isAdmin, isDayOff, isWeekend, isHoliday, today, handleMouseDown,
    handleMouseEnter, handleDeleteDayAssignment, isDayAssigned, dayAssignments,
    handleAssignmentClick, isDayInDragRange, hasOverlap, projectAssignments,
    getGroupPriority, milestones, canEditProject, handleProjectCellClick,
    dragState])}
```

**Why this matters:** The 27-item dependency array means this memo recomputes on nearly every parent render. The real win is separating the pure date computation (depends only on `dates`) from the JSX render (depends on assignment state, handlers, etc.).

**Implementation**:

1. **Add `IndexedDateInfo` type** to `types.ts`:
   ```typescript
   export interface IndexedDateInfo {
     date: Date
     dateStr: string
     isWeekend: boolean
     isHoliday: boolean
     isToday: boolean
     isFirstDayOfMonth: boolean
     isWeekStart: boolean
   }
   ```
   > **Note:** `isDayOff` is intentionally **excluded** from this type. It depends on `member.id` (each assignment row has a different member), so it cannot be precomputed in a date-only map. Keep `isDayOff(member.id, date)` as an inline lookup at render time — it's already O(1) via the `dayOffIndex` Set in `Timeline.tsx:141`.

2. **Extract `computeWeekStarts` outside the component**:
   ```typescript
   function computeWeekStarts(dates: Date[]): boolean[] {
     return dates.map((date, index) => {
       if (index === 0) return true
       if (getDay(date) === 1) return true
       const prevDate = dates[index - 1]
       if (getISOWeek(prevDate) !== getISOWeek(date)) return true
       return false
     })
   }
   ```

3. **Add a single top-level `useMemo`** inside `AssignmentRowComponent`, **before** the `viewMode` branch:
   ```typescript
   const dateInfoMap = useMemo(() => {
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
   }, [dates])
   ```
   > **Dependency note:** `[dates]` is sufficient here because `isWeekend` and `isHoliday` are pure module-level functions imported from `@/lib/holidays` (they have no runtime state). `isHoliday` calls `getAustrianHolidays(year)` internally, which is deterministic for a given date. The `today` variable is intentionally computed inside the memo — it's stable for a single session (same as the existing `useMemo(() => new Date(), [])` at line 105).

4. **Replace the inline `useMemo` blocks** in both branches with a simple `.map()`:
   ```tsx
   {dates.map((date) => {
     const info = dateInfoMap.get(date.toISOString())!
     const dayOff = isDayOff(member.id, date)  // ← still inline, O(1) Set lookup
     return (
       <div key={info.dateStr} className={cn(...)}>
         {/* use info.isWeekend, info.isWeekStart, dayOff, etc. */}
       </div>
     )
   })}
   ```

5. **Remove the `eslint-disable` comments** on lines 236 and 384 — the exhaustive-deps warning should no longer fire. Keep the one on line 105 (`today` memo with empty deps — intentional).

**Verification**: Run existing tests; add a test that renders an `AssignmentRow` with 30+ dates and asserts that `dateInfoMap.size === dates.length` and that the map is stable across renders with the same `dates` prop.

---

### Phase 2: Add React Query staleTime Configuration

**Severity**: Medium | **Risk**: Low | **Files**: `useTimelineData.ts`

**Problem**: All 8 queries run with the default `staleTime` (0), meaning every component remount triggers a network request even if the data is fresh. For static data (projects, members, settings), this is wasteful.

**Implementation**:

1. **Static data — 5 minute staleTime** (projects, members, settings, team relationships):
   ```typescript
   useQuery({
     queryKey: ['projects'],
     queryFn: async () => { /* ... */ },
     staleTime: 5 * 60 * 1000, // 5 minutes
   })
   // Repeat for ['members'], ['settings'], ['teams', 'members', 'relationships']
   ```

2. **Date-range data — shorter staleTime** (30 seconds — these change when user navigates the timeline):
   ```typescript
   useQuery({
     queryKey: ['assignments', 'days', startDateStr, endDateStr],
     queryFn: async () => { /* ... */ },
     staleTime: 30 * 1000, // 30 seconds
   })
   // Repeat for ['milestones'], ['day-offs'], ['assignment-groups']
   ```

3. **Project assignments — 1 minute staleTime** (changes when assignments are created/moved, but not on every interaction):
   ```typescript
   useQuery({
     queryKey: ['assignments', 'projects'],
     staleTime: 60 * 1000,
   })
   ```

**Mutation compatibility (verified safe):** `useTimelineMutations.ts` overwhelmingly uses `invalidateQueries` / `refetchQueries` on success (server refetch pattern). `setQueryData` is used only once — for optimistic rollback in `createBatchDayAssignmentsMutation.onError`. Since `staleTime` does **not** prevent refetch after `invalidateQueries`, all mutations will continue to trigger fresh data loads as expected. No changes needed to mutation code.

**Verification**: Open Network tab, navigate away and back to the timeline — static data should not re-fetch. Verify with `queryClient.getQueryCache()` in React DevTools.

---

### Phase 3: Replace O(n) .find() with Memoized Index in TimelineViewContent

**Severity**: Low | **Risk**: Low | **Files**: `TimelineViewContent.tsx`, `Timeline.tsx`, `types.ts`

**Problem**: In `TimelineViewContent.tsx`, the code calls `members.find(m => m.id === ...)` and `projects.find(p => p.id === ...)` on every render for every assignment row.

> **Review note (severity adjusted):** The original severity of "Medium" overstates the performance impact. `.find()` on arrays of ~50 items is effectively instantaneous (linear scan of 50 items is nanoseconds). Even with 50 projects × 10 members = 500 `.find()` calls, this is negligible. The real value of this change is **code clarity** — Map lookups are semantically clearer and establish a consistent pattern with the existing `memberIndex` in `Timeline.tsx:135`.

**Current pattern** (lines 154–157, 257–260):
```tsx
const member = members.find((m) => m.id === assignment.teamMemberId)
if (!member) return null
```

**Implementation**:

1. **Add a new prop** `memberById: Map<number, TeamMember>` to `TimelineViewContentProps` in `types.ts`.

2. **Create the index in Timeline.tsx** (already has `memberIndex` at line 135 — just pass it through):
   ```typescript
   <TimelineViewContent
     // ... existing props
     memberById={memberIndex}
     projectById={/* new project index */}
   />
   ```

3. **Create a project index** in `Timeline.tsx` (parallel to the existing `memberIndex`):
   ```typescript
   const projectIndex = useMemo(() => {
     const index = new Map<number, Project>()
     projects.forEach(p => index.set(p.id, p))
     return index
   }, [projects])
   ```

4. **Replace all `.find()` calls** in `TimelineViewContent.tsx`:
   ```tsx
   // Before
   const member = members.find((m) => m.id === assignment.teamMemberId)
   if (!member) return null

   // After
   const member = memberById.get(assignment.teamMemberId)
   if (!member) return null
   ```

**Verification**: Unit test that `memberById.get(id)` returns the same object as `members.find(m => m.id === id)` for all assignments in a test dataset.

---

### Phase 4: Memoize ExpandedAssignmentBar

**Severity**: Low | **Risk**: Medium | **Files**: `ExpandedAssignmentBar.tsx`, `AssignmentRow.tsx`

> **Review note (implementation blocked as originally described):** The original plan claimed props are "stable-enough" for `React.memo` to work. This is **incorrect**. Three inline arrow functions are created fresh on every render in `AssignmentRow.tsx`, which would defeat `React.memo`:
>
> - `onMouseDown` (line 211): inline `(e) => { e.stopPropagation() ... }`
> - `onClick` (line 219): inline `(e) => { handleAssignmentClick(...) }`
> - `onContextMenu` (line 225): inline `(e) => { handleDeleteDayAssignment(...) }`
>
> The boolean props (`isDayInDragRange`, `hasOverlap`) and callback props (`getGroupPriority`, `isNonWorkingDay`, `isHoliday`) are stable. But the three event handlers create new references every render.
>
> **Correction:** `isHoliday` is a pure module-level function imported from `@/lib/holidays`, not a `useCallback`'d reference from Timeline.tsx. It's inherently stable. `isNonWorkingDay` IS `useCallback`'d in Timeline.tsx:160 and is stable.

**Problem**: `ExpandedAssignmentBar` is a leaf component rendered inside a memoized `AssignmentRow`. It currently re-renders whenever `AssignmentRow` does. Wrapping it in `React.memo` requires stabilizing the event handler props first.

**Implementation**:

1. **First, stabilize the inline handlers** in `AssignmentRow.tsx`. Extract the three inline arrow functions into `useCallback` hooks:
   ```typescript
   // Inside AssignmentRowComponent, before the JSX return
   const handleBarMouseDown = useCallback((assignmentId: number, date: Date) => (e: React.MouseEvent) => {
     const isDeleteTrigger = e.button === 2 || e.ctrlKey || e.metaKey
     const isMoveTrigger = e.altKey
     if (!isDeleteTrigger && !isMoveTrigger) {
       e.stopPropagation()
     }
   }, [])

   const handleBarClick = useCallback((assignmentId: number, date: Date) => (e: React.MouseEvent) => {
     e.stopPropagation()
     handleAssignmentClick(assignmentId, date)
   }, [handleAssignmentClick])

   const handleBarContextMenu = useCallback((assignmentId: number, date: Date) => (e: React.MouseEvent) => {
     e.preventDefault()
     handleDeleteDayAssignment(assignmentId, date)
   }, [handleDeleteDayAssignment])
   ```

   > **Design decision:** The curried factory pattern `useCallback((id, date) => (e) => {...})` is idiomatic React and keeps `AssignmentRow` and `ExpandedAssignmentBar` decoupled. An alternative would be passing `assignmentId` and `date` as props and letting `ExpandedAssignmentBar` compute its own handlers — but this couples it to mutation callbacks (`handleAssignmentClick`, `handleDeleteDayAssignment`), making it harder to reuse and test in isolation. **Use the curried factory pattern (step 1 above).**

2. **Then wrap `ExpandedAssignmentBar`** with `React.memo`:
   ```typescript
   export const ExpandedAssignmentBar = memo(ExpandedAssignmentBarComponent)
   ```

3. Verify the following props are stable:
   - `getGroupPriority` — `useCallback` in `Timeline.tsx:305-308` ✓
   - `isNonWorkingDay` — `useCallback` in `Timeline.tsx:160` with deps `[memberIndex, isDayOff, workScheduleCache]` ✓
   - `isHoliday` — pure function import from `@/lib/holidays` ✓
   - `isDayInDragRange` / `hasOverlap` — booleans (primitive, always stable) ✓
   - `dragMode` — string value from `getDragMode()` (primitive) ✓

**Verification**: Use React DevTools Profiler to confirm `ExpandedAssignmentBar` only re-renders when its specific props change. Without the handler stabilization in step 1, `React.memo` will have no effect.

---

### Phase 5: Virtualization for Large Datasets (Future)

**Severity**: High | **Risk**: High | **Files**: `TimelineViewContent.tsx`, new virtual scroll wrapper

**Problem**: The timeline renders all visible rows (projects + their expanded member rows, or members + their expanded project rows) without any virtualization. With 50 projects, each with 5 members expanded, that's 250+ DOM rows. Date columns compound this.

**Approach**: Use `@tanstack/react-virtual` (already has wide adoption and Vite compatibility).

1. **Install**: `npm install @tanstack/react-virtual` in `frontend/`

2. **Virtualize row rendering** in `TimelineViewContent.tsx`:
   - Wrap the project/member map with `useVirtualizer`
   - Use `overscan` of 5 rows for smooth scrolling
   - Maintain sticky headers via CSS (`position: sticky`)

3. **Date column virtualization** is more complex — consider horizontal virtualization for date ranges > 60 days, but this may have UX trade-offs. Start with row virtualization only.

4. **Measure** before/after DOM node count with React DevTools.

**Risk note**: Virtualization in a two-axis scroll layout (sticky sidebar + horizontal date scroll) is non-trivial. The sticky sidebar must align with virtualized rows. Test thoroughly on the `by-project` view with many members before `by-member`.

> **Review note (additional risk):** The current `useMemo` blocks inside `AssignmentRow` render **all date cells** for every row. Row virtualization alone (via `@tanstack/react-virtual`) only reduces the outer loop — each visible row still renders 60+ date cells for wide date ranges. This partially defeats the purpose. Horizontal (column) virtualization would help but introduces complexity with `position: sticky` for the sidebar column. The `sticky` element must share the same scroll parent as the virtualized content, which `@tanstack/react-virtual` supports, but alignment between sticky and virtualized rows needs careful testing. **Recommendation:** Do Phase 1 first (reduces per-cell cost), then measure whether row virtualization alone is sufficient.

**Verification**: Manual testing with 100+ projects, 500+ assignments. Profile DOM node count before/after.

---

### Phase 6: Code Deduplication in TimelineViewContent

**Severity**: Low | **Risk**: Medium | **Files**: `TimelineViewContent.tsx`

**Problem**: The `by-project` section (lines 103–199) and `by-member` section (lines 203–305) share significant structural similarity — both map over items, filter assignments, render `TimelineItemHeader`, and render `AssignmentRow`.

> **Review note (complexity understated):** The original description said "the only differences are the type casts and a few conditional renders." The actual differences are more substantial:
>
> | Aspect | By-Project | By-Member |
> |--------|-----------|-----------|
> | **`showTentative` filter** | Not applied | Applied at line 263: `if (!showTentative && project.status === 'tentative') return null` |
> | **`canEdit` prop** | `canEditProject(project.id)` | `isAdmin` |
> | **Header extra props** | `milestones`, `onMilestoneToggle` | `dayOffs`, `onDayOffToggle`, `projects`, `hasOverlap`, `isNonWorkingDay` |
> | **`hasOverlap` on AssignmentRow** | Computed via `hasOverlap(member.id, ...)` | Hardcoded `false` |
>
> A generic `renderItemRows<T>` function would still need internal `if (viewMode === ...)` branches to handle these differences, which may not reduce complexity much — it would just move it. **The real maintenance risk is that bug fixes must be applied to both branches.** Whether deduplication is worthwhile depends on how often these branches diverge going forward.

**Implementation** (if proceeding):

1. Extract the **`AssignmentRow` rendering loop** (the inner loop that maps assignments to rows) as a shared function. This is the part with the highest overlap. Leave the `TimelineItemHeader` rendering inline since the prop differences are significant.

2. Accept a `resolveChildItem` callback to handle the member-vs-project lookup:
   ```typescript
   function renderAssignmentRows({
     assignments,
     resolveChildItem,
     // ... shared props (dates, columnWidth, etc.)
   }): React.ReactNode {
     return assignments.map((assignment) => {
       const childItem = resolveChildItem(assignment)
       if (!childItem) return null
       return <AssignmentRow key={assignment.id} ... />
     })
   }
   ```

3. The `showTentative` filter can be applied by the caller before passing `assignments` in.

4. `TimelineItemHeader` stays inlined in each branch due to the divergent prop signatures.

**Verification**: Snapshot tests should pass unchanged (JSX output identical). Add type-safety tests for both view modes. **Before starting, confirm the two branches haven't diverged further since this analysis.**

---

### Phase 7: Fix Timeline z-index Stacking Order (Assignment Edit Popover Clipped by Header)

**Severity**: High | **Risk**: Low | **Files**: `AssignmentEditPopover.tsx`, `TimelineHeader.tsx`, `TimelineItemHeader.tsx`, `AssignmentRow.tsx`, `ExpandedAssignmentBar.tsx`, `AssignmentCommentOverlay.tsx`, `DeleteDragOverlay.tsx`, `ui/tooltip.tsx`, `ui/popover.tsx`, `ui/dialog.tsx`, `ui/select.tsx`, `ui/toast.tsx`

**Problem**: The assignment detail popup (`AssignmentEditPopover`) has `z-50`, but the timeline header has `z-[60]`. When the popover opens near the top of the viewport, the sticky timeline header overlaps and clips it. The popover should always appear above all timeline chrome.

**Current z-index audit** (complete inventory):

```
Layer 1 — z-20:  Assignment bars (ExpandedAssignmentBar:131)
                  Comment overlays (AssignmentCommentOverlay:108)

Layer 2 — z-30:  Priority emoji indicators 🔥/🤷 (ExpandedAssignmentBar:153,158)
                  Delete drag overlay (DeleteDragOverlay:87)

Layer 3 — z-50:  All sticky sidebars:
                    - TimelineHeader sidebar label (TimelineHeader:79)
                    - Project/member header sidebars (TimelineItemHeader:80,114)
                    - Assignment row sidebars (AssignmentRow:134,270)
                  AssignmentEditPopover (AssignmentEditPopover:154) ← BUG: same as sidebars

Layer 4 — z-[60]: Timeline header top-sticky container (TimelineHeader:53)
                    ↑ This overlaps the z-50 popover

Layer 5 — z-[70]: shadcn/ui overlays:
                    - TooltipContent (ui/tooltip.tsx:20)
                    - PopoverContent (ui/popover.tsx:20)
                    - DialogOverlay + DialogContent (ui/dialog.tsx:18,35)
                    - SelectContent (ui/select.tsx:76)

Layer 6 — z-[100]: Toast notifications (ui/toast.tsx:16)
```

**Root cause**: The popover is portaled to `document.body` via `createPortal`, so it escapes the timeline's stacking context — but its `z-50` is still lower than the timeline header's `z-[60]`.

**Implementation**:

1. **Raise `AssignmentEditPopover` to `z-[65]`** in `AssignmentEditPopover.tsx:154`:
   ```tsx
   // Before
   'fixed z-50 w-[340px] rounded-md border bg-popover p-4 text-popover-foreground shadow-md',

   // After
   'fixed z-[65] w-[340px] rounded-md border bg-popover p-4 text-popover-foreground shadow-md',
   ```
   This places it above the timeline header (`z-[60]`) but below shadcn/ui overlays (`z-[70]`) — which is correct because Select dropdowns inside the popover need to render above it.

2. **Document the intended stacking order** as a comment in the codebase (suggest adding to a shared constants file or as a comment block in `TimelineHeader.tsx`):
   ```
   // Timeline z-index stacking order:
   //   z-20   Assignment bars & comment overlays
   //   z-30   Priority indicators & delete drag overlay
   //   z-50   Sticky sidebars (left-pinned columns)
   //   z-[60] Sticky timeline header (top-pinned rows)
   //   z-[65] AssignmentEditPopover (portaled, above all timeline chrome)
   //   z-[70] shadcn/ui overlays (Tooltip, Popover, Dialog, Select)
   //   z-[100] Toast notifications
   ```

3. **Verify no other interactive overlays are at z-50 or below z-[60]** — the audit above confirms this is the only case. All shadcn/ui primitives (Tooltip, Dialog, Select) are already at `z-[70]`.

**Verification**: Open the timeline, click an assignment bar near the top of the viewport to trigger the edit popover. The popover should render fully above the sticky timeline header. Also verify the Select dropdown inside the popover (priority selector) still renders above the popover itself.

---

## Future Backlog

- **Error Boundary**: Wrap the Timeline in an error boundary to gracefully handle API failures
- **Optimistic updates**: Use React Query's `onMutate` for faster perceived responsiveness on drag operations
- **Prefetch adjacent date ranges**: Prefetch `startDate ± 30 days` when user is in the middle of a large date range
