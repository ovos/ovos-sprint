import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWebSocket } from '../use-websocket'

// Mock socket.io-client
const mockOn = vi.fn()
const mockOff = vi.fn()
const mockDisconnect = vi.fn()
const mockSocket = {
  on: mockOn,
  off: mockOff,
  disconnect: mockDisconnect,
  connected: false,
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}))

// Mock auth store
vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { token: 'mock-token' }
    return typeof selector === 'function' ? selector(state) : state
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useWebSocket', () => {
  it('exposes isConnected state', () => {
    const { result } = renderHook(() => useWebSocket())
    expect(result.current).toHaveProperty('isConnected')
    expect(typeof result.current.isConnected).toBe('boolean')
  })

  it('exposes the socket instance', () => {
    const { result } = renderHook(() => useWebSocket())
    expect(result.current).toHaveProperty('socket')
  })

  it('registers error and connect_error handlers', () => {
    renderHook(() => useWebSocket())

    const registeredEvents = mockOn.mock.calls.map((call: unknown[]) => call[0])
    expect(registeredEvents).toContain('connect')
    expect(registeredEvents).toContain('disconnect')
    expect(registeredEvents).toContain('connect_error')
  })
})
