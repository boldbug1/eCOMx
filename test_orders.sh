#!/usr/bin/env bash
#
# test_orders.sh — edge case tests for POST /orders (and a cache sanity check)
#
# Usage:
#   1. export TOKEN="your-jwt-here"   (get this from POST /login)
#   2. ./test_orders.sh
#
# Requires: curl, jq (for pretty output / extracting fields)
#   Install jq if missing: sudo dnf install jq   (Fedora)

set -uo pipefail

BASE_URL="http://localhost:3000/api/v1"

if [ -z "${TOKEN:-}" ]; then
  echo "ERROR: TOKEN env var not set. Run: export TOKEN=\"your-jwt\""
  exit 1
fi

# ---- Known seeded product IDs (from your product-creation run) ----
MOUSE="bd55e604-4b50-4fdc-bb30-35e1cd46f733"      # stock 50
KEYBOARD="cf186b11-4890-47d6-ab1b-5816b6950952"   # stock 30
USB_HUB="dcf8833e-3a71-420f-a58e-6252574b7de3"    # stock 40
LAPTOP_STAND="b6ebb037-32f4-4aca-b2d8-434250340d34" # stock 25
WEBCAM="b30920c2-f81b-4f7d-83b2-411b8de714d8"     # stock 15 (deliberately low, good for overselling test)

FAKE_ID="00000000-0000-0000-0000-000000000000"    # valid UUID shape, doesn't exist

PASS=0
FAIL=0

# ---- helper: run a curl POST /orders and check the expected status code ----
run_test() {
  local name="$1"
  local body="$2"
  local expected_status="$3"
  local extra_headers="${4:-}" # optional, e.g. "no-auth" to skip token

  local auth_header="Authorization: Bearer $TOKEN"
  if [ "$extra_headers" = "no-auth" ]; then
    auth_header=""
  fi

  local response
  local status

  if [ -n "$auth_header" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/orders" \
      -H "Content-Type: application/json" \
      -H "$auth_header" \
      -d "$body")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/orders" \
      -H "Content-Type: application/json" \
      -d "$body")
  fi

  status=$(echo "$response" | tail -n1)
  body_out=$(echo "$response" | sed '$d')

  if [ "$status" = "$expected_status" ]; then
    echo "✅ PASS — $name (expected $expected_status, got $status)"
    PASS=$((PASS+1))
  else
    echo "❌ FAIL — $name (expected $expected_status, got $status)"
    echo "   Response: $body_out"
    FAIL=$((FAIL+1))
  fi
}

echo "=============================================="
echo " Order edge case tests"
echo "=============================================="

# 1. Happy path — valid order, enough stock
run_test "Valid order, sufficient stock" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$MOUSE\",\"quantity\":2},{\"productId\":\"$USB_HUB\",\"quantity\":1}]}" \
  "201"

# 2. Nonexistent product (well-formed UUID, doesn't exist in DB)
run_test "Nonexistent product ID" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$FAKE_ID\",\"quantity\":1}]}" \
  "400"

# 3. Partial — one real product, one fake product in same order
run_test "Partial — one real, one fake product" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$MOUSE\",\"quantity\":1},{\"productId\":\"$FAKE_ID\",\"quantity\":1}]}" \
  "400"

# 4. Quantity exceeds available stock (webcam only has 15)
run_test "Quantity exceeds stock" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$WEBCAM\",\"quantity\":9999}]}" \
  "400"

# 5. Empty items array — should fail Zod's .min(1)
run_test "Empty items array" \
  "{\"customerName\":\"Test Customer\",\"items\":[]}" \
  "400"

# 6. Missing customerName — should fail Zod validation
run_test "Missing customerName" \
  "{\"items\":[{\"productId\":\"$MOUSE\",\"quantity\":1}]}" \
  "400"

# 7. Zero quantity — should fail Zod's .positive()
run_test "Zero quantity" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$MOUSE\",\"quantity\":0}]}" \
  "400"

# 8. Negative quantity — should fail Zod's .positive()
run_test "Negative quantity" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$MOUSE\",\"quantity\":-5}]}" \
  "400"

# 9. Malformed productId (not a valid string/UUID shape, e.g. a number)
run_test "Malformed productId (wrong type)" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":123,\"quantity\":1}]}" \
  "400"

# 10. No auth token at all — should 401
run_test "No auth token" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$MOUSE\",\"quantity\":1}]}" \
  "401" \
  "no-auth"

# 11. Duplicate product in same order (same productId twice — worth knowing how your API handles this)
run_test "Duplicate product in same order" \
  "{\"customerName\":\"Test Customer\",\"items\":[{\"productId\":\"$KEYBOARD\",\"quantity\":1},{\"productId\":\"$KEYBOARD\",\"quantity\":1}]}" \
  "201"

echo ""
echo "=============================================="
echo " Cache invalidation sanity check"
echo "=============================================="
echo "Fetching Laptop Stand stock BEFORE order..."
BEFORE=$(curl -s "$BASE_URL/products/$LAPTOP_STAND" | jq -r '.product.stock')
echo "Stock before: $BEFORE"

echo "Placing order for 3x Laptop Stand..."
curl -s -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"customerName\":\"Cache Test\",\"items\":[{\"productId\":\"$LAPTOP_STAND\",\"quantity\":3}]}" > /dev/null

echo "Fetching Laptop Stand stock AFTER order (should be immediately updated, not stale)..."
AFTER=$(curl -s "$BASE_URL/products/$LAPTOP_STAND" | jq -r '.product.stock')
echo "Stock after: $AFTER"

EXPECTED=$((BEFORE - 3))
if [ "$AFTER" = "$EXPECTED" ]; then
  echo "✅ PASS — cache correctly invalidated, stock reflects decrement immediately"
  PASS=$((PASS+1))
else
  echo "❌ FAIL — expected stock $EXPECTED, got $AFTER (cache may be stale, or order failed)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=============================================="
echo " Results: $PASS passed, $FAIL failed"
echo "=============================================="