# Plugin Architecture Design

**Version:** 1.0.0
**Target Release:** v2.3.0 (December 2026)
**Last Updated:** December 2025
**Status:** Planning

## Executive Summary

This document defines the plugin architecture for CyberChef MCP Server, enabling third-party developers to create custom operations. The architecture prioritizes security through sandboxed execution, ease of development through npm integration, and ecosystem growth through a plugin registry.

## Goals

1. **Extensibility**: Allow custom operations without modifying core code
2. **Security**: Isolate plugin execution to prevent system compromise
3. **Ecosystem**: Enable community-driven plugin development
4. **Compatibility**: Maintain backward compatibility with core operations

## Design Principles

### 1. Security First

- All plugins execute in sandboxed environments
- Capability-based permissions system
- No access to core server internals
- Optional cryptographic signing for verified publishers

### 2. Developer Experience

- npm-native package format
- TypeScript support with full type definitions
- Comprehensive development tooling
- Clear documentation and examples

### 3. Performance

- Minimal loading overhead (<100ms)
- Lazy loading by default
- Efficient communication between sandbox and host

## Architecture Overview

```
+--------------------------------------------------+
|                  MCP Server Core                 |
+--------------------------------------------------+
         |                    |
+------------------+  +------------------+
| Core Operations  |  | Plugin Manager   |
| (built-in)       |  | - Discovery      |
|                  |  | - Loading        |
|                  |  | - Lifecycle      |
+------------------+  +------------------+
                              |
                    +------------------+
                    | Sandbox Runtime  |
                    | - isolated-vm    |
                    | - Capabilities   |
                    | - Resource Limits|
                    +------------------+
                              |
         +--------------------+--------------------+
         |                    |                    |
   +-----------+        +-----------+        +-----------+
   | Plugin A  |        | Plugin B  |        | Plugin C  |
   +-----------+        +-----------+        +-----------+
```

## Plugin Package Format

### Directory Structure

```
my-cyberchef-plugin/
  package.json           # npm package with cyberchef metadata
  dist/
    index.mjs            # Plugin entry point
    operations/
      MyOperation.mjs    # Operation implementations
  types/
    index.d.ts           # TypeScript definitions
  README.md
  LICENSE
```

### Package.json Schema

```json
{
  "name": "@cyberchef-plugins/example",
  "version": "1.0.0",
  "description": "Example CyberChef plugin",
  "main": "dist/index.mjs",
  "types": "types/index.d.ts",

  "cyberchef": {
    "pluginApiVersion": "1.0.0",
    "operations": [
      {
        "name": "Example Operation",
        "module": "./dist/operations/ExampleOperation.mjs",
        "description": "Does something useful",
        "category": "Custom",
        "infoURL": "https://example.com/docs/example-op"
      }
    ],
    "capabilities": ["network"],
    "sandbox": {
      "required": true,
      "timeout": 30000,
      "memoryLimit": 128
    }
  },

  "peerDependencies": {
    "cyberchef-plugin-api": "^1.0.0"
  }
}
```

## Operation Interface

### TypeScript Definition

```typescript
import { z } from 'zod';

export interface Operation {
  /** Unique operation name */
  name: string;

  /** Human-readable description */
  description: string;

  /** Category for grouping */
  category: string;

  /** URL for more information */
  infoURL?: string;

  /** Input/output type hints */
  presentType?: 'html' | 'text' | 'binary';

  /** Zod schema for arguments */
  argSchema: z.ZodObject<any>;

  /** Execute the operation */
  run(input: OperationInput, args: Record<string, any>): Promise<OperationOutput>;
}

export interface OperationInput {
  /** Input data */
  data: string | Uint8Array;

  /** Input type */
  type: 'text' | 'binary';

  /** MIME type for binary data */
  mimeType?: string;
}

export interface OperationOutput {
  /** Output data */
  data: string | Uint8Array;

  /** Output type */
  type: 'text' | 'binary';

  /** MIME type for binary output */
  mimeType?: string;
}
```

### Example Operation

```typescript
// src/operations/ROT47.ts
import { Operation, OperationInput, OperationOutput } from 'cyberchef-plugin-api';
import { z } from 'zod';

export const ROT47Operation: Operation = {
  name: 'ROT47',
  description: 'ROT47 cipher - rotates ASCII characters 33-126 by 47 positions',
  category: 'Encryption / Encoding',
  infoURL: 'https://en.wikipedia.org/wiki/ROT13#Variants',

  argSchema: z.object({
    amount: z.number().min(1).max(93).default(47).describe('Rotation amount')
  }),

  async run(input: OperationInput, args: { amount: number }): Promise<OperationOutput> {
    const text = input.type === 'text' ? input.data : new TextDecoder().decode(input.data);
    const amount = args.amount || 47;

    const result = text.split('').map(char => {
      const code = char.charCodeAt(0);
      if (code >= 33 && code <= 126) {
        return String.fromCharCode(33 + ((code - 33 + amount) % 94));
      }
      return char;
    }).join('');

    return { data: result, type: 'text' };
  }
};
```

### Plugin Entry Point

```typescript
// src/index.ts
import { Plugin } from 'cyberchef-plugin-api';
import { ROT47Operation } from './operations/ROT47';
import { AnotherOperation } from './operations/Another';

const plugin: Plugin = {
  name: '@my-org/cyberchef-rot47',
  version: '1.0.0',
  apiVersion: '1.0.0',

  operations: [
    ROT47Operation,
    AnotherOperation
  ],

  // Optional lifecycle hooks
  lifecycle: {
    async onLoad(context) {
      console.log('Plugin loaded');
    },

    async onUnload(context) {
      console.log('Plugin unloaded');
    }
  }
};

export default plugin;
```

## Sandbox Architecture

### Sandbox Options Analysis

| Option | Security | Performance | Node.js API | Recommendation |
|--------|----------|-------------|-------------|----------------|
| isolated-vm | High | High | Limited | **Primary** |
| WebAssembly/WASI | Very High | Medium | Very Limited | Future option |
| vm2 | Medium | High | Full | Deprecated |
| Worker Threads | Low | High | Full | Not recommended |

### Recommended: isolated-vm

```javascript
import ivm from 'isolated-vm';

class PluginSandbox {
  constructor(options = {}) {
    this.isolate = new ivm.Isolate({
      memoryLimit: options.memoryLimit || 128 // MB
    });
    this.context = null;
    this.capabilities = new Set(options.capabilities || []);
  }

  async initialize(pluginCode) {
    this.context = await this.isolate.createContext();

    // Inject capability-controlled APIs
    const jail = this.context.global;
    await jail.set('global', jail.derefInto());

    // Inject console (always available)
    await this.injectConsole(jail);

    // Inject fetch if network capability
    if (this.capabilities.has('network')) {
      await this.injectFetch(jail);
    }

    // Inject fs if filesystem capability
    if (this.capabilities.has('filesystem')) {
      await this.injectFs(jail);
    }

    // Compile and run plugin code
    const script = await this.isolate.compileScript(pluginCode);
    await script.run(this.context);
  }

  async execute(operationName, input, args) {
    const fn = await this.context.global.get('executeOperation');
    const result = await fn.apply(undefined, [
      new ivm.ExternalCopy(operationName).copyInto(),
      new ivm.ExternalCopy(input).copyInto(),
      new ivm.ExternalCopy(args).copyInto()
    ], { timeout: 30000 });

    return result.copy();
  }

  async dispose() {
    if (this.context) {
      this.context.release();
    }
    this.isolate.dispose();
  }
}
```

### Capability System

```typescript
type Capability =
  | 'network'      // HTTP/HTTPS requests
  | 'filesystem'   // Read files (restricted paths)
  | 'crypto'       // Cryptographic APIs
  | 'timer'        // setTimeout/setInterval
  | 'encoding';    // TextEncoder/TextDecoder

interface CapabilityConfig {
  network?: {
    allowedHosts: string[];   // Whitelist of allowed hosts
    maxRequestsPerMinute: number;
  };
  filesystem?: {
    allowedPaths: string[];   // Whitelisted paths
    readOnly: boolean;
  };
  timer?: {
    maxTimeout: number;       // Maximum timer duration
  };
}
```

## Plugin Discovery & Loading

### Discovery Locations

1. `node_modules/@cyberchef-plugins/*`
2. `node_modules/cyberchef-plugin-*`
3. Custom paths via configuration

### Discovery Process

```javascript
class PluginDiscovery {
  async discover() {
    const plugins = [];

    // Scan node_modules for plugins
    const nodeModules = await this.scanNodeModules();
    for (const packagePath of nodeModules) {
      const manifest = await this.readManifest(packagePath);
      if (manifest.cyberchef) {
        plugins.push({
          path: packagePath,
          manifest,
          source: 'npm'
        });
      }
    }

    // Scan custom plugin paths
    for (const customPath of this.config.pluginPaths) {
      const manifest = await this.readManifest(customPath);
      if (manifest.cyberchef) {
        plugins.push({
          path: customPath,
          manifest,
          source: 'local'
        });
      }
    }

    return plugins;
  }

  async scanNodeModules() {
    const patterns = [
      'node_modules/@cyberchef-plugins/*',
      'node_modules/cyberchef-plugin-*'
    ];

    const matches = [];
    for (const pattern of patterns) {
      const found = await glob(pattern);
      matches.push(...found);
    }

    return matches;
  }
}
```

### Loading Process

```javascript
class PluginLoader {
  async load(pluginInfo) {
    // 1. Validate manifest
    await this.validateManifest(pluginInfo.manifest);

    // 2. Validate plugin code
    await this.validateCode(pluginInfo.path);

    // 3. Verify signature (if required)
    if (this.config.requireSignature) {
      await this.verifySignature(pluginInfo);
    }

    // 4. Create sandbox
    const sandbox = new PluginSandbox({
      memoryLimit: pluginInfo.manifest.cyberchef.sandbox?.memoryLimit || 128,
      capabilities: pluginInfo.manifest.cyberchef.capabilities || []
    });

    // 5. Load plugin into sandbox
    const code = await this.bundlePlugin(pluginInfo.path);
    await sandbox.initialize(code);

    // 6. Register operations
    for (const opConfig of pluginInfo.manifest.cyberchef.operations) {
      this.registry.register(opConfig.name, {
        plugin: pluginInfo.manifest.name,
        sandbox,
        config: opConfig
      });
    }

    return { success: true, sandbox };
  }
}
```

## Plugin Validation

### Manifest Validation

```javascript
const manifestSchema = z.object({
  name: z.string().regex(/^(@[\w-]+\/)?cyberchef-plugin-[\w-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  cyberchef: z.object({
    pluginApiVersion: z.string(),
    operations: z.array(z.object({
      name: z.string(),
      module: z.string(),
      description: z.string(),
      category: z.string()
    })),
    capabilities: z.array(z.enum(['network', 'filesystem', 'crypto', 'timer', 'encoding'])).optional(),
    sandbox: z.object({
      required: z.boolean().default(true),
      timeout: z.number().max(60000).default(30000),
      memoryLimit: z.number().max(512).default(128)
    }).optional()
  })
});
```

### Code Validation

```javascript
class CodeValidator {
  async validate(pluginPath) {
    const code = await fs.readFile(path.join(pluginPath, 'dist/index.mjs'), 'utf-8');

    // Static analysis for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/,
      /new\s+Function\s*\(/,
      /require\s*\(\s*['"]child_process/,
      /require\s*\(\s*['"]fs['"]\s*\)/,
      /process\.exit/,
      /__proto__/,
      /constructor\s*\[\s*['"]constructor/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new ValidationError(`Dangerous pattern detected: ${pattern}`);
      }
    }

    // Size limit
    const stats = await fs.stat(path.join(pluginPath, 'dist/index.mjs'));
    if (stats.size > 10 * 1024 * 1024) { // 10MB
      throw new ValidationError('Plugin exceeds maximum size');
    }

    return { valid: true };
  }
}
```

## Plugin Signing

### Signing Process

```javascript
// Publisher side
const crypto = require('crypto');

function signPlugin(pluginPath, privateKey) {
  const files = glob.sync('dist/**/*', { cwd: pluginPath });
  const hashes = {};

  for (const file of files) {
    const content = fs.readFileSync(path.join(pluginPath, file));
    hashes[file] = crypto.createHash('sha256').update(content).digest('hex');
  }

  const manifest = JSON.stringify(hashes, null, 2);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(manifest);
  const signature = sign.sign(privateKey, 'base64');

  return {
    manifest: hashes,
    signature,
    publicKeyId: getPublicKeyId(privateKey)
  };
}
```

### Verification Process

```javascript
class SignatureVerifier {
  constructor(trustedPublicKeys) {
    this.trustedKeys = new Map(trustedPublicKeys);
  }

  async verify(pluginInfo) {
    const signatureFile = path.join(pluginInfo.path, 'signature.json');
    if (!fs.existsSync(signatureFile)) {
      return { verified: false, reason: 'No signature found' };
    }

    const { manifest, signature, publicKeyId } = JSON.parse(
      await fs.readFile(signatureFile, 'utf-8')
    );

    const publicKey = this.trustedKeys.get(publicKeyId);
    if (!publicKey) {
      return { verified: false, reason: 'Unknown publisher' };
    }

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(JSON.stringify(manifest, null, 2));

    if (!verify.verify(publicKey, signature, 'base64')) {
      return { verified: false, reason: 'Invalid signature' };
    }

    // Verify file hashes
    for (const [file, expectedHash] of Object.entries(manifest)) {
      const content = await fs.readFile(path.join(pluginInfo.path, file));
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      if (actualHash !== expectedHash) {
        return { verified: false, reason: `File tampering detected: ${file}` };
      }
    }

    return { verified: true, publisher: publicKeyId };
  }
}
```

## Developer Tooling

### CLI: create-cyberchef-plugin

```bash
npx create-cyberchef-plugin my-plugin

# Interactive prompts:
# - Plugin name
# - Description
# - Author
# - Operations to scaffold
# - Capabilities needed
```

### Plugin Development Commands

```bash
# Validate plugin
npx cyberchef-plugin validate

# Test plugin locally
npx cyberchef-plugin test

# Build plugin
npx cyberchef-plugin build

# Publish to npm
npm publish
```

## Configuration

### Server Configuration

```json
{
  "plugins": {
    "enabled": true,
    "autoDiscover": true,
    "paths": ["./plugins"],

    "security": {
      "requireSignature": false,
      "trustedPublishers": [
        "official-publisher-key-id"
      ],
      "sandbox": {
        "defaultMemoryLimit": 128,
        "defaultTimeout": 30000,
        "maxMemoryLimit": 512,
        "maxTimeout": 60000
      }
    },

    "capabilities": {
      "network": {
        "enabled": true,
        "allowedHosts": ["*"],
        "maxRequestsPerMinute": 100
      },
      "filesystem": {
        "enabled": false
      }
    }
  }
}
```

## Security Considerations

### Threat Model

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Code execution | Critical | Sandbox isolation |
| Resource exhaustion | High | Memory/CPU limits |
| Data exfiltration | High | Network capability control |
| Privilege escalation | Critical | No native module access |
| Supply chain attack | High | Signing, audit |
| Denial of service | Medium | Rate limiting, timeouts |

### Security Best Practices

1. **Always sandbox**: No plugin runs outside sandbox
2. **Principle of least privilege**: Minimal capabilities by default
3. **Input validation**: Validate all data crossing sandbox boundary
4. **Audit logging**: Log plugin operations for security analysis
5. **Regular updates**: Keep sandbox runtime updated

## Roadmap

### v2.3.0 (Initial Release)
- Core plugin architecture
- Sandbox execution (isolated-vm)
- Basic capability system
- npm discovery
- CLI tools

### v2.4.0 Enhancements
- Plugin signing infrastructure
- Verified publisher program
- Enhanced capabilities

### v3.0.0 (Plugin API v2)
- Updated plugin interface
- WebAssembly sandbox option
- Plugin marketplace

## References

- [isolated-vm](https://github.com/laverdet/isolated-vm)
- [npm package format](https://docs.npmjs.com/cli/v9/configuring-npm/package-json)
- [Release v2.3.0 Plan](./release-v2.3.0.md)
- [Phase 4: Expansion](./phase-4-expansion.md)

---

**Document Owner:** TBD
**Review Cycle:** Monthly
**Next Review:** November 2026
