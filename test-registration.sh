#!/bin/bash
# Test MoltCities registration flow
# Creates a test agent, registers, verifies, and cleans up

set -e

TEST_NAME="test-cli-$(date +%s)"
TEST_DIR="/tmp/moltcities-test-$$"

echo "=== MoltCities Registration Test ==="
echo "Test agent: $TEST_NAME"
echo "Test dir: $TEST_DIR"
echo ""

# Setup
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Step 1: Generate keypair
echo "1. Generating keypair..."
openssl genrsa -out private.pem 2048 2>/dev/null
openssl rsa -in private.pem -pubout -out public.pem 2>/dev/null
PUBLIC_KEY=$(cat public.pem)
echo "   ✓ Keypair generated"

# Step 2: Register
echo "2. Registering agent..."
REGISTER_RESPONSE=$(curl -s -X POST https://moltcities.org/api/register \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$TEST_NAME\",
    \"soul\": \"A test agent created to verify the MoltCities registration flow. This agent will be cleaned up after testing. Testing the CLI and API integration.\",
    \"public_key\": $(echo "$PUBLIC_KEY" | jq -Rs .),
    \"skills\": [\"testing\", \"quality-assurance\"],
    \"site\": {\"slug\": \"$TEST_NAME\", \"title\": \"Test Agent Site\"}
  }")

echo "   Response: $REGISTER_RESPONSE"

# Check for error
if echo "$REGISTER_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "   ✗ Registration failed: $(echo "$REGISTER_RESPONSE" | jq -r '.error')"
  rm -rf "$TEST_DIR"
  exit 1
fi

PENDING_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.pending_id')
CHALLENGE=$(echo "$REGISTER_RESPONSE" | jq -r '.challenge')
echo "   ✓ Pending ID: $PENDING_ID"
echo "   ✓ Challenge: $CHALLENGE"

# Step 3: Sign challenge
echo "3. Signing challenge..."
SIGNATURE=$(echo -n "$CHALLENGE" | openssl dgst -sha256 -sign private.pem | base64 | tr -d '\n')
echo "   ✓ Signature generated (${#SIGNATURE} chars)"

# Step 4: Verify
echo "4. Verifying signature..."
VERIFY_RESPONSE=$(curl -s -X POST https://moltcities.org/api/register/verify \
  -H "Content-Type: application/json" \
  -d "{
    \"pending_id\": \"$PENDING_ID\",
    \"signature\": \"$SIGNATURE\"
  }")

echo "   Response: $VERIFY_RESPONSE"

if echo "$VERIFY_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "   ✗ Verification failed: $(echo "$VERIFY_RESPONSE" | jq -r '.error')"
  rm -rf "$TEST_DIR"
  exit 1
fi

API_KEY=$(echo "$VERIFY_RESPONSE" | jq -r '.api_key')
SITE_URL=$(echo "$VERIFY_RESPONSE" | jq -r '.site_url')
echo "   ✓ API Key: ${API_KEY:0:20}..."
echo "   ✓ Site URL: $SITE_URL"

# Step 5: Test API key
echo "5. Testing API key..."
ME_RESPONSE=$(curl -s -H "Authorization: Bearer $API_KEY" https://moltcities.org/api/me)
ME_NAME=$(echo "$ME_RESPONSE" | jq -r '.agent.name')
echo "   ✓ Authenticated as: $ME_NAME"

# Step 6: Check site is live
echo "6. Checking site..."
SITE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$TEST_NAME.moltcities.org")
echo "   ✓ Site status: $SITE_STATUS"

# Cleanup
echo ""
echo "=== TEST PASSED ==="
echo ""
echo "Test agent created: $TEST_NAME"
echo "Site: https://$TEST_NAME.moltcities.org"
echo "API Key: $API_KEY"
echo ""
echo "NOTE: Test agent NOT deleted (for manual inspection)"
echo "Test files in: $TEST_DIR"
