import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { rateLimiter } from '../middleware/rateLimiter.js'

describe('rateLimiter route scoping', () => {
  it('tracks rate limits per route, not globally', async () => {
    const app = express()

    // Two routes with the same rate limit (2 requests per window)
    app.get('/route-a', rateLimiter(2, 60000), (_req, res) => res.json({ route: 'a' }))
    app.get('/route-b', rateLimiter(2, 60000), (_req, res) => res.json({ route: 'b' }))

    // Hit route A twice (should exhaust its limit)
    await request(app).get('/route-a')
    await request(app).get('/route-a')

    // Route A should now be rate-limited
    const resA = await request(app).get('/route-a')
    expect(resA.status).toBe(429)

    // Route B should still work (separate counter)
    const resB = await request(app).get('/route-b')
    expect(resB.status).toBe(200)
    expect(resB.body.route).toBe('b')
  })

  it('still limits requests to the same route', async () => {
    const app = express()
    app.get('/limited', rateLimiter(3, 60000), (_req, res) => res.json({ ok: true }))

    // First 3 should pass
    const res1 = await request(app).get('/limited')
    const res2 = await request(app).get('/limited')
    const res3 = await request(app).get('/limited')
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(res3.status).toBe(200)

    // 4th should be blocked
    const res4 = await request(app).get('/limited')
    expect(res4.status).toBe(429)
    expect(res4.body.error).toBe('Too many requests')
  })
})
