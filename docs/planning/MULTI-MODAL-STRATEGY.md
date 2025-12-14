# Multi-Modal Support Strategy

**Version:** 1.0.0
**Target Release:** v2.1.0 (October 2026)
**Last Updated:** December 2025
**Status:** Planning

## Executive Summary

This document outlines the strategy for implementing multi-modal support in CyberChef MCP Server, enabling binary data, image, and audio handling through the MCP protocol. The MCP specification (2025-06-18) explicitly supports multi-modal content, and CyberChef has numerous operations that work with binary data that currently cannot be effectively used through MCP.

## Background

### Current State

CyberChef MCP Server currently treats all inputs and outputs as text strings. This limits the effectiveness of:
- Image operations (Extract EXIF, Render Image, etc.)
- Audio operations
- Binary file operations (Unzip, Gunzip, etc.)
- Cryptographic operations with binary output
- File format conversions

### MCP Specification Support

The MCP specification (2025-06-18) defines explicit support for multi-modal content:

```typescript
interface ImageContent {
  type: "image";
  data: string;      // base64-encoded
  mimeType: string;  // e.g., "image/png"
}

interface AudioContent {
  type: "audio";
  data: string;      // base64-encoded
  mimeType: string;  // e.g., "audio/wav"
}

interface BlobContent {
  type: "resource";
  resource: {
    uri: string;     // blob://...
    mimeType: string;
  };
}
```

## Strategic Goals

1. **Full Binary Support**: Enable all CyberChef binary operations through MCP
2. **Seamless Integration**: Transparent handling of binary data in recipes
3. **Performance**: Efficient handling of large binary files (up to 100MB)
4. **Compatibility**: Maintain backward compatibility with text-only clients

## Design Principles

### 1. Input Detection

Automatically detect input type based on content:

```javascript
function detectInputType(input) {
  if (typeof input === 'string') {
    // Check if it's base64-encoded binary
    if (isValidBase64(input) && hasNonTextContent(input)) {
      return { type: 'binary', encoding: 'base64', data: input };
    }
    return { type: 'text', data: input };
  }

  if (typeof input === 'object') {
    if (input.type === 'base64' || input.type === 'image' || input.type === 'audio') {
      return { type: 'binary', ...input };
    }
  }

  return { type: 'text', data: String(input) };
}
```

### 2. MIME Type Detection

Use magic bytes for accurate MIME type detection:

```javascript
import { fileTypeFromBuffer } from 'file-type';

async function detectMimeType(buffer) {
  const type = await fileTypeFromBuffer(buffer);
  if (type) {
    return type.mime;
  }
  // Fallback to text analysis
  if (isValidUtf8(buffer)) {
    return 'text/plain';
  }
  return 'application/octet-stream';
}
```

**Supported Types:**

| Category | MIME Types |
|----------|------------|
| Images | image/png, image/jpeg, image/gif, image/webp, image/bmp, image/tiff |
| Audio | audio/wav, audio/mp3, audio/ogg, audio/flac, audio/aac |
| Archives | application/zip, application/gzip, application/x-tar |
| Documents | application/pdf, application/msword |
| Binary | application/octet-stream |

### 3. Operation Classification

Classify operations by their I/O characteristics:

| Category | Input | Output | Examples |
|----------|-------|--------|----------|
| Text-to-Text | Text | Text | ROT13, Base64 Encode |
| Text-to-Binary | Text | Binary | To Hex (raw) |
| Binary-to-Text | Binary | Text | From Base64, MD5 Hash |
| Binary-to-Binary | Binary | Binary | Gzip, AES Encrypt |
| Image-to-Image | Image | Image | Rotate Image |
| Image-to-Text | Image | Text | Extract EXIF |

### 4. Schema Evolution

Update tool schemas to support multi-modal input:

**Current Schema:**
```json
{
  "input": { "type": "string" }
}
```

**Multi-Modal Schema:**
```json
{
  "input": {
    "oneOf": [
      { "type": "string", "description": "Text input" },
      {
        "type": "object",
        "properties": {
          "type": { "enum": ["base64", "image", "audio"] },
          "data": { "type": "string" },
          "mimeType": { "type": "string" }
        },
        "required": ["type", "data"]
      }
    ]
  }
}
```

## Implementation Architecture

### Data Flow

```
+------------------+
| MCP Request      |
| (text or binary) |
+------------------+
         |
         v
+------------------+
| Input Handler    |
| - Type detection |
| - Base64 decode  |
| - MIME detection |
+------------------+
         |
         v
+------------------+
| CyberChef Op     |
| - Process data   |
| - Type-aware     |
+------------------+
         |
         v
+------------------+
| Output Handler   |
| - Type selection |
| - Base64 encode  |
| - MIME setting   |
+------------------+
         |
         v
+------------------+
| MCP Response     |
| (text or image)  |
+------------------+
```

### Large File Handling

For files >10MB, use streaming and blob resources:

```javascript
// Create blob resource for large output
if (outputSize > 10 * 1024 * 1024) {
  const blobId = await storage.createBlob(outputBuffer);
  return {
    content: [{
      type: "resource",
      resource: {
        uri: `blob://cyberchef/${blobId}`,
        mimeType: outputMimeType
      }
    }]
  };
}
```

### Memory Management

```javascript
class BufferPool {
  constructor(maxSize = 100 * 1024 * 1024) {
    this.maxSize = maxSize;
    this.currentSize = 0;
    this.buffers = new Map();
  }

  async allocate(size) {
    if (this.currentSize + size > this.maxSize) {
      await this.gc();
    }
    const buffer = Buffer.allocUnsafe(size);
    this.currentSize += size;
    return buffer;
  }

  release(buffer) {
    this.currentSize -= buffer.length;
  }
}
```

## CyberChef Operations Analysis

### Image Operations (Priority: High)

| Operation | Status | Notes |
|-----------|--------|-------|
| Extract EXIF | Ready | Returns JSON/text |
| Render Image | Ready | Binary to image display |
| Split Colour Channels | Ready | Multiple image outputs |
| Rotate Image | Ready | Image transformation |
| Resize Image | Ready | Image transformation |
| Blur Image | Ready | Image filter |
| Dither Image | Ready | Image filter |
| Invert Image | Ready | Image filter |
| Flip Image | Ready | Image transformation |

### Binary Operations (Priority: High)

| Operation | Status | Notes |
|-----------|--------|-------|
| Gunzip | Ready | Decompression |
| Gzip | Ready | Compression |
| Unzip | Ready | Archive extraction |
| Zip | Ready | Archive creation |
| Bzip2 Decompress | Ready | Decompression |
| Bzip2 Compress | Ready | Compression |
| XZ Decompress | Ready | Decompression |
| XZ Compress | Ready | Compression |

### Cryptographic Operations (Priority: Medium)

| Operation | Output Type | Notes |
|-----------|-------------|-------|
| AES Encrypt | Binary | Encrypted ciphertext |
| AES Decrypt | Binary/Text | Depends on content |
| RSA Encrypt | Binary | Encrypted data |
| RSA Decrypt | Binary/Text | Depends on content |
| Hash functions | Hex/Binary | Configurable output |

## Testing Strategy

### Unit Tests

```javascript
describe('Multi-Modal Input', () => {
  test('detects base64 image input', async () => {
    const input = { type: 'base64', data: 'iVBORw0KGgo...', mimeType: 'image/png' };
    const result = await detectInputType(input);
    expect(result.type).toBe('binary');
    expect(result.mimeType).toBe('image/png');
  });

  test('handles text input unchanged', async () => {
    const result = await detectInputType('Hello World');
    expect(result.type).toBe('text');
  });

  test('detects binary in base64 string', async () => {
    const pngBase64 = fs.readFileSync('test.png', 'base64');
    const result = await detectInputType(pngBase64);
    expect(result.type).toBe('binary');
  });
});
```

### Integration Tests

```javascript
describe('Image Operations', () => {
  test('Extract EXIF returns metadata', async () => {
    const imageData = fs.readFileSync('test-with-exif.jpg', 'base64');
    const result = await callTool('extract_exif', {
      input: { type: 'base64', data: imageData, mimeType: 'image/jpeg' }
    });
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Camera');
  });

  test('Rotate Image returns image', async () => {
    const imageData = fs.readFileSync('test.png', 'base64');
    const result = await callTool('rotate_image', {
      input: { type: 'base64', data: imageData, mimeType: 'image/png' },
      degrees: 90
    });
    expect(result.content[0].type).toBe('image');
    expect(result.content[0].mimeType).toBe('image/png');
  });
});
```

### Performance Benchmarks

| Scenario | Target |
|----------|--------|
| 1KB image encode/decode | <5ms |
| 1MB image encode/decode | <50ms |
| 10MB image encode/decode | <500ms |
| 100MB file handling | <5s |

## Migration Considerations

### Backward Compatibility

Text-only clients will continue to work:
- Text inputs remain unchanged
- Binary outputs can be returned as base64 strings
- Operations default to text mode when no type specified

### Client Updates

Clients should be updated to:
1. Check response content type
2. Handle `ImageContent` and `AudioContent`
3. Display images/audio appropriately
4. Support blob resource URIs

## Security Considerations

### Input Validation

```javascript
function validateBinaryInput(input, maxSize = 100 * 1024 * 1024) {
  if (!input.data) {
    throw new ValidationError('Missing data field');
  }

  const decoded = Buffer.from(input.data, 'base64');
  if (decoded.length > maxSize) {
    throw new ValidationError(`Input exceeds maximum size of ${maxSize} bytes`);
  }

  // Validate MIME type if provided
  if (input.mimeType) {
    const detected = await fileTypeFromBuffer(decoded);
    if (detected && detected.mime !== input.mimeType) {
      logger.warn('MIME type mismatch', { provided: input.mimeType, detected: detected.mime });
    }
  }

  return decoded;
}
```

### Resource Limits

- Maximum input size: 100MB (configurable)
- Maximum output size: 100MB (configurable)
- Blob storage timeout: 1 hour
- Concurrent binary operations: 10 (configurable)

## Rollout Plan

### Phase 1: Foundation (Week 1)
- Base64 encoding/decoding utilities
- MIME type detection
- Binary input handling

### Phase 2: Core Operations (Week 2)
- Image operation support
- Archive operation support
- Testing framework

### Phase 3: Advanced Features (Week 3)
- Blob resource support
- Large file streaming
- Audio support

### Phase 4: Polish (Week 4)
- Performance optimization
- Documentation
- Final testing

## Success Metrics

| Metric | Target |
|--------|--------|
| Binary operations supported | 50+ |
| MIME detection accuracy | >99% |
| Performance overhead | <10% |
| Large file support | 100MB |
| Memory efficiency | <2x file size |

## References

- [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/)
- [MCP Multi-Modal Servers](https://hackernoon.com/multi-modal-mcp-servers-handling-files-images-and-streaming-data)
- [file-type library](https://github.com/sindresorhus/file-type)
- [Release v2.1.0 Plan](./release-v2.1.0.md)
- [Phase 4: Expansion](./phase-4-expansion.md)

---

**Document Owner:** TBD
**Review Cycle:** Monthly
**Next Review:** September 2026
