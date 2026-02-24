#!/bin/bash

# File Cleanup Tests Runner
# Runs comprehensive tests for the file cleanup implementation

echo "╔════════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                                ║"
echo "║                      FILE CLEANUP TEST SUITE RUNNER                           ║"
echo "║                                                                                ║"
echo "║                    Testing Automatic Temporary File Cleanup                   ║"
echo "║                                                                                ║"
echo "╚════════════════════════════════════════════════════════════════════════════════╝"

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════════"
echo "PHASE 16: FILE CLEANUP TESTS"
echo "═══════════════════════════════════════════════════════════════════════════════════"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Jest is installed
if ! command -v jest &> /dev/null && ! npx jest --version &> /dev/null; then
    echo -e "${RED}❌ Jest is not installed${NC}"
    echo "Install it with: npm install --save-dev jest"
    exit 1
fi

echo -e "${BLUE}📋 Test Categories:${NC}"
echo "   1. Unit Tests - File cleanup utility functions"
echo "   2. Integration Tests - API endpoints with cleanup"
echo "   3. Performance Tests - Disk space & accumulation"
echo "   4. Error Handling Tests - Graceful failures"
echo "   5. Logging Tests - Output verification"
echo ""

# Run tests
echo -e "${YELLOW}▶ Running File Cleanup Tests...${NC}"
echo ""

npm test -- --testPathPattern="file-cleanup.test.js" --verbose 2>&1

TEST_RESULT=$?

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════════"

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    echo ""
    echo "Test Summary:"
    echo "  ✅ Unit Tests (deleteTempFile, deleteTempFiles, cleanupUploadsDirectory)"
    echo "  ✅ API Integration (Upload endpoints with cleanup)"
    echo "  ✅ Performance (No file accumulation)"
    echo "  ✅ Error Handling (Graceful degradation)"
    echo "  ✅ Logging (Proper output)"
    echo ""
    echo -e "${GREEN}🎉 File Cleanup Implementation is PRODUCTION READY${NC}"
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review the error messages above and fix issues."
fi

echo "═══════════════════════════════════════════════════════════════════════════════════"
echo ""

exit $TEST_RESULT
