# OVOS Sprint - Feature Roadmap

## High Priority

### Performance: Stabilize Timeline callback props with `useCallback`

- [ ] `Timeline.tsx` defines `canEditAssignment`, `canEditProject`, `getGroupForDate`, `hasOverlap`, `handleDeleteDayAssignment`, and `toggleExpand` as plain functions that create new references every render. This defeats `React.memo` on `AssignmentRow`, causing all rows to re-render on any state change. Wrap these in `useCallback` with appropriate dependency arrays.

### Performance: Fix `DragContext` `forceUpdate` defeating ref+subscriber pattern

- [ ] `DragContext.tsx:80` calls `forceUpdate({})` on every drag state change (including every mousemove), which recreates the context `value` object and forces all consumers to re-render. Remove `forceUpdate` and memoize the context value -- the subscriber pattern already notifies cells directly.

## Medium Priority

### Performance: Fix N+1 queries in assignment endpoints

- [x] `assignments.ts` GET `/projects` and `/days` run 3 individual queries per assignment in a `Promise.all` loop (project, member, day assignments). Replace with Drizzle relational queries using `with:` clauses to eagerly load relations in 1-2 queries.

### Performance: Optimize `isDayAssigned` helper in timeline-helpers.ts

- [ ] `isDayAssigned` is called ~1500 times per render (dates x rows), each doing `.some()` over all day assignments with `new Date()` construction per element. Use string comparison (`da.date === format(date, 'yyyy-MM-dd')`) or pass the pre-computed `dayAssignmentIndex` map.

### Performance: Memoize `TimelineItemHeader` and its `isDayOff` function

- [ ] `TimelineItemHeader.tsx` is not wrapped in `memo()` and defines `isDayOff` inline, doing a `.some()` scan per date cell per row. Wrap in `memo()` and pre-compute a `Set<string>` for O(1) day-off lookups.

### Resilience: Add WebSocket error handling and reconnection

- [x] `use-websocket.ts` has no error handler, no reconnection logic, and no connection state tracking. Add `socket.on('error', ...)`, enable socket.io reconnection options, and expose connection state.

### Accessibility: Add `aria-label` to icon-only buttons across CRUD pages

- [x] Icon-only action buttons in `UsersPage`, `CustomersPage`, `TeamsPage`, and `MembersPage` lack `aria-label` attributes. Screen readers announce these as unlabeled buttons.
