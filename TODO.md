# OVOS Sprint - Feature Roadmap

## Future Backlog

### Timeline: Virtualization for Large Datasets

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

> **Review note (additional risk):** Row virtualization alone (via `@tanstack/react-virtual`) only reduces the outer loop — each visible row still renders 60+ date cells for wide date ranges. This partially defeats the purpose. Horizontal (column) virtualization would help but introduces complexity with `position: sticky` for the sidebar column. The `sticky` element must share the same scroll parent as the virtualized content, which `@tanstack/react-virtual` supports, but alignment between sticky and virtualized rows needs careful testing. **Recommendation:** Measure whether the Phase 1 dateInfoMap optimization (now done) makes row virtualization alone sufficient.

**Verification**: Manual testing with 100+ projects, 500+ assignments. Profile DOM node count before/after.

---

### Timeline: Code Deduplication in TimelineViewContent (Optional)

**Severity**: Low | **Risk**: Medium | **Files**: `TimelineViewContent.tsx`

**Problem**: The `by-project` section (lines 105–199) and `by-member` section (lines 202–303) share significant structural similarity — both map over items, filter assignments, render `TimelineItemHeader`, and render `AssignmentRow`.

> **Review note:** The actual differences between branches are substantial:
>
> | Aspect | By-Project | By-Member |
> |--------|-----------|-----------|
> | **`showTentative` filter** | Not applied | Applied: `if (!showTentative && project.status === 'tentative') return null` |
> | **`canEdit` prop** | `canEditProject(project.id)` | `isAdmin` |
> | **Header extra props** | `milestones`, `onMilestoneToggle` | `dayOffs`, `onDayOffToggle`, `projects`, `hasOverlap`, `isNonWorkingDay` |
> | **`hasOverlap` on AssignmentRow** | Computed via `hasOverlap(member.id, ...)` | Hardcoded `false` |
>
> A generic function would still need internal branches. **The real maintenance risk is that bug fixes must be applied to both branches.** Whether deduplication is worthwhile depends on how often these branches diverge.

**Implementation** (if proceeding):

1. Extract the **`AssignmentRow` rendering loop** as a shared function. Leave `TimelineItemHeader` inline due to divergent prop signatures.

2. Accept a `resolveChildItem` callback to handle the member-vs-project lookup.

3. The `showTentative` filter can be applied by the caller before passing `assignments` in.

**Verification**: Snapshot tests should pass unchanged. **Before starting, confirm the two branches haven't diverged further.**

---

### Other Ideas

- **Error Boundary**: Wrap the Timeline in an error boundary to gracefully handle API failures
- **Optimistic updates**: Use React Query's `onMutate` for faster perceived responsiveness on drag operations
- **Prefetch adjacent date ranges**: Prefetch `startDate ± 30 days` when user is in the middle of a large date range
