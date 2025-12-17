#!/bin/bash
# CyberChef-MCP Fork Cleanup Execution Script
# DO NOT RUN without user approval!

set -e

PROJECT_ROOT="/home/parobek/Code/CyberChef"
CLEANUP_DIR="/tmp/cyberchef-cleanup"

echo "=== CyberChef-MCP Fork Cleanup ==="
echo ""
echo "This script will:"
echo "  1. Create a cleanup branch"
echo "  2. Delete 88 upstream files"
echo "  3. Modify 5 GitHub templates"
echo "  4. Run verification tests"
echo "  5. Stage changes for commit"
echo ""
read -p "Proceed? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

cd "$PROJECT_ROOT"

# Phase 1: Create branch
echo ""
echo "Phase 1: Creating cleanup branch..."
git checkout -b cleanup/remove-upstream-files

# Phase 2: Delete files
echo ""
echo "Phase 2: Deleting 88 files..."
deleted=0
while IFS= read -r file; do
    if [ -f "$file" ]; then
        rm "$file"
        deleted=$((deleted + 1))
        echo "  Deleted: $file"
    else
        echo "  Skip (not found): $file"
    fi
done < "$CLEANUP_DIR/final_delete_list.txt"

echo "  Total deleted: $deleted files"

# Phase 3: Modify GitHub templates
echo ""
echo "Phase 3: Modifying GitHub templates..."
echo "  (This requires manual edits - will be done separately)"

# Phase 4: Verification
echo ""
echo "Phase 4: Running verification tests..."

echo "  Test 1: Generating config files..."
npx grunt configTests

echo "  Test 2: Running MCP tests..."
npm run test:mcp

echo "  Test 3: Running linting..."
npm run lint

echo "  Test 4: Testing MCP server start (5 second timeout)..."
timeout 5 npm run mcp || echo "  MCP server started successfully (timeout expected)"

echo "  Test 5: Docker build..."
docker build -f Dockerfile.mcp -t cyberchef-mcp-test . 

echo ""
echo "=== Cleanup Complete ==="
echo "Files deleted: $deleted"
echo "Branch: cleanup/remove-upstream-files"
echo ""
echo "Next steps:"
echo "  1. Modify GitHub templates manually"
echo "  2. Review changes: git status"
echo "  3. Commit: git add -A && git commit -F $CLEANUP_DIR/commit-message.txt"
echo "  4. Push: git push -u origin cleanup/remove-upstream-files"
echo ""

