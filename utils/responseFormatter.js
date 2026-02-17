/**
 * Response Formatter Utilities
 * Standardizes response formats across different endpoints
 */

export const formatOrdersResponse = (data) => {
  // Normalize response format for orders
  return {
    success: true,
    orders: data.orders || data.myOrders || [],
    totalOrders: data.totalOrders || data.total || 0,
    currentPage: data.currentPage || data.page || 1,
  }
}

export const formatCustomersResponse = (data) => {
  // Normalize response format for customers (users)
  return {
    success: true,
    customers: data.users || data.customers || [],
    totalCustomers: data.totalUsers || data.totalCustomers || 0,
    currentPage: data.currentPage || data.page || 1,
  }
}

export const formatDashboardStatsResponse = (data) => {
  // Format dashboard stats response
  if (!data) {
    return {
      success: true,
      revenue: { total: 0, trend: 0, lastMonth: 0 },
      orders: { total: 0, pending: 0, trend: 0 },
      customers: { total: 0, newThisMonth: 0, trend: 0 },
      conversionRate: { rate: 0, trend: 0 },
      recentOrders: [],
      topProducts: [],
    }
  }

  // Calculate order counts from order status counts
  const orderStatusCounts = data.orderStatusCounts || {}
  const totalOrders = Object.values(orderStatusCounts).reduce((a, b) => a + b, 0)
  const pendingOrders = orderStatusCounts['Processing'] || 0

  return {
    success: true,
    revenue: {
      total: data.totalRevenueAllTime || 0,
      trend: data.revenueGrowth || 0,
      lastMonth: data.currentMonthSales || 0,
    },
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      trend: data.orderTrend || 0,
    },
    customers: {
      total: data.totalUsers || 0,
      newThisMonth: data.newUsersThisMonth || 0,
      trend: data.customerTrend || 0,
    },
    conversionRate: {
      rate: data.conversionRate || 0,
      trend: data.conversionTrend || 0,
    },
    recentOrders: data.recentOrders || [],
    topProducts: data.topSellingProducts || [],
  }
}

export const formatAnalyticsResponse = (data) => {
  return {
    success: true,
    data: data || [],
  }
}
