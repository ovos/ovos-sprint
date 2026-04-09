export function PageLoader() {
  return (
    <div
      role="status"
      className="flex h-full min-h-[50vh] items-center justify-center"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    </div>
  )
}
