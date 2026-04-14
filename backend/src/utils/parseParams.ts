import { Response } from 'express'

/**
 * Parses a route parameter as a positive integer ID.
 * Returns the parsed number, or sends a 400 response and returns null if invalid.
 */
export function parseIdParam(param: string, res: Response, label: string = 'ID'): number | null {
  const id = parseInt(param, 10)
  if (Number.isNaN(id) || !Number.isInteger(id) || id <= 0 || String(id) !== param) {
    res.status(400).json({ error: `Invalid ${label}` })
    return null
  }
  return id
}
