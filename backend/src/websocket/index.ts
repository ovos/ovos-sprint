import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { verifyToken } from '../utils/jwt.js'
import { getAllowedOrigins } from '../utils/corsOrigins.js'

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  })

  // Authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) {
        return next(new Error('Authentication error'))
      }

      const payload = verifyToken(token)
      socket.data.user = payload
      next()
    } catch (error) {
      next(new Error('Authentication error'))
    }
  })

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.data.user.email}`)

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.data.user.email}`)
    })
  })

  return io
}

// Event types for realtime updates
export enum WSEvent {
  TEAM_CREATED = 'team:created',
  TEAM_UPDATED = 'team:updated',
  TEAM_DELETED = 'team:deleted',

  MEMBER_CREATED = 'member:created',
  MEMBER_UPDATED = 'member:updated',
  MEMBER_DELETED = 'member:deleted',

  PROJECT_CREATED = 'project:created',
  PROJECT_UPDATED = 'project:updated',
  PROJECT_DELETED = 'project:deleted',

  ASSIGNMENT_CREATED = 'assignment:created',
  ASSIGNMENT_DELETED = 'assignment:deleted',

  DAY_ASSIGNMENT_CREATED = 'dayAssignment:created',
  DAY_ASSIGNMENT_UPDATED = 'dayAssignment:updated',
  DAY_ASSIGNMENT_DELETED = 'dayAssignment:deleted',
}
