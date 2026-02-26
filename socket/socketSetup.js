import { Server } from 'socket.io'
import { createLogger } from '../utils/logger.js'
import { initializeChatSocket } from './chatSocket.js'

const logger = createLogger('Socket.IO')

/**
 * Initialize Socket.io for real-time updates
 * Supports:
 * - Category updates
 * - Product inventory sync
 * - Order notifications
 * - User activity tracking
 * - Dashboard analytics
 * - Live chat messaging
 */
export const initializeSocket = (httpServer) => {
  logger.info('🚀 Initializing Socket.io server')

  // Validate production CORS URLs
  if (!process.env.FRONTEND_URL) {
    logger.warn('⚠️ FRONTEND_URL environment variable not set! Local development only will work.')
  }
  if (!process.env.DASHBOARD_URL) {
    logger.warn('⚠️ DASHBOARD_URL environment variable not set! Local development only will work.')
  }

  const allowedOrigins = [
    'http://localhost:5173', // Dashboard
    'http://localhost:5174', // Frontend shop
    'http://localhost:3000', // Alternative frontend port
    process.env.FRONTEND_URL || '',
    process.env.DASHBOARD_URL || '',
  ].filter(Boolean)

  logger.info('📋 Socket.io CORS allowed origins:', {
    origins: allowedOrigins,
    frontendUrl: process.env.FRONTEND_URL,
    dashboardUrl: process.env.DASHBOARD_URL,
  })

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
      allowEIO3: true,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    maxHttpBufferSize: 1e6, // 1MB max message size
    pingInterval: 25000,
    pingTimeout: 60000,
  })

  // Track connected clients by type
  const connectedClients = {
    dashboard: new Map(),
    frontend: new Map(),
  }

  /**
   * Connection handler with comprehensive error handling
   */
  io.on('connection', (socket) => {
    try {
      logger.socketConnect(socket.id, 'unknown', socket.handshake.address)

      // Default to frontend if not specified
      let clientType = 'frontend'
      let userId = null
      let userEmail = null

      /**
       * Client identifies their type (dashboard or frontend)
       */
      socket.on('client-type', (type) => {
        try {
          clientType = type === 'dashboard' ? 'dashboard' : 'frontend'
          connectedClients[clientType].set(socket.id, {
            socketId: socket.id,
            connectedAt: new Date(),
            userId: userId,
          })

          socket.join(clientType)
          logger.info(`📍 Client identified`, {
            socketId: socket.id,
            clientType,
            totalDashboard: connectedClients.dashboard.size,
            totalFrontend: connectedClients.frontend.size,
          })
        } catch (error) {
          logger.socketError(socket.id, 'client-type', error)
          socket.emit('error', { message: 'Failed to identify client type' })
        }
      })

      /**
       * Alternative identify event (for backwards compatibility)
       */
      socket.on('identify', (data) => {
        try {
          clientType =
            data?.role === 'dashboard' || data?.type === 'dashboard' ? 'dashboard' : 'frontend'
          connectedClients[clientType].set(socket.id, {
            socketId: socket.id,
            connectedAt: new Date(),
            role: data?.role || clientType,
            userId: data?.userId,
          })

          socket.join(clientType)
          logger.debug(`📍 Client identified with role`, {
            socketId: socket.id,
            clientType,
            role: data?.role,
          })
        } catch (error) {
          logger.socketError(socket.id, 'identify', error)
        }
      })

      /**
       * Disconnect handler with cleanup
       */
      socket.on('disconnect', async (reason) => {
        try {
          logger.socketDisconnect(socket.id, reason, clientType)

          // Clean up client connection tracking
          connectedClients[clientType].delete(socket.id)

          logger.debug('📊 Connection status', {
            dashboardClients: connectedClients.dashboard.size,
            frontendClients: connectedClients.frontend.size,
          })
        } catch (error) {
          logger.error('❌ Error during disconnect cleanup', error, {
            socketId: socket.id,
            reason,
          })
        }
      })

      /**
       * Socket error handler
       */
      socket.on('error', (error) => {
        logger.socketError(socket.id, 'socket-error', error, {
          clientType,
          userId,
        })
      })
    } catch (connectionError) {
      logger.error('❌ Fatal error in connection handler', connectionError, {
        socketId: socket.id,
      })
      socket.disconnect()
    }
  })

  /**
   * Server-level error handling
   */
  io.engine.on('connection_error', (err) => {
    logger.error('❌ Engine connection error', err, {
      errorCode: err.code,
      errorContext: err.context,
    })
  })

  // Initialize all chat and messaging features
  initializeChatSocket(io)

  return io
}

/**
 * CATEGORY EVENTS
 * Emit when categories are created/updated/deleted
 */
export const broadcastCategoryUpdate = (io, categories) => {
  console.log(`[Socket.IO] 📢 Broadcasting CATEGORY UPDATE to all clients`)
  io.emit('categories:updated', {
    timestamp: new Date().toISOString(),
    categories: categories,
    event: 'category-sync',
  })
}

export const broadcastCategoryChange = (io, action, category) => {
  console.log(`[Socket.IO] 📢 Broadcasting CATEGORY ${action.toUpperCase()} to all clients`)
  io.emit('categories:changed', {
    timestamp: new Date().toISOString(),
    action: action, // 'created', 'updated', 'deleted'
    category: category,
  })
}

/**
 * SUBCATEGORY EVENTS
 * Emit when subcategories are created/updated/deleted/reordered
 */
export const broadcastSubcategoryUpdate = (io, subcategory, action = 'updated') => {
  console.log(`[Socket.IO] 📢 Broadcasting SUBCATEGORY ${action.toUpperCase()} to all clients`)
  io.emit('subcategories:changed', {
    timestamp: new Date().toISOString(),
    action: action,
    subcategory: subcategory,
    event: 'subcategory-sync',
  })
}

/**
 * PRODUCT EVENTS
 * Emit when products are created/updated/stock changes
 */
export const broadcastProductUpdate = (io, product, action = 'updated') => {
  console.log(`[Socket.IO] 📢 Broadcasting PRODUCT ${action.toUpperCase()}`)
  io.emit('products:changed', {
    timestamp: new Date().toISOString(),
    action: action, // 'created', 'updated', 'deleted', 'stock-changed'
    product: product,
  })
}

export const broadcastProductStockUpdate = (io, productId, newStock) => {
  console.log(`[Socket.IO] 📢 Broadcasting STOCK UPDATE for product ${productId}`)
  io.emit('stock:updated', {
    timestamp: new Date().toISOString(),
    productId: productId,
    newStock: newStock,
    event: 'stock-sync',
  })
}

/**
 * ORDER EVENTS
 * Emit when orders are created/updated
 */
export const broadcastOrderUpdate = (io, order, action = 'created') => {
  console.log(`[Socket.IO] 📢 Broadcasting ORDER ${action.toUpperCase()}`)

  // Broadcast to admins (dashboard)
  io.to('dashboard').emit('orders:changed', {
    timestamp: new Date().toISOString(),
    action: action, // 'created', 'updated', 'paid', 'shipped'
    order: order,
  })

  // Notify customer on frontend
  io.emit('order:notification', {
    timestamp: new Date().toISOString(),
    action: action,
    orderId: order.id,
    status: order.status,
  })
}

/**
 * DASHBOARD ANALYTICS EVENTS
 * Emit analytics updates for real-time dashboard stats
 */
export const broadcastAnalyticsUpdate = (io, analytics) => {
  console.log(`[Socket.IO] 📢 Broadcasting ANALYTICS UPDATE`)
  io.to('dashboard').emit('analytics:updated', {
    timestamp: new Date().toISOString(),
    totalProducts: analytics.totalProducts,
    totalOrders: analytics.totalOrders,
    totalRevenue: analytics.totalRevenue,
    lowStockItems: analytics.lowStockItems,
  })
}

/**
 * INVENTORY ALERT EVENTS
 * Emit when stock levels drop below threshold
 */
export const broadcastLowStockAlert = (io, product) => {
  console.log(`[Socket.IO] 📢 Broadcasting LOW STOCK ALERT for ${product.name}`)
  io.to('dashboard').emit('alert:low-stock', {
    timestamp: new Date().toISOString(),
    product: product,
    message: `${product.name} stock is below threshold`,
  })
}

/**
 * ADMIN EVENTS
 * Emit to dashboard only (admin-only broadcasts)
 */
export const broadcastToAdmins = (io, event, data) => {
  console.log(`[Socket.IO] 📢 Broadcasting to ADMIN dashboard: ${event}`)
  io.to('dashboard').emit(`admin:${event}`, {
    timestamp: new Date().toISOString(),
    ...data,
  })
}

/**
 * USER ACTIVITY EVENTS
 * Track user actions for analytics
 */
export const trackUserActivity = (io, userId, activity) => {
  console.log(`[Socket.IO] 📊 Tracking activity for user ${userId}`)
  io.to('dashboard').emit('user:activity', {
    timestamp: new Date().toISOString(),
    userId: userId,
    activity: activity,
  })
}

/**
 * REAL-TIME NOTIFICATION
 * Emit notifications to specific clients
 */
export const sendNotification = (io, clientType, message) => {
  console.log(`[Socket.IO] 🔔 Sending notification to ${clientType}`)
  io.to(clientType).emit('notification:new', {
    timestamp: new Date().toISOString(),
    message: message,
  })
}

/**
 * Initialize all socket namespaces
 */
function initializeNamespaces(io) {
  // Initialize chat socket
  initializeChatSocket(io)
}

export default {
  initializeSocket,
  broadcastCategoryUpdate,
  broadcastCategoryChange,
  broadcastProductUpdate,
  broadcastProductStockUpdate,
  broadcastOrderUpdate,
  broadcastAnalyticsUpdate,
  broadcastLowStockAlert,
  broadcastToAdmins,
  trackUserActivity,
  sendNotification,
}
