import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { PageLoader } from '../PageLoader'

describe('PageLoader', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a loading indicator with correct role', () => {
    render(<PageLoader />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders accessible loading text', () => {
    render(<PageLoader />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('contains a spinner element', () => {
    const { container } = render(<PageLoader />)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })
})
