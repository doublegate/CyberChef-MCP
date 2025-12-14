# Release Plan: v2.1.0 - Multi-Modal Support

**Release Date:** October 2026
**Theme:** Binary Data, Image, and Audio Handling
**Phase:** Phase 4 - Expansion
**Effort:** L (4 weeks)
**Risk Level:** Low

## Overview

v2.1.0 enables multi-modal data handling through the MCP protocol, allowing CyberChef's binary, image, and audio operations to be fully utilized. The MCP specification (2025-06-18) explicitly supports base64-encoded images and audio content, but the current implementation only handles text.

## Goals

1. **Primary Goal**: Enable 50+ binary/image operations through MCP
2. **Secondary Goal**: Implement MIME type detection and validation
3. **Tertiary Goal**: Support large binary files (up to 100MB)

## Success Criteria

- [ ] 50+ operations support binary input/output
- [ ] Handle files up to 100MB without crashes
- [ ] MIME type detection accuracy >99%
- [ ] Base64 encoding overhead <10% performance impact
- [ ] Full MCP spec compliance for ImageContent and AudioContent

## Features

### 1. Binary Data Infrastructure
**Priority:** P0 | **Effort:** L

Foundation for handling binary data through MCP protocol.

**Tasks:**
- [ ] Implement base64 encoding/decoding utilities
- [ ] Add binary-aware argument types to tool schemas
- [ ] Create binary response formatting per MCP spec
- [ ] Optimize encoding for large files (streaming)
- [ ] Add memory management for large binaries
- [ ] Create binary data test utilities

**Acceptance Criteria:**
- Binary data round-trips without corruption
- Encoding performance: >50MB/s
- Memory usage: <2x file size during processing

### 2. Image Content Support
**Priority:** P0 | **Effort:** M

Enable image input/output for visual operations.

**Tasks:**
- [ ] Implement `ImageContent` type per MCP spec
- [ ] Add image MIME type detection (magic bytes)
- [ ] Support PNG, JPEG, GIF, WebP, BMP, TIFF
- [ ] Create image-specific tool input schemas
- [ ] Add image metadata extraction
- [ ] Test with image operations (Extract EXIF, etc.)

**Supported Operations:**
| Operation | Input Type | Output Type |
|-----------|------------|-------------|
| Extract EXIF | Image | Text/JSON |
| Render Image | Binary | Image |
| Split Color Channels | Image | Multiple Images |
| Rotate Image | Image | Image |
| Resize Image | Image | Image |

### 3. Audio Content Support
**Priority:** P1 | **Effort:** M

Enable audio input/output for audio operations.

**Tasks:**
- [ ] Implement `AudioContent` type per MCP spec
- [ ] Add audio MIME type detection
- [ ] Support WAV, MP3, OGG, FLAC, AAC
- [ ] Create audio-specific tool input schemas
- [ ] Add audio metadata extraction
- [ ] Test with audio operations

### 4. File Attachment Handling
**Priority:** P0 | **Effort:** M

Handle file attachments with automatic type detection.

**Tasks:**
- [ ] Implement universal file input handler
- [ ] Add magic byte detection library (file-type)
- [ ] Create fallback MIME type from extension
- [ ] Handle corrupted/unknown files gracefully
- [ ] Add file size validation
- [ ] Implement chunked reading for large files

**Supported Formats:**
- Images: PNG, JPEG, GIF, WebP, BMP, TIFF, ICO, SVG
- Audio: WAV, MP3, OGG, FLAC, AAC, M4A
- Archives: ZIP, GZIP, BZIP2, TAR, RAR, 7Z
- Documents: PDF, Office formats (binary)
- Data: JSON, XML, CSV (text), Binary protocols

### 5. Blob Resource Support
**Priority:** P1 | **Effort:** M

Implement MCP blob resources for large binary data.

**Tasks:**
- [ ] Implement blob resource URI scheme
- [ ] Add blob storage (temporary file-based)
- [ ] Create blob reference in responses
- [ ] Handle blob lifecycle (cleanup)
- [ ] Add blob size limits and quotas

### 6. Multi-Modal Response Formatting
**Priority:** P0 | **Effort:** S

Format responses according to MCP content types.

**Tasks:**
- [ ] Detect appropriate response content type
- [ ] Format ImageContent responses
- [ ] Format AudioContent responses
- [ ] Format mixed content responses
- [ ] Add content type negotiation

## Technical Design

### Data Flow

```
Input (base64) --> Decode --> CyberChef Operation --> Encode --> Output (base64)
     |                                                              |
     v                                                              v
MIME Detection                                              Content Type Selection
```

### Schema Changes

**Before (v2.0.0):**
```json
{
  "input": { "type": "string" }
}
```

**After (v2.1.0):**
```json
{
  "input": {
    "oneOf": [
      { "type": "string" },
      {
        "type": "object",
        "properties": {
          "type": { "enum": ["base64"] },
          "data": { "type": "string" },
          "mimeType": { "type": "string" }
        }
      }
    ]
  }
}
```

### Response Format

```json
{
  "content": [
    {
      "type": "image",
      "data": "iVBORw0KGgo...",
      "mimeType": "image/png"
    }
  ]
}
```

## Implementation Plan

### Week 1: Foundation
- [ ] Binary encoding utilities
- [ ] MIME type detection library
- [ ] Basic binary input handling

### Week 2: Image Support
- [ ] ImageContent implementation
- [ ] Image operation testing
- [ ] Image metadata handling

### Week 3: Audio & Files
- [ ] AudioContent implementation
- [ ] Universal file handler
- [ ] Large file optimization

### Week 4: Integration & Testing
- [ ] Blob resource support
- [ ] Response formatting
- [ ] Comprehensive testing
- [ ] Documentation

## Dependencies

### Required
- `file-type`: MIME detection from magic bytes
- `@modelcontextprotocol/sdk`: MCP protocol types
- `sharp` (optional): Image processing optimization

### Internal
- v2.0.0 stable release
- Updated tool schema system

## Testing Requirements

### Unit Tests
- [ ] Base64 encoding/decoding
- [ ] MIME type detection (100+ file types)
- [ ] Large file handling (100MB+)
- [ ] Corrupted file handling

### Integration Tests
- [ ] Image operation round-trips
- [ ] Audio operation round-trips
- [ ] Mixed content handling
- [ ] MCP protocol compliance

### Performance Tests
- [ ] Encoding speed benchmarks
- [ ] Memory usage profiling
- [ ] Large file processing

## Documentation Updates

- [ ] Multi-modal usage guide
- [ ] Supported file types reference
- [ ] API schema updates
- [ ] Example recipes with binary data
- [ ] Troubleshooting guide

## Rollback Plan

If critical issues discovered:
1. Feature flag to disable multi-modal
2. Fallback to text-only mode
3. Revert to v2.0.x if necessary

## Migration Notes

### For Users
- No breaking changes
- New input format is optional (backward compatible)
- Binary output requires client support

### For Developers
- Update clients to handle ImageContent/AudioContent
- Add base64 encoding for binary inputs
- Handle blob resources if used

## GitHub Milestone

Create milestone: `v2.1.0 - Multi-Modal Support`

**Issues:**
1. Implement Binary Data Infrastructure (P0, L)
2. Add Image Content Support (P0, M)
3. Add Audio Content Support (P1, M)
4. Implement File Attachment Handling (P0, M)
5. Add Blob Resource Support (P1, M)
6. Implement Multi-Modal Response Formatting (P0, S)
7. Update Documentation (P0, M)
8. Comprehensive Testing (P0, L)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** September 2026
