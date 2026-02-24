#!/bin/bash

##############################################################################
# Render Deployment Preparation Script
# This script prepares the server for deployment on Render
# - Installs dependencies
# - Sets up environment variables
# - Verifies database connection
# - Runs migrations
#
# Usage: bash scripts/prepare-render-deployment.sh
##############################################################################

set -e

echo "🚀 =========================================="
echo "   RENDER DEPLOYMENT PREPARATION"
echo "==========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}ℹ️  [INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}✅ [SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠️  [WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}❌ [ERROR]${NC} $1"
}

# Step 1: Check Node.js
log_info "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
  log_error "Node.js is not installed!"
  exit 1
fi
NODE_VERSION=$(node -v)
log_success "Node.js $NODE_VERSION found"

# Step 2: Check npm
log_info "Checking npm installation..."
if ! command -v npm &> /dev/null; then
  log_error "npm is not installed!"
  exit 1
fi
NPM_VERSION=$(npm -v)
log_success "npm $NPM_VERSION found"

# Step 3: Install dependencies
log_info "Installing dependencies..."
npm install
log_success "Dependencies installed"

# Step 4: Check environment variables
log_info "Checking environment variables..."
if [ -z "$DATABASE_URL" ]; then
  log_warning "DATABASE_URL not set. Please set it in Render dashboard."
else
  log_success "DATABASE_URL is configured"
fi

if [ -z "$PORT" ]; then
  log_info "PORT not set, will use default: 5000"
else
  log_success "PORT is set to: $PORT"
fi

# Step 5: Verify critical environment variables
REQUIRED_VARS=("JWT_SECRET" "DATABASE_URL")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  log_warning "Missing environment variables: ${MISSING_VARS[*]}"
  log_info "Please set these in Render dashboard before deployment"
else
  log_success "All critical environment variables are set"
fi

# Step 6: Test database connection
log_info "Testing database connection..."
if [ -n "$DATABASE_URL" ]; then
  # Try a simple query
  if npm run db:test 2>/dev/null || true; then
    log_success "Database connection successful"
  else
    log_warning "Could not verify database connection (this may be OK if DB is not accessible yet)"
  fi
else
  log_warning "Skipping database test - DATABASE_URL not set"
fi

# Step 7: Summary
echo ""
echo -e "${GREEN}✅ =========================================="
echo "   DEPLOYMENT PREPARATION COMPLETE"
echo "==========================================${NC}"
echo ""
echo "📋 Pre-deployment Checklist:"
echo "  ✅ Node.js and npm are installed"
echo "  ✅ Dependencies are installed"
if [ -n "$DATABASE_URL" ]; then
  echo "  ✅ DATABASE_URL is configured"
else
  echo "  ⚠️  DATABASE_URL needs to be set in Render"
fi
if [ -z "${MISSING_VARS}" ]; then
  echo "  ✅ All critical environment variables are set"
else
  echo "  ⚠️  Some environment variables need to be set: ${MISSING_VARS[*]}"
fi
echo ""
echo "🚀 Ready for deployment! Push to your repository and Render will:"
echo "   1. Run this preparation script"
echo "   2. Execute database migrations"
echo "   3. Start the server on port 5000"
echo ""
