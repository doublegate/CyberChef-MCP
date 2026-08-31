#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# 08 -- Driving the server from a shell, with no MCP client at all.
#
# The stdio transport is line-delimited JSON-RPC on stdin/stdout, so `echo | node | jq` is a
# complete client. Useful for debugging, for shell pipelines, and for checking a container image
# before wiring it into anything.
#
# Requires: jq. Run from the repository root, or via `node examples/...` after `npx grunt configTests`.

set -euo pipefail

cd "$(dirname "$0")/.."
SERVER="src/node/mcp-server.mjs"
NODE_ARGS=(--openssl-legacy-provider "$SERVER")

command -v jq >/dev/null || { echo "this example needs jq on PATH" >&2; exit 2; }

# The server writes diagnostics to STDERR and only JSON-RPC to stdout -- fixed in v2.1.0, where
# pino was defaulting to fd 1 and interleaving log lines with protocol messages. That separation
# is what makes `2>/dev/null` safe here.
say() { printf '\n== %s\n' "$*"; }

say "How many tools are there?"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | node "${NODE_ARGS[@]}" 2>/dev/null \
  | jq -r 'select(.result.tools) | "  \(.result.tools | length) tools"'

say "Encode a string"
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cyberchef_to_base64","arguments":{"input":"from the shell"}}}' \
  | node "${NODE_ARGS[@]}" 2>/dev/null \
  | jq -r 'select(.result) | "  \(.result.content[0].text)"'

say "Run a multi-step recipe"
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"cyberchef_bake","arguments":{"input":"pipeline","recipe":[{"op":"To Hex","args":{"delimiter":"None"}},{"op":"To Upper case"}]}}}' \
  | node "${NODE_ARGS[@]}" 2>/dev/null \
  | jq -r 'select(.result) | "  \(.result.content[0].text)"'

say "Read one tool's argument schema"
echo '{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{}}' \
  | node "${NODE_ARGS[@]}" 2>/dev/null \
  | jq -r 'select(.result.tools)
           | .result.tools[]
           | select(.name == "cyberchef_aes_encrypt")
           | "  cyberchef_aes_encrypt takes: \(.inputSchema.properties | keys | join(", "))"'

say "Two calls down one pipe"
# Requests are line-delimited, so several can be sent at once and answered in order.
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"cyberchef_md5","arguments":{"input":"one"}}}' \
  '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"cyberchef_md5","arguments":{"input":"two"}}}' \
  | node "${NODE_ARGS[@]}" 2>/dev/null \
  | jq -r 'select(.result) | "  id=\(.id) -> \(.result.content[0].text)"'

say "The same thing against the published container"
cat <<'DOCKER'
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
    | docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest \
    | jq '.result.tools | length'

  # The -i flag is REQUIRED: without it the container has no stdin and exits immediately.
DOCKER

printf '\nShell examples complete.\n'
