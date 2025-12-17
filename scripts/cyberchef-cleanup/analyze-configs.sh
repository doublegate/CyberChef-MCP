#!/bin/bash

OUTPUT_DIR="/tmp/cyberchef-cleanup"
PROJECT_ROOT="/home/parobek/Code/CyberChef"

echo "=== DETAILED CONFIG FILE ANALYSIS ==="
echo ""

# Check if cspell is used
echo "1. .cspell.json - Spell checking config"
echo "   Used in package.json: $(grep -c cspell "$PROJECT_ROOT/package.json")"
echo "   Decision: KEEP (used for linting)"
echo ""

# Check if editorconfig is used
echo "2. .editorconfig - Editor configuration"
echo "   Standard editor config file"
echo "   Decision: KEEP (useful for consistent formatting)"
echo ""

# Check if nightwatch is used
echo "3. nightwatch.json - UI testing framework"
echo "   Used in package.json: $(grep -c nightwatch "$PROJECT_ROOT/package.json")"
echo "   Used for: Web UI testing only"
echo "   Decision: DELETE (not needed for MCP)"
echo ""

# Check if .npmignore is used
echo "4. .npmignore - NPM publish ignore list"
echo "   Used when publishing to npm"
echo "   Decision: KEEP (useful if publishing MCP server to npm)"
echo ""

# Check if postcss is used
echo "5. postcss.config.js - CSS processing"
echo "   Used in package.json: $(grep -c postcss "$PROJECT_ROOT/package.json")"
echo "   Used for: Web builds only (CSS)"
echo "   Decision: DELETE (not needed for MCP)"
echo ""

echo "=== GITHUB TEMPLATES ANALYSIS ==="
echo ""

echo "1. .github/CONTRIBUTING.md"
echo "   Standard upstream contribution guide"
echo "   Decision: MODIFY (update for CyberChef-MCP project)"
echo ""

echo "2. .github/ISSUE_TEMPLATE/* (4 files)"
echo "   Upstream issue templates"
echo "   Decision: MODIFY (update for CyberChef-MCP project)"
echo ""

# Create final deletion list
echo "./.devcontainer/devcontainer.json" > "$OUTPUT_DIR/final_delete_list.txt"
cat "$OUTPUT_DIR/deletable_web.txt" >> "$OUTPUT_DIR/final_delete_list.txt"
cat "$OUTPUT_DIR/deletable_browser_tests.txt" >> "$OUTPUT_DIR/final_delete_list.txt"
echo "./nightwatch.json" >> "$OUTPUT_DIR/final_delete_list.txt"
echo "./postcss.config.js" >> "$OUTPUT_DIR/final_delete_list.txt"

# Create modification list
cat > "$OUTPUT_DIR/files_to_modify.txt" << 'MODLIST'
./.github/CONTRIBUTING.md
./.github/ISSUE_TEMPLATE/bug-report.md
./.github/ISSUE_TEMPLATE/feature-request.md
./.github/ISSUE_TEMPLATE.md
./.github/ISSUE_TEMPLATE/operation-request.md
MODLIST

echo "=== FINAL SUMMARY ==="
echo "Files to DELETE: $(wc -l < "$OUTPUT_DIR/final_delete_list.txt")"
echo "Files to MODIFY: $(wc -l < "$OUTPUT_DIR/files_to_modify.txt")"
echo "Files to KEEP unchanged: .cspell.json, .editorconfig, .npmignore, LICENSE, CODE_OF_CONDUCT.md, eslint.config.mjs, .gitattributes"
echo ""

