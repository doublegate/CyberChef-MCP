# External Project Integration Planning

## Overview

This directory contains comprehensive planning documentation for integrating reference security tools into CyberChef-MCP as native MCP tools. The integration focuses on extracting algorithms and functionality directly from source code - **no Docker containers or binary execution**.

## Current Status

| Metric | Value |
|--------|-------|
| Planning Version | 1.1.0 |
| Planning Status | Complete |
| Target CyberChef-MCP Version | 2.0.0+ |
| Total Phases | 4 |
| Total Sprints | 12 |
| Estimated Duration | 24 weeks |
| New MCP Tools Target | 80-120 tools |

## Reference Projects

| Project | Language | Primary Integration Focus | Complexity |
|---------|----------|---------------------------|------------|
| **Ciphey/Ares** | Rust | AuSearch auto-decode, plaintext detection | High |
| **cryptii** | JavaScript | Modular encoding, historical ciphers | Low |
| **xortool** | Python | XOR cipher analysis | Medium |
| **RsaCtfTool** | Python | RSA cryptanalysis (60+ attacks) | High |
| **John the Ripper** | C | Hash identification, analysis | Very High |
| **pwntools** | Python | Encoding utilities, binary helpers | Medium |
| **katana** | Python | CTF automation patterns | Medium |
| **cyberchef-recipes** | JSON | Recipe patterns, presets | Low |

## Directory Structure

```
docs/planning/ext-proj-int/
├── README.md                          # This file - navigation guide
├── overview.md                        # Integration strategy and architecture
├── phases/
│   ├── phase-1-foundation.md          # Core infrastructure (3 sprints)
│   ├── phase-2-js-native.md           # JavaScript integrations (3 sprints)
│   ├── phase-3-algorithm-port.md      # Python/Rust algorithm ports (5 sprints)
│   └── phase-4-advanced.md            # Complex integrations (4 sprints)
├── sprints/                                  # 12 detailed sprint plans
│   ├── sprint-1.1-tool-registry.md           # ToolRegistry and BaseTool infrastructure
│   ├── sprint-1.2-testing-framework.md       # Testing framework extensions
│   ├── sprint-2.1-cryptii-integration.md     # cryptii encoding integration
│   ├── sprint-2.2-recipes-presets.md         # Recipe pattern presets
│   ├── sprint-2.3-pwntools-binary.md         # pwntools binary utilities
│   ├── sprint-3.1-ciphey-autodecode.md       # Ciphey A* auto-decode algorithm
│   ├── sprint-3.2-xortool-analysis.md        # XOR analysis algorithms
│   ├── sprint-3.3-rsactftool-factorization.md # RSA factorization attacks
│   ├── sprint-3.4-katana-patterns.md         # katana CTF automation patterns
│   ├── sprint-4.1-john-hash-id.md            # John hash identification
│   ├── sprint-4.2-composite-workflows.md     # Multi-tool workflows
│   └── sprint-4.3-documentation-release.md   # Documentation and release
├── tools/
│   ├── ciphey-integration.md          # Detailed Ciphey/Ares integration plan
│   ├── cryptii-integration.md         # Detailed cryptii integration plan
│   ├── xortool-integration.md         # Detailed xortool integration plan
│   ├── rsactftool-integration.md      # Detailed RsaCtfTool integration plan
│   ├── john-integration.md            # Detailed John integration plan
│   ├── pwntools-integration.md        # Detailed pwntools integration plan
│   ├── katana-integration.md          # Detailed katana integration plan
│   └── recipes-integration.md         # Detailed recipes integration plan
└── technical/
    ├── tool-registration.md           # How to add new MCP tools
    ├── algorithm-porting.md           # Python/Rust to JavaScript guide
    ├── testing-strategy.md            # Test coverage requirements
    └── dependencies.md                # New npm packages needed
```

## Quick Links

### Phase Plans

1. **[Phase 1: Foundation](phases/phase-1-foundation.md)** - Core infrastructure (2 sprints, 4 weeks)
2. **[Phase 2: JavaScript Native](phases/phase-2-js-native.md)** - JS integrations (3 sprints, 6 weeks)
3. **[Phase 3: Algorithm Ports](phases/phase-3-algorithm-port.md)** - Python/Rust ports (4 sprints, 8 weeks)
4. **[Phase 4: Advanced](phases/phase-4-advanced.md)** - Complex integrations (3 sprints, 6 weeks)

### Sprint Plans

#### Phase 1: Foundation (Weeks 1-4)
- **[Sprint 1.1: Tool Registry](sprints/sprint-1.1-tool-registry.md)** - ToolRegistry, BaseTool, category indexing
- **[Sprint 1.2: Testing Framework](sprints/sprint-1.2-testing-framework.md)** - MockTransport, fixtures, CI workflow

#### Phase 2: JavaScript Native (Weeks 5-10)
- **[Sprint 2.1: cryptii Integration](sprints/sprint-2.1-cryptii-integration.md)** - Morse, Braille, Enigma ciphers
- **[Sprint 2.2: Recipe Presets](sprints/sprint-2.2-recipes-presets.md)** - Malware analysis, forensics recipes
- **[Sprint 2.3: pwntools Binary](sprints/sprint-2.3-pwntools-binary.md)** - Pack/unpack, cyclic patterns, hexdump

#### Phase 3: Algorithm Ports (Weeks 11-18)
- **[Sprint 3.1: Ciphey Auto-Decode](sprints/sprint-3.1-ciphey-autodecode.md)** - A* search, encoding detection
- **[Sprint 3.2: xortool Analysis](sprints/sprint-3.2-xortool-analysis.md)** - Key length, key guessing, brute force
- **[Sprint 3.3: RsaCtfTool Factorization](sprints/sprint-3.3-rsactftool-factorization.md)** - Fermat, Wiener, Pollard's rho
- **[Sprint 3.4: katana Patterns](sprints/sprint-3.4-katana-patterns.md)** - Encoding chains, file detection, CTF analyzer

#### Phase 4: Advanced Integrations (Weeks 19-24)
- **[Sprint 4.1: John Hash ID](sprints/sprint-4.1-john-hash-id.md)** - 100+ hash patterns, identification
- **[Sprint 4.2: Composite Workflows](sprints/sprint-4.2-composite-workflows.md)** - Multi-tool pipelines, CTF/malware workflows
- **[Sprint 4.3: Documentation & Release](sprints/sprint-4.3-documentation-release.md)** - Docs, benchmarks, v2.0.0 release

### Technical Guides

- **[Tool Registration](technical/tool-registration.md)** - Step-by-step guide for adding MCP tools
- **[Algorithm Porting](technical/algorithm-porting.md)** - Converting Python/Rust to JavaScript
- **[Testing Strategy](technical/testing-strategy.md)** - Test requirements and patterns
- **[Dependencies](technical/dependencies.md)** - Required npm packages

### Per-Tool Plans

- **[Ciphey Integration](tools/ciphey-integration.md)** - Auto-decode, AuSearch algorithm
- **[cryptii Integration](tools/cryptii-integration.md)** - Modular encoding system
- **[xortool Integration](tools/xortool-integration.md)** - XOR analysis
- **[RsaCtfTool Integration](tools/rsactftool-integration.md)** - RSA attacks
- **[John Integration](tools/john-integration.md)** - Hash identification
- **[pwntools Integration](tools/pwntools-integration.md)** - Encoding utilities
- **[katana Integration](tools/katana-integration.md)** - CTF patterns
- **[Recipes Integration](tools/recipes-integration.md)** - Recipe presets

## Integration Philosophy

### Core Principles

1. **Native JavaScript** - All integrations must be pure JavaScript/TypeScript
2. **No External Binaries** - No Docker, no subprocess execution, no system calls
3. **Source Code Extraction** - Pull algorithms directly from reference project source
4. **MCP Tool Pattern** - Follow existing `cyberchef_*` tool conventions
5. **Comprehensive Testing** - Minimum 80% coverage for new tools
6. **Documentation First** - Document before implementing

### Tool Naming Convention

```
cyberchef_<category>_<operation>
```

Examples:
- `cyberchef_auto_decode` - Auto-detect and decode (from Ciphey)
- `cyberchef_xor_analyze` - XOR key analysis (from xortool)
- `cyberchef_rsa_factor` - RSA factorization (from RsaCtfTool)
- `cyberchef_hash_identify` - Hash type identification (from John)
- `cyberchef_encoding_detect` - Encoding detection (from cryptii)

### Success Criteria

1. All planning documents complete with actionable detail
2. Clear sprint breakdown with time estimates
3. Technical guides for implementation
4. No Docker/binary execution dependencies
5. Integration preserves MCP tool patterns
6. Comprehensive test strategy defined
7. New tools integrate seamlessly with existing 300+ operations

## Getting Started

1. Read **[Overview](overview.md)** for integration strategy
2. Review **Phase Plans** in order (1-4)
3. Consult **Technical Guides** before implementation
4. Follow **Per-Tool Plans** for specific integrations
5. Execute **Sprint Plans** sequentially within phases

## Related Documentation

- **[CyberChef-MCP Architecture](../../architecture/architecture.md)**
- **[Technical Implementation](../../architecture/technical_implementation.md)**
- **[Reference Project Docs](../../reference/)**
- **[Main Roadmap](../ROADMAP.md)**

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Maintained By:** CyberChef-MCP Team
