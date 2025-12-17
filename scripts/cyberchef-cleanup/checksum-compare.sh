#!/bin/bash

PROJECT_ROOT="/home/parobek/Code/CyberChef"
UPSTREAM_ROOT="/home/parobek/Code/CyberChef/ref-proj/CyberChef"
OUTPUT_DIR="/tmp/cyberchef-cleanup"

mkdir -p "$OUTPUT_DIR"

echo "Generating file checksums..."

# Find all files in project (excluding specific directories)
cd "$PROJECT_ROOT"
find . -type f \
  -not -path "./ref-proj/*" \
  -not -path "./node_modules/*" \
  -not -path "./build/*" \
  -not -path "./.git/*" \
  -not -path "./coverage/*" \
  -not -path "./test-results/*" \
  -not -path "./.claude/*" \
  -not -path "./benchmarks/*" \
  | sort > "$OUTPUT_DIR/project_files.txt"

echo "Found $(wc -l < "$OUTPUT_DIR/project_files.txt") files in project"

# Generate checksums for project files
> "$OUTPUT_DIR/project_checksums.txt"
while IFS= read -r file; do
  if [ -f "$file" ]; then
    md5sum "$file" >> "$OUTPUT_DIR/project_checksums.txt" 2>/dev/null
  fi
done < "$OUTPUT_DIR/project_files.txt"

# For each project file, check if it exists in upstream and compare checksums
echo "Comparing with upstream..."
> "$OUTPUT_DIR/identical_files.txt"
> "$OUTPUT_DIR/modified_files.txt"
> "$OUTPUT_DIR/new_files.txt"

while IFS= read -r file; do
  upstream_file="$UPSTREAM_ROOT/$file"
  
  if [ -f "$upstream_file" ]; then
    # File exists in both, compare checksums
    project_sum=$(md5sum "$PROJECT_ROOT/$file" 2>/dev/null | awk '{print $1}')
    upstream_sum=$(md5sum "$upstream_file" 2>/dev/null | awk '{print $1}')
    
    if [ "$project_sum" = "$upstream_sum" ]; then
      echo "$file" >> "$OUTPUT_DIR/identical_files.txt"
    else
      echo "$file" >> "$OUTPUT_DIR/modified_files.txt"
    fi
  else
    # File only exists in project
    echo "$file" >> "$OUTPUT_DIR/new_files.txt"
  fi
done < "$OUTPUT_DIR/project_files.txt"

echo ""
echo "=== SUMMARY ==="
echo "Identical files: $(wc -l < "$OUTPUT_DIR/identical_files.txt" 2>/dev/null || echo 0)"
echo "Modified files: $(wc -l < "$OUTPUT_DIR/modified_files.txt" 2>/dev/null || echo 0)"
echo "New files: $(wc -l < "$OUTPUT_DIR/new_files.txt" 2>/dev/null || echo 0)"
echo ""
echo "Results saved to $OUTPUT_DIR/"
