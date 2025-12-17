#!/bin/bash

OUTPUT_DIR="/tmp/cyberchef-cleanup"

echo "=== ANALYZING IDENTICAL FILES FOR SAFE DELETION ==="
echo ""

# Category 1: src/web (not needed for MCP)
echo "Category 1: src/web/ directory (NOT needed for MCP)"
grep "^./src/web/" "$OUTPUT_DIR/identical_files.txt" > "$OUTPUT_DIR/deletable_web.txt"
echo "  Files: $(wc -l < "$OUTPUT_DIR/deletable_web.txt")"
echo ""

# Category 2: .devcontainer (not used for MCP development)
echo "Category 2: .devcontainer/ (NOT used for MCP development)"
grep "^./.devcontainer/" "$OUTPUT_DIR/identical_files.txt" > "$OUTPUT_DIR/deletable_devcontainer.txt"
echo "  Files: $(wc -l < "$OUTPUT_DIR/deletable_devcontainer.txt")"
echo ""

# Category 3: Browser/UI tests (not needed for MCP)
echo "Category 3: Browser/UI tests (NOT needed for MCP)"
grep "^./tests/browser/" "$OUTPUT_DIR/identical_files.txt" > "$OUTPUT_DIR/deletable_browser_tests.txt" 2>/dev/null || touch "$OUTPUT_DIR/deletable_browser_tests.txt"
echo "  Files: $(wc -l < "$OUTPUT_DIR/deletable_browser_tests.txt")"
echo ""

# Category 4: Config files that might be removable
echo "Category 4: Config files to review"
grep -E "^./(nightwatch|postcss|.cspell|.editorconfig|.npmignore)" "$OUTPUT_DIR/identical_files.txt" > "$OUTPUT_DIR/reviewable_configs.txt"
echo "  Files: $(wc -l < "$OUTPUT_DIR/reviewable_configs.txt")"
cat "$OUTPUT_DIR/reviewable_configs.txt"
echo ""

# Category 5: GitHub templates (might be removable or modifiable)
echo "Category 5: GitHub templates to review"
grep "^./.github/" "$OUTPUT_DIR/identical_files.txt" > "$OUTPUT_DIR/reviewable_github.txt"
echo "  Files: $(wc -l < "$OUTPUT_DIR/reviewable_github.txt")"
cat "$OUTPUT_DIR/reviewable_github.txt"
echo ""

# Category 6: Core files (KEEP - needed for operations)
echo "Category 6: Core files (KEEP - needed)"
grep "^./src/core/" "$OUTPUT_DIR/identical_files.txt" | wc -l
echo ""

# Category 7: Tests to keep (operation tests)
echo "Category 7: Test files (KEEP - needed for operation validation)"
grep "^./tests/operations/" "$OUTPUT_DIR/identical_files.txt" | wc -l
grep "^./tests/node/" "$OUTPUT_DIR/identical_files.txt" | wc -l
echo ""

# Combine all definitely deletable files
cat "$OUTPUT_DIR/deletable_web.txt" \
    "$OUTPUT_DIR/deletable_devcontainer.txt" \
    "$OUTPUT_DIR/deletable_browser_tests.txt" \
    > "$OUTPUT_DIR/safe_to_delete.txt"

echo "=== SUMMARY ==="
echo "Safe to delete: $(wc -l < "$OUTPUT_DIR/safe_to_delete.txt")"
echo "Needs review: $(cat "$OUTPUT_DIR/reviewable_configs.txt" "$OUTPUT_DIR/reviewable_github.txt" | wc -l)"
echo "Keep (core + tests): $(grep -E "^./src/core/|^./tests/operations/|^./tests/node/" "$OUTPUT_DIR/identical_files.txt" | wc -l)"
echo ""
echo "Files saved to $OUTPUT_DIR/"
