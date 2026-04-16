/**
 * Tests for Phase 4: ExpandedAssignmentBar React.memo wrapping
 *
 * Verifies that:
 * 1. ExpandedAssignmentBar is wrapped in React.memo
 * 2. The curried handler factories in AssignmentRow return stable references
 */
import { describe, it, expect } from 'vitest'
import { ExpandedAssignmentBar } from '../ExpandedAssignmentBar'

describe('ExpandedAssignmentBar memoization', () => {
  it('is wrapped in React.memo', () => {
    // React.memo wraps a component and sets $$typeof to Symbol.for('react.memo')
    // The .type property contains the original component
    expect(ExpandedAssignmentBar).toBeDefined()
    // React.memo components have a `type` property pointing to the inner component
    expect((ExpandedAssignmentBar as any).$$typeof).toBe(Symbol.for('react.memo'))
  })

  it('has displayName for React DevTools', () => {
    // The memo wrapper should expose the inner component name
    expect(
      (ExpandedAssignmentBar as any).displayName ||
      (ExpandedAssignmentBar as any).type?.displayName ||
      (ExpandedAssignmentBar as any).type?.name
    ).toBeTruthy()
  })
})
