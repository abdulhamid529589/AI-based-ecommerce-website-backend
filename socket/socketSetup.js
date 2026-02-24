import { Server } from 'socket.io'

/**
 * Initialize Socket.io for real-time updates
 * Supports:
 * - Category updates
 * - Product inventory sync
 * - Order notifications
 * - User activity tracking
 * - Dashboard analytics
 */
export const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: [
        'http://localhost:5173', // Dashboard
        'http://localhost:5174', // Frontend shop
        'http://localhost:3000', // Alternative frontend port
        process.env.FRONTEND_URL || '',
        process.env.DASHBOARD_URL || '',
      ].filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  })

  // Track connected clients by type
  const connectedClients = {
    dashboard: new Map(),
    frontend: new Map(),
  }

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] ✅ Client connected: ${socket.id}`)

    // Default to frontend if not specified
    let clientType = 'frontend'

    // Client identifies their type (dashboard or frontend)
    socket.on('client-type', (type) => {
      clientType = type === 'dashboard' ? 'dashboard' : 'frontend'
      connectedClients[clientType].set(socket.id, {
        socketId: socket.id,
        connectedAt: new Date(),
      })

      socket.join(clientType) // Join room based on type
      console.log(`[Socket.IO] 📍 Client ${socket.id} identified as: ${clientType}`)
      console.log(
        `[Socket.IO] 👥 Dashboard clients: ${connectedClients.dashboard.size}, Frontend clients: ${connectedClients.frontend.size}`,
      )
    })

    // Alternative identify event (for backwards compatibility)
    socket.on('identify', (data) => {
      clientType =
        data?.role === 'dashboard' || data?.type === 'dashboard' ? 'dashboard' : 'frontend'
      connectedClients[clientType].set(socket.id, {
        socketId: socket.id,
        connectedAt: new Date(),
        role: data?.role || clientType,
      })

      socket.join(clientType)
      console.log(
        `[Socket.IO] 📍 Client ${socket.id} identified as: ${clientType} (role: ${data?.role})`,
      )
      console.log(
        `[Socket.IO] 👥 Dashboard clients: ${connectedClients.dashboard.size}, Frontend clients: ${connectedClients.frontend.size}`,
      )
    })

    // When client disconnects
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] ❌ Client disconnected: ${socket.id}`)
      connectedClients.dashboard.delete(socket.id)
      connectedClients.frontend.delete(socket.id)
      const totalClients = connectedClients.dashboard.size + connectedClients.frontend.size
      console.log(`[Socket.IO] 👥 Total active connections: ${totalClients}`)
    })

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[Socket.IO] ⚠️ Error from ${socket.id}:`, error)
    })

    // Connection acknowledgement
    socket.emit('connection-success', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    })
  })

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
