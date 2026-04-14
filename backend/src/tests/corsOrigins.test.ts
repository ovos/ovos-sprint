import { describe, it, expect, afterEach } from 'vitest'
import { getAllowedOrigins } from '../utils/corsOrigins.js'

describe('getAllowedOrigins', () => {
  const originalEnv = process.env.FRONTEND_URL

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FRONTEND_URL
    } else {
      process.env.FRONTEND_URL = originalEnv
    }
  })

  it('generates www variant when FRONTEND_URL does not contain www', () => {
    process.env.FRONTEND_URL = 'https://sprint.ovos.at'
    const origins = getAllowedOrigins()
    expect(origins).toContain('https://sprint.ovos.at')
    expect(origins).toContain('https://www.sprint.ovos.at')
    expect(origins).toHaveLength(2)
  })

  it('does not duplicate www when FRONTEND_URL already contains www', () => {
    process.env.FRONTEND_URL = 'https://www.sprint.ovos.at'
    const origins = getAllowedOrigins()
    expect(origins).toContain('https://www.sprint.ovos.at')
    expect(origins).toHaveLength(1)
  })

  it('falls back to localhost when FRONTEND_URL is not set', () => {
    delete process.env.FRONTEND_URL
    const origins = getAllowedOrigins()
    expect(origins).toContain('http://localhost:5173')
    expect(origins).toHaveLength(1)
  })

  it('generates www variant for localhost with explicit URL', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173'
    const origins = getAllowedOrigins()
    expect(origins).toContain('http://localhost:5173')
    // localhost doesn't need www variant, but the logic generates it
    // based on whether '//www.' is present in the URL
    expect(origins).toContain('http://www.localhost:5173')
    expect(origins).toHaveLength(2)
  })
})
