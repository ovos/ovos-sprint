import { FallbackProps } from 'react-error-boundary'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {(error as Error)?.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <Button onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  )
}
