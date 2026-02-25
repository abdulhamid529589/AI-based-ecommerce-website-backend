/**
 * Enhanced Logging Utility
 * Provides structured logging with levels, timestamps, and context
 * Useful for debugging Socket.io, API, and system issues
 */

const LogLevels = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  TRACE: 'TRACE',
}

const Colors = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m', // Yellow
  INFO: '\x1b[36m', // Cyan
  DEBUG: '\x1b[35m', // Magenta
  TRACE: '\x1b[90m', // Gray
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
}

class Logger {
  constructor(module = 'App', level = 'INFO') {
    this.module = module
    this.level = level
    this.levels = Object.keys(LogLevels)
  }

  /**
   * Format log message with timestamp and context
   */
  formatMessage(logLevel, message, context = {}) {
    const timestamp = new Date().toISOString()
    const color = Colors[logLevel] || Colors.INFO
    const contextStr = Object.keys(context).length > 0 ? JSON.stringify(context) : ''

    return `${color}[${timestamp}] [${this.module}:${logLevel}]${Colors.RESET} ${message}${contextStr ? ' ' + contextStr : ''}`
  }

  /**
   * Check if log level should be shown
   */
  shouldLog(logLevel) {
    const currentIndex = this.levels.indexOf(this.level)
    const messageIndex = this.levels.indexOf(logLevel)
    return messageIndex <= currentIndex
  }

  /**
   * Error logging
   */
  error(message, error = null, context = {}) {
    if (!this.shouldLog('ERROR')) return

    let fullMessage = message
    if (error) {
      fullMessage += ` | ${error.message}`
      if (error.stack) context.stack = error.stack.split('\n').slice(0, 3)
    }

    console.error(this.formatMessage('ERROR', fullMessage, context))
  }

  /**
   * Warning logging
   */
  warn(message, context = {}) {
    if (!this.shouldLog('WARN')) return
    console.warn(this.formatMessage('WARN', message, context))
  }

  /**
   * Info logging
   */
  info(message, context = {}) {
    if (!this.shouldLog('INFO')) return
    console.log(this.formatMessage('INFO', message, context))
  }

  /**
   * Debug logging
   */
  debug(message, context = {}) {
    if (!this.shouldLog('DEBUG')) return
    console.log(this.formatMessage('DEBUG', message, context))
  }

  /**
   * Trace logging for detailed debugging
   */
  trace(message, context = {}) {
    if (!this.shouldLog('TRACE')) return
    console.log(this.formatMessage('TRACE', message, context))
  }

  /**
   * Log Socket.io connection events
   */
  socketConnect(socketId, clientType = 'unknown', remoteAddress = '') {
    this.info(`🔌 Socket connected`, {
      socketId,
      clientType,
      remoteAddress,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log Socket.io disconnection events
   */
  socketDisconnect(socketId, reason, clientType = 'unknown') {
    this.info(`🔴 Socket disconnected`, {
      socketId,
      reason,
      clientType,
    })
  }

  /**
   * Log Socket.io errors
   */
  socketError(socketId, event, error, context = {}) {
    this.error(`❌ Socket error on event: ${event}`, error, {
      socketId,
      ...context,
    })
  }

  /**
   * Log API requests
   */
  apiRequest(method, path, statusCode, duration, userId = null) {
    const statusColor =
      statusCode >= 400 ? Colors.ERROR : statusCode >= 300 ? Colors.WARN : Colors.INFO

    console.log(
      `${statusColor}[API] ${method} ${path} → ${statusCode} (${duration}ms)${Colors.RESET}${userId ? ` [User: ${userId}]` : ''}`,
    )
  }

  /**
   * Log database operations
   */
  dbOperation(operation, table, status, duration, context = {}) {
    const color = status === 'success' ? Colors.INFO : Colors.ERROR
    console.log(
      `${color}[DB] ${operation} ${table} → ${status} (${duration}ms)${Colors.RESET}`,
      Object.keys(context).length > 0 ? context : '',
    )
  }

  /**
   * Log authentication events
   */
  auth(action, userId, status, context = {}) {
    const icon = status === 'success' ? '✅' : '❌'
    this.info(`${icon} Auth: ${action}`, {
      userId,
      status,
      ...context,
    })
  }

  /**
   * Log business operations with performance
   */
  operation(name, status, duration, context = {}) {
    const icon = status === 'success' ? '✅' : '❌'
    const level = status === 'success' ? 'INFO' : 'ERROR'
    this.levels.includes(level) &&
      console.log(this.formatMessage(level, `${icon} ${name} → ${status} (${duration}ms)`, context))
  }
}

/**
 * Create logger instances for different modules
 */
export const createLogger = (moduleName) => {
  const logLevel = process.env.LOG_LEVEL || 'INFO'
  return new Logger(moduleName, logLevel)
}

export default Logger
