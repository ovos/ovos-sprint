/**
 * Shared CORS allowed origins, used by both Express HTTP and Socket.IO WebSocket servers.
 * Generates the base FRONTEND_URL and a www. variant if applicable.
 */
export function getAllowedOrigins(): string[] {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173'
  const origins = [base]

  // Add www. variant if the URL doesn't already contain it
  if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('//www.')) {
    origins.push(process.env.FRONTEND_URL.replace('//', '//www.'))
  }

  return origins
}
