# OVOS Sprint - Feature Roadmap

## High Priority

### Performance: Stabilize Timeline callback props with `useCallback`

- [ ] `Timeline.tsx` defines `canEditAssignment`, `canEditProject`, `getGroupForDate`, `hasOverlap`, `handleDeleteDayAssignment`, and `toggleExpand` as plain functions that create new references every render. This defeats `React.memo` on `AssignmentRow`, causing all rows to re-render on any state change. Wrap these in `useCallback` with appropriate dependency arrays.

### Performance: Fix `DragContext` `forceUpdate` defeating ref+subscriber pattern

- [ ] `DragContext.tsx:80` calls `forceUpdate({})` on every drag state change (including every mousemove), which recreates the context `value` object and forces all consumers to re-render. Remove `forceUpdate` and memoize the context value -- the subscriber pattern already notifies cells directly.

### Bug: `CustomerTable` and `ProjectTable` defined inside parent render function

- [x] `CustomersPage.tsx:170` and `ProjectsPage.tsx` define table components as functions inside the parent component body. React treats these as new component types each render, causing full DOM unmount/remount (losing scroll position, focus, and internal state). Move them to module scope.

### Resilience: Add error boundary around route tree

- [x] `App.tsx` has no `ErrorBoundary` wrapping the `<Routes>` block. If a lazy-loaded chunk fails or a component throws, the entire app white-screens. Add `react-error-boundary` with a friendly recovery UI.

## Medium Priority

### Performance: Add database indexes on frequently queried columns

- [x] `schema.ts` lacks indexes on `day_assignments.project_assignment_id`, `day_assignments.date`, `project_assignments.project_id`, `project_assignments.team_member_id`, `milestones.project_id`, and `day_offs.team_member_id`. Add indexes and `db:push` -- these columns are used in WHERE/JOIN on every timeline load.

### Performance: Fix N+1 queries in assignment endpoints

- [ ] `assignments.ts` GET `/projects` and `/days` run 3 individual queries per assignment in a `Promise.all` loop (project, member, day assignments). Replace with Drizzle relational queries using `with:` clauses to eagerly load relations in 1-2 queries.

### Performance: Optimize `isDayAssigned` helper in timeline-helpers.ts

- [ ] `isDayAssigned` is called ~1500 times per render (dates x rows), each doing `.some()` over all day assignments with `new Date()` construction per element. Use string comparison (`da.date === format(date, 'yyyy-MM-dd')`) or pass the pre-computed `dayAssignmentIndex` map.

### Performance: Memoize `TimelineItemHeader` and its `isDayOff` function

- [ ] `TimelineItemHeader.tsx` is not wrapped in `memo()` and defines `isDayOff` inline, doing a `.some()` scan per date cell per row. Wrap in `memo()` and pre-compute a `Set<string>` for O(1) day-off lookups.

### Resilience: Add WebSocket error handling and reconnection

- [ ] `use-websocket.ts` has no error handler, no reconnection logic, and no connection state tracking. Add `socket.on('error', ...)`, enable socket.io reconnection options, and expose connection state.

### Accessibility: Add `aria-label` to icon-only buttons across CRUD pages

- [ ] Icon-only action buttons in `UsersPage`, `CustomersPage`, `TeamsPage`, and `MembersPage` lack `aria-label` attributes. Screen readers announce these as unlabeled buttons.

### Consistency: Fix WebSocket CORS to match HTTP CORS

- [x] `websocket/index.ts:8` uses a single-string CORS origin while `index.ts:109-114` constructs an array with `www.` variant. Extract `allowedOrigins` to a shared utility and use it for both.
