import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@/tests/utils'
import { ErrorBoundary } from 'react-error-boundary'
import { ErrorFallback } from '@/components/ErrorFallback'

afterEach(() => {
  cleanup()
})

// Suppress React's error boundary console.error in tests
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterEach(() => {
  console.error = originalConsoleError
})

function GoodChild() {
  return <div>All good</div>
}

function ThrowingChild(): never {
  throw new Error('Test explosion')
}

describe('ErrorBoundary with ErrorFallback', () => {
  it('renders children normally when no error', () => {
    render(
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GoodChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
  })

  it('shows a try again button in the fallback', () => {
    render(
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
