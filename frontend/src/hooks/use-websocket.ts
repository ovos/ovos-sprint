import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/auth'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const token = useAuthStore((state) => state.token)

  useEffect(() => {
    if (!token) return

    socketRef.current = io(WS_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected')
      setIsConnected(true)
    })

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
    })

    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message)
      setIsConnected(false)
    })

    return () => {
      socketRef.current?.disconnect()
      setIsConnected(false)
    }
  }, [token])

  return { socket: socketRef.current, isConnected }
}

export function useWebSocketEvent<T>(event: string, handler: (data: T) => void) {
  const { socket } = useWebSocket()

  const stableHandler = useCallback(handler, [handler])

  useEffect(() => {
    if (!socket) return

    socket.on(event, stableHandler)

    return () => {
      socket.off(event, stableHandler)
    }
  }, [socket, event, stableHandler])
}
