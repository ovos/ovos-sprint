# OVOS Sprint - Feature Roadmap

## High Priority

none

### Performance: Stabilize Timeline callback props with `useCallback`

- [ ] `Timeline.tsx` defines `canEditAssignment`, `canEditProject`, `getGroupForDate`, `hasOverlap`, `handleDeleteDayAssignment`, and `toggleExpand` as plain functions that create new references every render. This defeats `React.memo` on `AssignmentRow`, causing all rows to re-render on any state change. Wrap these in `useCallback` with appropriate dependency arrays.

### Performance: Fix `DragContext` `forceUpdate` defeating ref+subscriber pattern

- [ ] `DragContext.tsx:80` calls `forceUpdate({})` on every drag state change (including every mousemove), which recreates the context `value` object and forces all consumers to re-render. Remove `forceUpdate` and memoize the context value -- the subscriber pattern already notifies cells directly.

### Performance: Memoize `expandedItemsSet` in Timeline

- [x] `Timeline.tsx:48` creates `new Set(expandedItemsProp)` on every render, producing a new reference that prevents child components from skipping re-renders via shallow comparison. Wrap in `useMemo`.

### Performance: Fix `new Date()` in AssignmentRow breaking memoization

- [x] `AssignmentRow.tsx:103` creates `const today = new Date()` on every render. Since `today` is used in a `useMemo` dependency array, the expensive date property computation is rerun every render. Use `useMemo(() => new Date(), [])` or pass a stable `today` prop from the parent.

### Bug: `CustomerTable` and `ProjectTable` defined inside parent render function

- [ ] `CustomersPage.tsx:170` and `ProjectsPage.tsx` define table components as functions inside the parent component body. React treats these as new component types each render, causing full DOM unmount/remount (losing scroll position, focus, and internal state). Move them to module scope.

### Security: Add rate limiting to login and registration endpoints

- [x] `auth.ts` applies `rateLimiter` only to `/forgot-password` but not to `POST /login` or `POST /register`. Add `rateLimiter(10, 15 * 60 * 1000)` to both endpoints to defend against brute-force/credential-stuffing attacks.

### Security: Stop logging password reset tokens in production

- [ ] `auth.ts:258-262` unconditionally logs the full reset link (including the secret token) to stdout. Guard with `NODE_ENV !== 'production'` or remove the token from the log message entirely.

### Security: Fix password reset token lookup scanning all tokens with bcrypt

- [ ] `auth.ts:280-291` fetches all non-expired password reset rows and loops `bcrypt.compareSync` against each. With many pending resets this is O(n) bcrypt operations (~100ms each). Use SHA-256 for token storage/lookup since the token already has 256 bits of entropy.

### Resilience: Add error boundary around route tree

- [ ] `App.tsx` has no `ErrorBoundary` wrapping the `<Routes>` block. If a lazy-loaded chunk fails or a component throws, the entire app white-screens. Add `react-error-boundary` with a friendly recovery UI.

## Medium Priority

### Performance: Add database indexes on frequently queried columns

- [ ] `schema.ts` lacks indexes on `day_assignments.project_assignment_id`, `day_assignments.date`, `project_assignments.project_id`, `project_assignments.team_member_id`, `milestones.project_id`, and `day_offs.team_member_id`. Add indexes and `db:push` -- these columns are used in WHERE/JOIN on every timeline load.

### Performance: Fix N+1 queries in assignment endpoints

- [ ] `assignments.ts` GET `/projects` and `/days` run 3 individual queries per assignment in a `Promise.all` loop (project, member, day assignments). Replace with Drizzle relational queries using `with:` clauses to eagerly load relations in 1-2 queries.

### Performance: Move milestone/day-off filtering from JS to SQL

- [ ] `milestones.ts:33-53` and `day-offs.ts:20-33` fetch all rows and filter in JavaScript. Use Drizzle `where` clauses with `and(gte, lte, eq)` to push filtering to SQLite, as already done in the assignments routes.

### Performance: Optimize `isDayAssigned` helper in timeline-helpers.ts

- [ ] `isDayAssigned` is called ~1500 times per render (dates x rows), each doing `.some()` over all day assignments with `new Date()` construction per element. Use string comparison (`da.date === format(date, 'yyyy-MM-dd')`) or pass the pre-computed `dayAssignmentIndex` map.

### Performance: Memoize `TimelineItemHeader` and its `isDayOff` function

- [ ] `TimelineItemHeader.tsx` is not wrapped in `memo()` and defines `isDayOff` inline, doing a `.some()` scan per date cell per row. Wrap in `memo()` and pre-compute a `Set<string>` for O(1) day-off lookups.

### DX: Return Zod validation details in error responses

- [ ] Catch blocks across all routes return generic `{ error: 'Invalid request' }` when Zod parsing fails. Check `instanceof z.ZodError` and return `{ error: 'Validation failed', details: error.errors }` so API consumers get actionable feedback.

### DX: Extract duplicated `canModifyProject` to shared utility

- [ ] `canModifyProject` is identically defined in `assignments.ts:11-19` and `milestones.ts:10-18`. Extract to a shared `utils/authorization.ts` to avoid divergent authorization logic.

### DX: Move inline Zod schemas to centralized validation.ts

- [ ] `milestones.ts` and `day-offs.ts` define schemas inline instead of in `utils/validation.ts` where all other schemas live. Centralize for discoverability and consistency.

### DX: Consistent `parseInt` validation on route params

- [ ] Several routes in `teams.ts`, `customers.ts`, `members.ts` call `parseInt(req.params.id)` without checking for `NaN`, returning misleading 404s instead of 400s. Extract a `parseIdParam` utility and use it consistently.

### Resilience: Add WebSocket error handling and reconnection

- [ ] `use-websocket.ts` has no error handler, no reconnection logic, and no connection state tracking. Add `socket.on('error', ...)`, enable socket.io reconnection options, and expose connection state.

### Security: Scope rate limiter keys by route

- [ ] `rateLimiter.ts:27` uses only the client IP as the key. Requests to different rate-limited routes share the same counter. Include the route path in the key to prevent cross-route lockout.

### Accessibility: Add `aria-label` to icon-only buttons across CRUD pages

- [ ] Icon-only action buttons in `UsersPage`, `CustomersPage`, `TeamsPage`, and `MembersPage` lack `aria-label` attributes. Screen readers announce these as unlabeled buttons.

### Security: Set explicit `express.json()` body size limit

- [ ] `index.ts:136` calls `express.json()` with no `limit` option. Set an explicit limit like `{ limit: '1mb' }` to prevent memory exhaustion from oversized payloads.

### Consistency: Fix WebSocket CORS to match HTTP CORS

- [ ] `websocket/index.ts:8` uses a single-string CORS origin while `index.ts:109-114` constructs an array with `www.` variant. Extract `allowedOrigins` to a shared utility and use it for both.

## Low Priority

### Feature: add a new toggle for abstract week view

- [ ] TBD

### Internationalization (i18n)

- [ ] Install and configure intlayer packages (`intlayer`, `react-intlayer`)
- [ ] Create `.content.ts` files for all pages and components
- [ ] Support German (de) and English (en) locales
- [ ] Replace hardcoded UI text with intlayer hooks
- [ ] Update date formatting in `lib/utils.ts` to use dynamic locale
- [ ] Configure intlayer build process
- [ ] Add language switcher component
- [ ] Use Tolgee for interactive localization

**Current State**: Application uses German locale (`de-AT`) for date formatting but all UI text is in English.
