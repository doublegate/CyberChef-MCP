#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# 08 -- Driving the server from a shell, with no MCP client at all.
#
# The stdio transport is line-delimited JSON-RPC on stdin/stdout, so `printf | node | jq` is a
# complete client. Useful for debugging, for shell pipelines, and for checking a container image
# before wiring it into anything.
#
# Requires: jq. Run from the repository root, after `npm install && npx grunt configTests`.

set -euo pipefail

cd "$(dirname "$0")/.."
SERVER="src/node/mcp-server.mjs"
# Matches `npm run mcp` and the Docker image. A few operations reach algorithms OpenSSL 3 moved out
# of its default provider; without this, `Generate all hashes` returns its input unchanged.
NODE_ARGS=(--openssl-legacy-provider "$SERVER")

command -v jq >/dev/null || { echo "this example needs jq on PATH" >&2; exit 2; }

# The server writes diagnostics to STDERR and only JSON-RPC to stdout -- fixed in v2.1.0, where
# pino defaulted to fd 1 and interleaved log lines with protocol messages. That separation is what
# makes `2>/dev/null` safe here.
say() { printf '\n== %s\n' "$*"; }

# One request, one response, with the error case made LOUD.
#
# Every filter below selects on `.result`, and `jq` emits nothing at all for a JSON-RPC error
# response -- so without this check a failed call would print an empty line and the script would
# still exit 0. That matters especially because this file is run by the test suite: a silent
# failure would be a green test over a broken server.
call() {
  local request="$1" filter="$2" response
  response="$(printf '%s\n' "$request" | node "${NODE_ARGS[@]}" 2>/dev/null)"
  if printf '%s' "$response" | jq -e 'select(.error)' >/dev/null 2>&1; then
    printf '  MCP error: %s\n' \
      "$(printf '%s' "$response" | jq -r '.error.message // (.error|tostring)')" >&2
    return 1
  fi
  printf '%s' "$response" | jq -r "$filter"
}

say "How many tools are there?"
call '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
     'select(.result.tools) | "  \(.result.tools | length) tools in the default index"'

say "Encode a string"
call '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cyberchef_to_base64","arguments":{"input":"from the shell"}}}' \
     'select(.result) | "  \(.result.content[0].text)"'

say "Run a multi-step recipe"
call '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"cyberchef_bake","arguments":{"input":"pipeline","recipe":[{"op":"To Hex","args":{"delimiter":"None"}},{"op":"To Upper case"}]}}}' \
     'select(.result) | "  \(.result.content[0].text)"'

say "Browse the catalogue"
call '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"cyberchef_categories","arguments":{}}}' \
     'select(.result) | .result.content[0].text | fromjson | .categories[:4][] | "  \(.category): \(.operations) operations"'

say "Read an operation's argument schema"
# `cyberchef_aes_encrypt` is NOT in the default tool list -- the default surface is an index. Its
# schema is fetched on demand instead, which is the whole point of the hierarchy.
call '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"cyberchef_describe_operation","arguments":{"operations":["AES Encrypt"]}}}' \
     'select(.result) | .result.content[0].text | fromjson | .operations[0]
      | "  AES Encrypt takes: \([.args[].name] | join(", "))"'

say "Run it -- no tool entry required"
call '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"cyberchef_bake","arguments":{"input":"secret","recipe":[{"op":"AES Encrypt","args":{"key":{"string":"00112233445566778899aabbccddeeff","option":"Hex"},"iv":{"string":"000102030405060708090a0b0c0d0e0f","option":"Hex"},"mode":"CBC","input_arg":"Raw","output":"Hex"}}]}}}' \
     'select(.result) | "  ciphertext: \(.result.content[0].text)"'

say "Two calls down one pipe"
# Requests are line-delimited, so several can be sent at once and are answered in order.
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"cyberchef_md5","arguments":{"input":"one"}}}' \
  '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"cyberchef_md5","arguments":{"input":"two"}}}' \
  | node "${NODE_ARGS[@]}" 2>/dev/null \
  | jq -r 'if .error then ("  MCP error: " + (.error.message // "unknown")) else "  id=\(.id) -> \(.result.content[0].text)" end'

say "The same thing against a container"
# This section RUNS if a local image is present, and prints a copyable snippet if not.
#
# It used to only ever `cat` the commands, under a heading identical to the sections above that do
# execute -- so its output looked like a result when nothing had run. An example that prints
# something indistinguishable from a result, without producing one, is worse than no example.
#
# Not pulling: a `docker pull` here would make this script depend on the network and on a registry
# being up, and the test suite runs it. If you have not built or pulled an image, the snippet below
# is the thing to paste.
IMAGE="${CYBERCHEF_MCP_IMAGE:-cyberchef-mcp:v2.1.0}"

if command -v docker >/dev/null && docker image inspect "$IMAGE" >/dev/null 2>&1; then
  printf '  using local image %s\n' "$IMAGE"
  # `-i` is REQUIRED: without stdin the container exits immediately, which looks like a crash.
  count="$(echo '{"jsonrpc":"2.0","id":9,"method":"tools/list","params":{}}' \
    | docker run -i --rm "$IMAGE" 2>/dev/null \
    | jq -r 'select(.result.tools) | .result.tools | length')"
  if [ -n "$count" ]; then
    printf '  the container answers tools/list with %s tools\n' "$count"
  else
    echo "  the container returned no tools/list result" >&2
    exit 1
  fi
else
  printf '  no local image (%s) -- skipping. To try it yourself:\n\n' "$IMAGE"
  cat <<'DOCKER'
    docker pull ghcr.io/doublegate/cyberchef-mcp_v2:latest

    echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
      | docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest \
      | jq '.result.tools | length'

    # The -i flag is REQUIRED: without it the container has no stdin and exits immediately.
DOCKER
fi

printf '\nShell examples complete.\n'
