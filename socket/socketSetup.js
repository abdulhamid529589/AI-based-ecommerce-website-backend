import { Server } from 'socket.io'

/**
 * Initialize Socket.io for real-time category updates
 * Emits 'categories:updated' when categories change
 */
export const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: [
        'http://localhost:5173', // Dashboard
        'http://localhost:5174', // Frontend shop
        'http://localhost:3000', // Alternative frontend port
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  // Track connected clients
  const connectedClients = new Set()

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] ✅ Client connected: ${socket.id}`)
    connectedClients.add(socket.id)

    // Log current connections
    console.log(`[Socket.IO] 👥 Total connections: ${connectedClients.size}`)

    // When client disconnects
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] ❌ Client disconnected: ${socket.id}`)
      connectedClients.delete(socket.id)
      console.log(`[Socket.IO] 👥 Total connections: ${connectedClients.size}`)
    })

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[Socket.IO] ⚠️ Error from ${socket.id}:`, error)
    })
  })

  return io
}

/**
 * Emit category update to all connected clients
 * Called whenever categories are saved/updated
 */
export const broadcastCategoryUpdate = (io, categories) => {
  console.log(`[Socket.IO] 📢 Broadcasting category update to all clients`)
  io.emit('categories:updated', {
    timestamp: new Date().toISOString(),
    categories: categories,
    message: 'Categories have been updated',
  })
}

/**
 * Emit update to specific namespace/room
 * Can be used for role-based updates (e.g., admin-only)
 */
export const broadcastToAdmins = (io, event, data) => {
  console.log(`[Socket.IO] 📢 Broadcasting to admins:`, event)
  io.emit(`admin:${event}`, data)
}

export default {
  initializeSocket,
  broadcastCategoryUpdate,
  broadcastToAdmins,
}
