# Release Plan: v2.2.0 - Advanced Transports

**Release Date:** November 2026
**Theme:** Modern MCP Transport Protocols
**Phase:** Phase 4 - Expansion
**Effort:** L (4 weeks)
**Risk Level:** Medium

## Overview

v2.2.0 modernizes the transport layer to align with MCP specification updates. The MCP spec deprecated SSE transport in March 2025, replacing it with Streamable HTTP. Additionally, the community has requested WebSocket transport for real-time bidirectional communication.

## Goals

1. **Primary Goal**: Implement Streamable HTTP transport per MCP spec 2025-03-26
2. **Secondary Goal**: Add WebSocket transport (community-requested)
3. **Tertiary Goal**: Enable real-time progress streaming for long operations

## Success Criteria

- [ ] 100% MCP spec compliance for Streamable HTTP
- [ ] WebSocket latency <10ms for local connections
- [ ] Session persistence across network interruptions
- [ ] Backward compatibility with stdio transport
- [ ] Progress streaming for operations >1s

## Features

### 1. Streamable HTTP Transport
**Priority:** P0 | **Effort:** L

Implement the official MCP Streamable HTTP transport.

**Tasks:**
- [ ] Implement HTTP POST endpoint for requests
- [ ] Implement HTTP GET endpoint for server-initiated messages
- [ ] Add Server-Sent Events streaming within Streamable HTTP
- [ ] Handle connection lifecycle (open, close, reconnect)
- [ ] Implement session management
- [ ] Add request correlation IDs
- [ ] Handle concurrent requests correctly

**Specification Compliance:**
| Feature | Status |
|---------|--------|
| POST for client requests | Required |
| GET for server messages | Required |
| SSE for streaming | Optional |
| Session persistence | Required |
| Request multiplexing | Required |

### 2. WebSocket Transport
**Priority:** P1 | **Effort:** L

Community-requested WebSocket transport for bidirectional real-time communication.

**Tasks:**
- [ ] Implement WebSocket server module
- [ ] Add message framing per MCP protocol
- [ ] Handle connection lifecycle
- [ ] Implement heartbeat/ping-pong
- [ ] Add reconnection with session recovery
- [ ] Handle backpressure

**Note:** WebSocket transport is NOT part of official MCP spec but is widely requested by the community. Implemented as an optional module.

### 3. SSE Deprecation & Removal
**Priority:** P0 | **Effort:** S

Complete deprecation of standalone SSE transport.

**Tasks:**
- [ ] Add deprecation warnings for SSE clients
- [ ] Update documentation to recommend Streamable HTTP
- [ ] Maintain SSE for compatibility (configurable)
- [ ] Plan SSE removal for v3.0.0

### 4. Progress Streaming
**Priority:** P0 | **Effort:** M

Real-time progress updates for long-running operations.

**Tasks:**
- [ ] Add progress events to operation execution
- [ ] Stream progress through active transport
- [ ] Implement progress event schema
- [ ] Add progress estimation for known operations
- [ ] Handle cancellation through progress channel

**Progress Event Schema:**
```json
{
  "type": "progress",
  "operationId": "uuid",
  "progress": 0.75,
  "message": "Processing chunk 3 of 4",
  "estimatedTimeRemaining": 5000
}
```

### 5. Multi-Client Session Management
**Priority:** P1 | **Effort:** M

Handle multiple connected clients with session isolation.

**Tasks:**
- [ ] Implement session store (in-memory, configurable)
- [ ] Add session creation/destruction events
- [ ] Handle session timeout
- [ ] Implement session-scoped state
- [ ] Add session metadata (client info, connection time)

### 6. Transport Auto-Negotiation
**Priority:** P2 | **Effort:** S

Automatically select best available transport.

**Tasks:**
- [ ] Implement capability discovery endpoint
- [ ] Add transport preference configuration
- [ ] Create fallback chain (Streamable HTTP -> WebSocket -> stdio)
- [ ] Handle graceful degradation

## Technical Design

### Transport Architecture

```
Client Request
     |
     v
+--------------------+
| Transport Layer    |
|  +-- Streamable HTTP (primary)
|  +-- WebSocket (optional)
|  +-- stdio (local only)
+--------------------+
     |
     v
+--------------------+
| Session Manager    |
+--------------------+
     |
     v
+--------------------+
| MCP Server Core    |
+--------------------+
```

### Streamable HTTP Flow

```
Client                          Server
  |                               |
  |--- POST /mcp (request) ------>|
  |                               |
  |<-- 200 + SSE stream ---------|
  |<-- data: {result} -----------|
  |<-- data: {progress} ---------|
  |<-- data: {complete} ---------|
  |                               |
  |--- GET /mcp/events ---------->|
  |<-- SSE stream (notifications)|
```

### WebSocket Flow

```
Client                          Server
  |                               |
  |--- WS Connect --------------->|
  |<-- Connection ACK ------------|
  |                               |
  |--- JSON-RPC Request --------->|
  |<-- JSON-RPC Response ---------|
  |<-- Progress Event ------------|
  |<-- Notification --------------|
```

## Implementation Plan

### Week 1: Streamable HTTP
- [ ] HTTP server setup (Express/Fastify)
- [ ] POST request handler
- [ ] SSE response streaming
- [ ] Basic session management

### Week 2: WebSocket
- [ ] WebSocket server setup
- [ ] Message framing
- [ ] Session integration
- [ ] Reconnection handling

### Week 3: Progress & Sessions
- [ ] Progress event system
- [ ] Multi-client sessions
- [ ] Transport abstraction layer
- [ ] Auto-negotiation

### Week 4: Testing & Documentation
- [ ] Transport compliance testing
- [ ] Performance testing
- [ ] Migration documentation
- [ ] SSE deprecation notices

## Dependencies

### Required
- `@modelcontextprotocol/sdk ^2.0.0`: Updated transport support
- `ws`: WebSocket implementation
- `express` or `fastify`: HTTP server (if not using Node http)
- `eventsource`: SSE client for testing

### Internal
- v2.1.0 multi-modal support (for binary streaming)

## Configuration

```json
{
  "transports": {
    "streamableHttp": {
      "enabled": true,
      "port": 3000,
      "host": "0.0.0.0"
    },
    "webSocket": {
      "enabled": true,
      "port": 3001
    },
    "stdio": {
      "enabled": true
    },
    "sse": {
      "enabled": false,
      "deprecated": true
    }
  },
  "sessions": {
    "timeout": 3600,
    "maxPerClient": 5
  }
}
```

## Testing Requirements

### Unit Tests
- [ ] Request/response serialization
- [ ] Session lifecycle
- [ ] Progress event handling
- [ ] Transport error handling

### Integration Tests
- [ ] Full MCP protocol compliance
- [ ] Multi-client scenarios
- [ ] Reconnection recovery
- [ ] Cross-transport compatibility

### Performance Tests
- [ ] Latency benchmarks (target: <10ms)
- [ ] Throughput benchmarks
- [ ] Memory usage under load
- [ ] Connection scaling (100+ clients)

## Documentation Updates

- [ ] Transport migration guide (SSE to Streamable HTTP)
- [ ] WebSocket usage documentation
- [ ] Configuration reference
- [ ] Client integration examples
- [ ] Troubleshooting guide

## Rollback Plan

1. Feature flags for each transport
2. Fallback to stdio for critical failures
3. SSE backward compatibility maintained
4. Revert to v2.1.x if necessary

## Migration Notes

### For SSE Users
```bash
# Old SSE connection
curl -N http://server/events

# New Streamable HTTP
curl -X POST http://server/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list"}'
```

### For Developers
- Update clients to use Streamable HTTP
- WebSocket available for real-time needs
- stdio remains for local development

## GitHub Milestone

Create milestone: `v2.2.0 - Advanced Transports`

**Issues:**
1. Implement Streamable HTTP Transport (P0, L)
2. Add WebSocket Transport (P1, L)
3. SSE Deprecation Warnings (P0, S)
4. Implement Progress Streaming (P0, M)
5. Add Multi-Client Session Management (P1, M)
6. Implement Transport Auto-Negotiation (P2, S)
7. Transport Migration Documentation (P0, M)
8. Comprehensive Testing (P0, L)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** October 2026
