import { createUserTable } from '../models/userTable.js'
import { createOrderItemTable } from '../models/orderItemsTable.js'
import { createOrdersTable } from '../models/ordersTable.js'
import { createPaymentsTable } from '../models/paymentsTable.js'
import { createProductReviewsTable } from '../models/productReviewsTable.js'
import { createProductsTable } from '../models/productTable.js'
import { createShippingInfoTable } from '../models/shippinginfoTable.js'
import {
  createSettingsTable,
  createHeroSlidesTable,
  createFeaturedProductsTable,
} from '../models/settingsTable.js'
import createAuditLogsTable from '../models/auditLogsTable.js'

export const createTables = async () => {
  try {
    await createUserTable()
    await createProductsTable()
    await createProductReviewsTable()
    await createOrdersTable()
    await createOrderItemTable()
    await createShippingInfoTable()
    await createPaymentsTable()
    await createSettingsTable()
    await createHeroSlidesTable()
    await createFeaturedProductsTable()
    // 🔒 Create audit logs table for security monitoring
    await createAuditLogsTable()
    console.log('All Tables Created Successfully.')
  } catch (error) {
    console.error('Error creating tables:', error)
  }
}
