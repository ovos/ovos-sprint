import { Response } from 'express'
import { z } from 'zod'

/**
 * Handles route errors with proper Zod validation detail extraction.
 * - ZodError: returns 400 with validation details
 * - Other errors: returns the specified status with a generic message
 */
export function handleRouteError(
  res: Response,
  error: unknown,
  context: string,
  fallbackStatus: number = 500,
  fallbackMessage: string = 'Server error'
): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation failed', details: error.errors })
    return
  }
  console.error(`${context}:`, error)
  res.status(fallbackStatus).json({ error: fallbackMessage })
}
