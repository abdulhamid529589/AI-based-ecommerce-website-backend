#!/bin/bash

# Comprehensive Test Suite Runner for All Phases
# Tests phases 2-8 to verify no regressions and all features working

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════╗"
echo "║                    🧪 COMPREHENSIVE TEST SUITE RUNNER                         ║"
echo "║                   Testing All Phases (2-8) for Regressions                     ║"
echo "╚════════════════════════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")" || exit 1

# Array to store results
declare -a PHASE_RESULTS
declare -a PHASE_TIMES

PHASES=("phase2" "phase3" "phase4" "phase5" "phase6" "phase7" "phase8")
TOTAL_PHASES=${#PHASES[@]}
PASSED=0
FAILED=0

echo "Starting test run at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run each phase
for i in "${!PHASES[@]}"; do
  PHASE="${PHASES[$i]}"
  PHASE_NUM=$((i + 2))

  echo "🔍 Phase $PHASE_NUM ($PHASE)..."
  echo "   ⏱️  Testing..."

  START_TIME=$(date +%s%N)

  # Run test and capture output
  if OUTPUT=$(timeout 45 npm test -- "$PHASE.test.js" 2>&1); then
    END_TIME=$(date +%s%N)
    ELAPSED=$((($END_TIME - $START_TIME) / 1000000))
    ELAPSED_SEC=$(echo "scale=2; $ELAPSED / 1000" | bc)

    # Check if tests passed
    if echo "$OUTPUT" | grep -q "Test Suites: 1 passed"; then
      TEST_COUNT=$(echo "$OUTPUT" | grep "Tests:" | grep -oP '\d+(?= passed)')
      echo "   ✅ PASSED - $TEST_COUNT tests passed in ${ELAPSED_SEC}ms"
      PHASE_RESULTS[$i]="✅ PASS"
      ((PASSED++))
    elif echo "$OUTPUT" | grep -q "PASS"; then
      TEST_COUNT=$(echo "$OUTPUT" | grep "Tests:" | grep -oP '\d+(?= passed)' | head -1)
      echo "   ✅ PASSED - $TEST_COUNT tests passed in ${ELAPSED_SEC}ms"
      PHASE_RESULTS[$i]="✅ PASS"
      ((PASSED++))
    else
      echo "   ❌ FAILED - Check logs for details"
      PHASE_RESULTS[$i]="❌ FAIL"
      ((FAILED++))
    fi

    PHASE_TIMES[$i]="${ELAPSED_SEC}ms"
  else
    echo "   ❌ FAILED - Test timeout or error"
    PHASE_RESULTS[$i]="❌ FAIL"
    ((FAILED++))
    PHASE_TIMES[$i]="TIMEOUT"
  fi

  echo ""
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for i in "${!PHASES[@]}"; do
  PHASE="${PHASES[$i]}"
  PHASE_NUM=$((i + 2))
  echo "  Phase $PHASE_NUM: ${PHASE_RESULTS[$i]} (${PHASE_TIMES[$i]})"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Overall Results:"
echo "  ✅ Passed: $PASSED/$TOTAL_PHASES"
echo "  ❌ Failed: $FAILED/$TOTAL_PHASES"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════════════════════════╗"
  echo "║                         ✨ ALL TESTS PASSING ✨                               ║"
  echo "║                                                                                ║"
  echo "║  🎉 No regressions detected - All phases working correctly!                   ║"
  echo "╚════════════════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 0
else
  echo ""
  echo "╔════════════════════════════════════════════════════════════════════════════════╗"
  echo "║                      ⚠️  SOME TESTS FAILED ⚠️                                  ║"
  echo "║                                                                                ║"
  echo "║  Please review the failing phases and fix any regressions.                    ║"
  echo "╚════════════════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi
