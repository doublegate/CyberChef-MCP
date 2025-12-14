# Release Plan: v1.5.0 - Streaming & Enhanced Error Handling

**Release Date:** April 2026 (Target: Week of Apr 21)
**Theme:** Streaming Support & Enhanced Error Handling
**Phase:** Phase 2 - Enhancement
**Effort:** L (2 weeks)
**Risk Level:** Medium

## Overview

Implement MCP streaming protocol support for progressive results, enhance error handling with detailed context and recovery suggestions, and improve observability through structured logging.

## Goals

1. **Primary Goal**: Support streaming for operations >1GB
2. **Secondary Goal**: Provide actionable error messages with recovery suggestions
3. **Tertiary Goal**: Implement structured logging for debugging

## Success Criteria

- [ ] MCP streaming protocol implemented
- [ ] Handle 1GB+ operations with streaming
- [ ] Error messages include context and suggestions
- [ ] Structured logs in JSON format
- [ ] Error recovery rate improved by 50%

## Features & Improvements

### 1. MCP Streaming Protocol Support
**Priority:** P0 | **Effort:** L (8 days)

Implement MCP protocol streaming for progressive results.

**Implementation:**
```javascript
// Streaming response for large operations
async function streamingCallTool(request) {
  const { name, arguments: args } = request.params;

  // Send initial response
  yield {
    content: [{ type: 'text', text: 'Processing...' }],
    isError: false
  };

  // Stream chunks as they're processed
  for await (const chunk of processLargeOperation(args.input)) {
    yield {
      content: [{ type: 'text', text: chunk }],
      isError: false,
      _meta: { progress: chunk.progress }
    };
  }

  // Send final result
  yield {
    content: [{ type: 'text', text: finalResult }],
    isError: false,
    _meta: { complete: true }
  };
}
```

**Tasks:**
- [ ] Review MCP streaming specification
- [ ] Implement streaming transport layer
- [ ] Add progress reporting
- [ ] Test with 1GB+ inputs
- [ ] Document streaming usage

**Acceptance Criteria:**
- Streams work with MCP-compliant clients
- Progress updates sent every 10MB
- Memory usage remains constant during streaming
- Client receives complete results

---

### 2. Enhanced Error Handling
**Priority:** P0 | **Effort:** M (6 days)

Provide detailed error context with recovery suggestions.

**Implementation:**
```javascript
class CyberChefMCPError extends Error {
  constructor(code, message, context = {}, suggestions = []) {
    super(message);
    this.code = code;
    this.context = context;
    this.suggestions = suggestions;
    this.timestamp = new Date().toISOString();
  }

  toMCPError() {
    return {
      code: this.code,
      message: this.message,
      data: {
        context: this.context,
        suggestions: this.suggestions,
        timestamp: this.timestamp
      }
    };
  }
}

// Usage
throw new CyberChefMCPError(
  'INVALID_INPUT',
  'Input is not valid Base64',
  { input: input.substring(0, 100) },
  [
    'Ensure input contains only Base64 characters (A-Z, a-z, 0-9, +, /, =)',
    'Use cyberchef_to_base64 to encode binary data first',
    'Check for whitespace or newlines in input'
  ]
);
```

**Tasks:**
- [ ] Define error taxonomy (codes)
- [ ] Create CyberChefMCPError class
- [ ] Add error recovery suggestions
- [ ] Implement error context capture
- [ ] Test error scenarios comprehensively

**Error Codes:**
- `INVALID_INPUT` - Malformed input data
- `MISSING_ARGUMENT` - Required argument not provided
- `OPERATION_FAILED` - CyberChef operation threw error
- `TIMEOUT` - Operation exceeded time limit
- `OUT_OF_MEMORY` - Memory limit exceeded
- `UNSUPPORTED_OPERATION` - Operation not available

**Acceptance Criteria:**
- All errors use standardized codes
- Error messages are actionable
- Context includes relevant debugging info
- Suggestions provided for common errors

---

### 3. Structured Logging
**Priority:** P1 | **Effort:** M (4 days)

Implement JSON structured logging with correlation IDs.

**Implementation:**
```javascript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label })
  }
});

// Usage
logger.info({
  requestId: req.id,
  tool: 'cyberchef_to_base64',
  inputSize: input.length,
  duration: Date.now() - start
}, 'Tool executed successfully');

logger.error({
  requestId: req.id,
  tool: 'cyberchef_from_base64',
  error: err.message,
  stack: err.stack
}, 'Tool execution failed');
```

**Tasks:**
- [ ] Integrate Pino for structured logging
- [ ] Add request ID tracking
- [ ] Log key events (request, response, errors)
- [ ] Configure log levels (debug, info, warn, error)
- [ ] Add log aggregation documentation

---

### 4. Error Recovery & Retry Logic
**Priority:** P2 | **Effort:** S (3 days)

Implement automatic retry for transient errors.

**Implementation:**
```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err) {
      if (!isRetryable(err) || i === maxRetries - 1) {
        throw err;
      }
      await sleep(Math.pow(2, i) * 1000);  // Exponential backoff
    }
  }
}
```

**Tasks:**
- [ ] Define retryable vs non-retryable errors
- [ ] Implement exponential backoff
- [ ] Add retry count to logs
- [ ] Test retry scenarios

---

### 5. Progress Reporting
**Priority:** P1 | **Effort:** M (4 days)

Report operation progress for long-running tasks.

**Tasks:**
- [ ] Add progress hooks to CyberChef operations
- [ ] Implement progress callbacks
- [ ] Send progress via MCP streaming
- [ ] Add progress to logs
- [ ] Test with slow operations

---

## Breaking Changes

None. New features are additive.

**Deprecation Notices:**
- Simple error messages will be enhanced (no breaking change, just improvements)

## Dependencies

- MCP SDK with streaming support
- Pino (structured logging)
- UUID (for request IDs)

## Testing Requirements

### Streaming Tests
- [ ] 1GB+ input streaming
- [ ] Progress reporting accuracy
- [ ] Memory usage during streaming
- [ ] Client compatibility

### Error Handling Tests
- [ ] All error codes covered
- [ ] Suggestions are helpful
- [ ] Context is captured correctly
- [ ] Retry logic works

### Logging Tests
- [ ] JSON format validation
- [ ] Request ID propagation
- [ ] Log levels work correctly
- [ ] Sensitive data not logged

## Documentation Updates

- [ ] Add streaming usage guide
- [ ] Document error codes and recovery
- [ ] Add logging configuration guide
- [ ] Update troubleshooting documentation

## Migration Guide

**For Users:**
- Streaming is automatic for large operations (no changes required)
- Error messages now include suggestions (improved UX)
- Configure `LOG_LEVEL` environment variable for debugging

**For Developers:**
- Review new error codes for integration
- Use structured logs for better observability
- Test streaming with large inputs

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | Streaming implementation | MCP streaming working |
| Week 2 | Error handling, logging | Enhanced errors, structured logs |

## Related Documents

- [Phase 2: Enhancement](./phase-2-enhancement.md)
- [v1.4.0 Release Plan](./release-v1.4.0.md)
- [v1.6.0 Release Plan](./release-v1.6.0.md)

## GitHub Milestone

Create milestone: `v1.5.0 - Streaming & Enhanced Error Handling`

**Issues to Create:**
1. Implement MCP Streaming Protocol (P0, L)
2. Enhanced Error Handling with Suggestions (P0, M)
3. Add Structured Logging with Pino (P1, M)
4. Implement Error Recovery & Retry (P2, S)
5. Add Progress Reporting (P1, M)
6. Update Error Documentation (P2, S)

---

**Last Updated:** December 2025
**Status:** Planning
