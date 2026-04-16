/**
 * Tests for Phase 7: AssignmentEditPopover z-index fix
 *
 * Verifies that the popover renders above the timeline header (z-[60])
 * but below shadcn/ui overlays (z-[70]).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssignmentEditPopover } from '../AssignmentEditPopover'

describe('AssignmentEditPopover z-index', () => {
  const defaultProps = {
    open: true,
    onOpenChange: () => {},
    position: { x: 100, y: 100 },
    group: null,
    projectAssignmentId: 1,
    dateRange: { start: '2026-04-01', end: '2026-04-05' },
    onSave: () => {},
  }

  it('renders with z-index higher than timeline header (z-[60])', () => {
    render(<AssignmentEditPopover {...defaultProps} />)

    // The popover should be in the DOM (portaled to body)
    const saveButton = screen.getByRole('button', { name: /save/i })
    const popover = saveButton.closest('[class*="z-"]')

    expect(popover).toBeDefined()
    // Should have z-[65] class (above z-[60] header, below z-[70] overlays)
    expect(popover!.className).toContain('z-[65]')
    expect(popover!.className).not.toContain('z-50')
  })

  it('does not render when open is false', () => {
    const { container } = render(<AssignmentEditPopover {...defaultProps} open={false} />)
    // Component returns null when closed — nothing rendered in the container
    expect(container.innerHTML).toBe('')
  })
})
