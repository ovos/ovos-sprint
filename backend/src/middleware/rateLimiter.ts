import { Request, Response, NextFunction } from 'express'

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 10 * 60 * 1000)

/**
 * Rate limiter middleware
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 */
export function rateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const identifier = `${req.path}:${ip}`
    const now = Date.now()

    const entry = rateLimitStore.get(identifier)

    if (!entry || entry.resetTime < now) {
      rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      })
      return next()
    }

    if (entry.count >= maxRequests) {
      const resetIn = Math.ceil((entry.resetTime - now) / 1000)
      return res.status(429).json({
        error: 'Too many requests',
        message: `Please try again in ${resetIn} seconds`,
      })
    }

    entry.count++
    next()
  }
}
