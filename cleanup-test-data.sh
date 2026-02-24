#!/bin/bash
# Clean up test data from database

echo "🧹 Cleaning up test data from database..."
echo "================================================"

cd /home/abdulhamid/Documents/AI-based-ecommerce-website/server

# Check if PostgreSQL is running
if ! pg_isready > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running!"
    echo "Please start PostgreSQL service first."
    exit 1
fi

# Get database connection details from .env
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Source the .env file
export $(cat .env | grep -v '#' | xargs)

# Clean up test products (products with 'bedding' category or test names)
echo ""
echo "Removing test products..."
psql -U "$DB_USER" -d "$DB_NAME" -h "$DB_HOST" << EOF

-- Delete test products created during testing
DELETE FROM products WHERE LOWER(category) = 'bedding' AND name LIKE '%Test%';
DELETE FROM products WHERE LOWER(name) LIKE '%test%';
DELETE FROM products WHERE LOWER(description) LIKE '%test bedding%';

-- Show remaining products
SELECT COUNT(*) as remaining_products FROM products;
SELECT COUNT(*) as remaining_categories FROM categories;

EOF

echo ""
echo "✅ Test data cleanup complete!"
echo "================================================"
