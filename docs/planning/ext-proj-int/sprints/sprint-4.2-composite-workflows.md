# Sprint 4.2: Composite Workflows

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 4.2 |
| Phase | 4 - Advanced Integrations |
| Duration | 2 weeks |
| Start | Week 21 |
| End | Week 22 |

## Objectives

1. Create multi-tool composite workflows
2. Implement CTF-oriented analysis pipelines
3. Build malware analysis workflow combinations
4. Integrate all previous sprint tools into unified workflows

## User Stories

### US-4.2.1: CTF Crypto Workflow

**As a** CTF player
**I want** an automated crypto analysis workflow
**So that** I can quickly analyze unknown cryptographic challenges

**Acceptance Criteria:**
- [ ] Auto-detect encoding type
- [ ] Try common decryption approaches
- [ ] Chain multiple decode steps
- [ ] Return full decode path
- [ ] Timeout protection (max 30s)

### US-4.2.2: Malware Triage Workflow

**As a** malware analyst
**I want** automated malware artifact extraction
**So that** I can quickly triage suspicious samples

**Acceptance Criteria:**
- [ ] Extract encoded strings
- [ ] Decode obfuscated URLs/IPs
- [ ] Extract embedded data
- [ ] Identify encryption schemes used
- [ ] Generate triage report

### US-4.2.3: Password Audit Workflow

**As a** security auditor
**I want** comprehensive hash analysis
**So that** I can assess password storage security

**Acceptance Criteria:**
- [ ] Identify hash types in dump
- [ ] Categorize by algorithm strength
- [ ] Generate security recommendations
- [ ] Export for offline cracking tools

### US-4.2.4: Data Recovery Workflow

**As a** forensic analyst
**I want** multi-stage data recovery
**So that** I can extract hidden information

**Acceptance Criteria:**
- [ ] Detect data hiding techniques
- [ ] Extract from multiple encoding layers
- [ ] Handle partial/corrupted data
- [ ] Document recovery steps

## Tasks

### Workflow Framework (Day 1-3)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-4.2.1 | Design workflow execution engine | 4h | - |
| T-4.2.2 | Implement step sequencing | 3h | - |
| T-4.2.3 | Add conditional branching | 4h | - |
| T-4.2.4 | Create result aggregation | 3h | - |
| T-4.2.5 | Implement timeout management | 2h | - |

### CTF Workflows (Day 4-6)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-4.2.6 | Create crypto analysis workflow | 5h | T-4.2.1-4 |
| T-4.2.7 | Create steganography workflow | 4h | T-4.2.1-4 |
| T-4.2.8 | Create forensics workflow | 4h | T-4.2.1-4 |
| T-4.2.9 | Add CTF flag detection | 2h | T-4.2.6-8 |

### Security Workflows (Day 7-8)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-4.2.10 | Create malware triage workflow | 5h | T-4.2.1-4 |
| T-4.2.11 | Create password audit workflow | 4h | T-4.2.1-4 |
| T-4.2.12 | Create network forensics workflow | 4h | T-4.2.1-4 |

### Integration (Day 9-10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-4.2.13 | Register MCP tools | 3h | All |
| T-4.2.14 | Write comprehensive tests | 6h | T-4.2.13 |
| T-4.2.15 | Documentation and examples | 3h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── workflows/
│   ├── index.mjs           # Module exports
│   ├── engine.mjs          # Workflow execution engine
│   ├── steps.mjs           # Step definitions
│   ├── ctf/                # CTF-oriented workflows
│   │   ├── crypto.mjs      # Crypto analysis
│   │   ├── stego.mjs       # Steganography
│   │   └── forensics.mjs   # Forensics
│   ├── security/           # Security analysis workflows
│   │   ├── malware.mjs     # Malware triage
│   │   ├── password.mjs    # Password audit
│   │   └── network.mjs     # Network forensics
│   └── register.mjs        # Tool registration
```

### Code Specifications

#### Workflow Engine (engine.mjs)

```javascript
/**
 * Workflow execution engine for composite multi-tool operations
 */

/**
 * Workflow step definition
 * @typedef {Object} WorkflowStep
 * @property {string} name - Step name
 * @property {string} tool - Tool to execute
 * @property {Object} args - Tool arguments
 * @property {Function} [condition] - Conditional execution
 * @property {Function} [transform] - Transform output for next step
 * @property {boolean} [optional] - Continue on failure
 */

/**
 * Workflow result
 * @typedef {Object} WorkflowResult
 * @property {boolean} success - Overall success
 * @property {Array} steps - Step execution results
 * @property {any} finalOutput - Final workflow output
 * @property {Object} metadata - Execution metadata
 */

export class WorkflowEngine {
    constructor(toolRegistry, options = {}) {
        this.toolRegistry = toolRegistry;
        this.timeout = options.timeout || 30000;
        this.maxSteps = options.maxSteps || 20;
        this.verbose = options.verbose || false;
    }

    /**
     * Execute a workflow definition
     */
    async execute(workflow, initialInput) {
        const startTime = performance.now();
        const results = {
            success: true,
            steps: [],
            finalOutput: null,
            metadata: {
                workflowName: workflow.name,
                startTime: new Date().toISOString(),
                totalSteps: workflow.steps.length,
                executedSteps: 0,
                skippedSteps: 0,
                failedSteps: 0
            }
        };

        let currentInput = initialInput;
        let stepCount = 0;

        for (const step of workflow.steps) {
            // Timeout check
            if (performance.now() - startTime > this.timeout) {
                results.success = false;
                results.metadata.error = 'Workflow timeout exceeded';
                break;
            }

            // Max steps check
            if (stepCount >= this.maxSteps) {
                results.success = false;
                results.metadata.error = 'Maximum step count exceeded';
                break;
            }

            // Conditional execution
            if (step.condition && !step.condition(currentInput, results)) {
                results.steps.push({
                    name: step.name,
                    status: 'skipped',
                    reason: 'Condition not met'
                });
                results.metadata.skippedSteps++;
                continue;
            }

            // Execute step
            const stepResult = await this.executeStep(step, currentInput);
            results.steps.push(stepResult);
            stepCount++;
            results.metadata.executedSteps++;

            if (stepResult.status === 'success') {
                // Transform output if transformer provided
                currentInput = step.transform
                    ? step.transform(stepResult.output, currentInput)
                    : stepResult.output;
            } else {
                results.metadata.failedSteps++;

                if (!step.optional) {
                    results.success = false;
                    results.metadata.error = `Step '${step.name}' failed: ${stepResult.error}`;
                    break;
                }
            }
        }

        results.finalOutput = currentInput;
        results.metadata.executionTime = performance.now() - startTime;
        results.metadata.endTime = new Date().toISOString();

        return results;
    }

    /**
     * Execute a single workflow step
     */
    async executeStep(step, input) {
        const stepStart = performance.now();

        try {
            // Resolve tool
            const tool = this.toolRegistry.get(step.tool);
            if (!tool) {
                return {
                    name: step.name,
                    tool: step.tool,
                    status: 'error',
                    error: `Tool '${step.tool}' not found`
                };
            }

            // Prepare arguments
            const args = typeof step.args === 'function'
                ? step.args(input)
                : { input, ...step.args };

            // Execute tool
            const output = await tool.execute(args);

            return {
                name: step.name,
                tool: step.tool,
                status: 'success',
                output,
                executionTime: performance.now() - stepStart
            };
        } catch (error) {
            return {
                name: step.name,
                tool: step.tool,
                status: 'error',
                error: error.message,
                executionTime: performance.now() - stepStart
            };
        }
    }

    /**
     * Execute workflow with branching support
     */
    async executeWithBranches(workflow, initialInput) {
        const results = [];
        const branches = workflow.branches || [{ steps: workflow.steps }];

        for (const branch of branches) {
            // Check branch condition
            if (branch.condition && !branch.condition(initialInput)) {
                continue;
            }

            const branchResult = await this.execute(
                { name: `${workflow.name}/${branch.name || 'main'}`, steps: branch.steps },
                initialInput
            );

            results.push({
                branch: branch.name || 'main',
                ...branchResult
            });

            // Stop on first successful branch if configured
            if (workflow.stopOnFirstSuccess && branchResult.success) {
                break;
            }
        }

        return {
            workflowName: workflow.name,
            branches: results,
            success: results.some(r => r.success),
            bestResult: results.find(r => r.success) || results[0]
        };
    }
}

/**
 * Workflow definition builder
 */
export class WorkflowBuilder {
    constructor(name) {
        this.workflow = {
            name,
            steps: [],
            branches: null
        };
    }

    addStep(name, tool, args = {}, options = {}) {
        this.workflow.steps.push({
            name,
            tool,
            args,
            ...options
        });
        return this;
    }

    addConditionalStep(name, tool, condition, args = {}, options = {}) {
        this.workflow.steps.push({
            name,
            tool,
            args,
            condition,
            ...options
        });
        return this;
    }

    addOptionalStep(name, tool, args = {}, options = {}) {
        return this.addStep(name, tool, args, { ...options, optional: true });
    }

    branch(branches) {
        this.workflow.branches = branches;
        return this;
    }

    build() {
        return this.workflow;
    }
}
```

#### CTF Crypto Workflow (ctf/crypto.mjs)

```javascript
/**
 * CTF Cryptography analysis workflow
 * Systematically attempts to decode/decrypt unknown ciphertext
 */

import { WorkflowBuilder } from '../engine.mjs';

/**
 * Main CTF crypto analysis workflow
 */
export function createCryptoWorkflow() {
    return new WorkflowBuilder('ctf_crypto_analysis')
        // Step 1: Identify encoding
        .addStep(
            'identify_encoding',
            'cyberchef_auto_identify',
            {},
            {
                transform: (output, input) => ({
                    original: input,
                    detected: output
                })
            }
        )
        // Step 2: Attempt auto-decode
        .addStep(
            'auto_decode',
            'cyberchef_auto_decode',
            (input) => ({ input: input.original }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    autoDecoded: output
                })
            }
        )
        // Step 3: Check for XOR
        .addConditionalStep(
            'xor_analysis',
            'cyberchef_xor_analyze',
            (input) => !input.autoDecoded?.success,
            (input) => ({ input: input.original }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    xorAnalysis: output
                })
            }
        )
        // Step 4: Check for hash
        .addStep(
            'hash_check',
            'cyberchef_hash_identify',
            (input) => ({
                input: input.autoDecoded?.result || input.original
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    hashIdentification: output
                })
            }
        )
        // Step 5: RSA analysis if applicable
        .addConditionalStep(
            'rsa_analysis',
            'cyberchef_rsa_analyze',
            (input) => {
                // Check if input looks like RSA parameters
                const text = input.original;
                return text.includes('n =') || text.includes('e =') ||
                       text.includes('c =') || /\d{50,}/.test(text);
            },
            (input) => ({ input: input.original }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    rsaAnalysis: output
                })
            }
        )
        // Step 6: Flag detection
        .addStep(
            'flag_detection',
            'cyberchef_ctf_flag_detect',
            (input) => ({
                input: JSON.stringify(input),
                patterns: ['flag{', 'CTF{', 'FLAG{', 'ctf{']
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    flagsFound: output
                })
            }
        )
        // Step 7: Generate report
        .addStep(
            'generate_report',
            'internal_report_generator',
            (input) => ({ data: input }),
            {
                transform: (output, context) => ({
                    analysis: context,
                    report: output,
                    success: context.autoDecoded?.success ||
                             context.flagsFound?.length > 0
                })
            }
        )
        .build();
}

/**
 * Quick decode workflow - tries common encoding only
 */
export function createQuickDecodeWorkflow() {
    return new WorkflowBuilder('quick_decode')
        .addOptionalStep('try_base64', 'cyberchef_from_base64', {})
        .addOptionalStep('try_hex', 'cyberchef_from_hex', {})
        .addOptionalStep('try_url', 'cyberchef_url_decode', {})
        .addOptionalStep('try_rot13', 'cyberchef_rot13', {})
        .build();
}

/**
 * Classical cipher analysis workflow
 */
export function createClassicalCipherWorkflow() {
    return new WorkflowBuilder('classical_cipher_analysis')
        .addStep(
            'frequency_analysis',
            'cyberchef_frequency_distribution',
            {},
            {
                transform: (output, input) => ({
                    original: input,
                    frequency: output
                })
            }
        )
        .addStep(
            'detect_cipher_type',
            'internal_cipher_detector',
            (input) => ({ frequency: input.frequency }),
            {
                transform: (output, context) => ({
                    ...context,
                    cipherType: output
                })
            }
        )
        .addConditionalStep(
            'caesar_bruteforce',
            'cyberchef_rot13_brute',
            (input) => input.cipherType?.includes('caesar'),
            (input) => ({ input: input.original })
        )
        .addConditionalStep(
            'vigenere_analysis',
            'cyberchef_vigenere_decode',
            (input) => input.cipherType?.includes('vigenere'),
            (input) => ({ input: input.original })
        )
        .addConditionalStep(
            'substitution_solver',
            'cyberchef_substitution',
            (input) => input.cipherType?.includes('substitution'),
            (input) => ({ input: input.original })
        )
        .build();
}
```

#### Malware Analysis Workflow (security/malware.mjs)

```javascript
/**
 * Malware analysis and triage workflow
 */

import { WorkflowBuilder } from '../engine.mjs';

/**
 * Malware string extraction workflow
 */
export function createMalwareTriageWorkflow() {
    return new WorkflowBuilder('malware_triage')
        // Step 1: Extract strings
        .addStep(
            'extract_strings',
            'cyberchef_strings',
            { minLength: 6 },
            {
                transform: (output, input) => ({
                    original: input,
                    strings: output
                })
            }
        )
        // Step 2: Find encoded strings
        .addStep(
            'find_encoded',
            'internal_encoded_string_detector',
            (input) => ({ strings: input.strings }),
            {
                transform: (output, context) => ({
                    ...context,
                    encodedStrings: output
                })
            }
        )
        // Step 3: Decode Base64 strings
        .addConditionalStep(
            'decode_base64',
            'internal_batch_decode',
            (input) => input.encodedStrings?.base64?.length > 0,
            (input) => ({
                strings: input.encodedStrings.base64,
                encoding: 'base64'
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    decodedBase64: output
                })
            }
        )
        // Step 4: Decode hex strings
        .addConditionalStep(
            'decode_hex',
            'internal_batch_decode',
            (input) => input.encodedStrings?.hex?.length > 0,
            (input) => ({
                strings: input.encodedStrings.hex,
                encoding: 'hex'
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    decodedHex: output
                })
            }
        )
        // Step 5: XOR brute force on suspicious strings
        .addConditionalStep(
            'xor_bruteforce',
            'cyberchef_xor_bruteforce',
            (input) => input.encodedStrings?.suspicious?.length > 0,
            (input) => ({
                input: input.encodedStrings.suspicious[0],
                keyLength: 1
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    xorResults: output
                })
            }
        )
        // Step 6: Extract URLs/IPs
        .addStep(
            'extract_iocs',
            'cyberchef_extract_urls',
            (input) => ({
                input: [
                    ...(input.decodedBase64 || []),
                    ...(input.decodedHex || []),
                    ...input.strings
                ].join('\n')
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    urls: output
                })
            }
        )
        // Step 7: Extract IP addresses
        .addStep(
            'extract_ips',
            'cyberchef_extract_ip_addresses',
            (input) => ({
                input: [
                    ...(input.decodedBase64 || []),
                    ...(input.decodedHex || []),
                    ...input.strings
                ].join('\n')
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    ips: output
                })
            }
        )
        // Step 8: Defang IOCs
        .addStep(
            'defang_iocs',
            'cyberchef_defang_url',
            (input) => ({
                input: [
                    ...(input.urls || []),
                    ...(input.ips || [])
                ].join('\n')
            }),
            {
                optional: true,
                transform: (output, context) => ({
                    ...context,
                    defangedIOCs: output
                })
            }
        )
        // Step 9: Generate triage report
        .addStep(
            'generate_report',
            'internal_malware_report',
            (input) => ({ analysis: input })
        )
        .build();
}

/**
 * PowerShell deobfuscation workflow
 */
export function createPowerShellDeobfuscationWorkflow() {
    return new WorkflowBuilder('powershell_deobfuscation')
        // Remove backticks
        .addStep(
            'remove_backticks',
            'cyberchef_find_replace',
            { find: '`', replace: '' }
        )
        // Handle string concatenation
        .addStep(
            'concat_strings',
            'cyberchef_regular_expression',
            {
                regex: "'\\s*\\+\\s*'",
                replace: ''
            }
        )
        // Decode Base64
        .addOptionalStep(
            'decode_base64_command',
            'cyberchef_regular_expression',
            {
                regex: '-[Ee]nc(?:odedcommand)?\\s+([A-Za-z0-9+/=]+)',
                outputFormat: '$1'
            }
        )
        .addOptionalStep(
            'base64_to_utf16',
            'cyberchef_from_base64',
            {}
        )
        .addOptionalStep(
            'utf16_to_ascii',
            'cyberchef_decode_text',
            { encoding: 'UTF-16LE' }
        )
        // Extract commands
        .addStep(
            'extract_commands',
            'internal_powershell_parser',
            {}
        )
        .build();
}

/**
 * JavaScript deobfuscation workflow
 */
export function createJSDeobfuscationWorkflow() {
    return new WorkflowBuilder('js_deobfuscation')
        // Beautify
        .addStep(
            'beautify',
            'cyberchef_javascript_beautify',
            {}
        )
        // Decode escape sequences
        .addStep(
            'decode_unicode_escapes',
            'cyberchef_unescape_unicode_characters',
            {}
        )
        // Decode hex escapes
        .addStep(
            'decode_hex_escapes',
            'cyberchef_from_hex',
            {},
            { optional: true }
        )
        // Find eval/Function calls
        .addStep(
            'find_evals',
            'cyberchef_regular_expression',
            {
                regex: '(?:eval|Function)\\s*\\([^)]+\\)',
                outputFormat: 'List matches'
            }
        )
        // Extract strings
        .addStep(
            'extract_strings',
            'cyberchef_strings',
            { minLength: 10 }
        )
        .build();
}
```

#### Password Audit Workflow (security/password.mjs)

```javascript
/**
 * Password and hash audit workflow
 */

import { WorkflowBuilder } from '../engine.mjs';

/**
 * Hash dump analysis workflow
 */
export function createHashAuditWorkflow() {
    return new WorkflowBuilder('hash_audit')
        // Step 1: Parse hash file
        .addStep(
            'parse_hashes',
            'internal_hash_parser',
            {},
            {
                transform: (output, input) => ({
                    original: input,
                    hashes: output
                })
            }
        )
        // Step 2: Identify hash types
        .addStep(
            'identify_hashes',
            'cyberchef_hash_batch',
            (input) => ({ hashes: input.hashes }),
            {
                transform: (output, context) => ({
                    ...context,
                    identification: output
                })
            }
        )
        // Step 3: Categorize by type
        .addStep(
            'categorize',
            'internal_hash_categorizer',
            (input) => ({ identification: input.identification }),
            {
                transform: (output, context) => ({
                    ...context,
                    categories: output
                })
            }
        )
        // Step 4: Assess security
        .addStep(
            'security_assessment',
            'internal_security_assessor',
            (input) => ({ categories: input.categories }),
            {
                transform: (output, context) => ({
                    ...context,
                    assessment: output
                })
            }
        )
        // Step 5: Generate recommendations
        .addStep(
            'recommendations',
            'internal_recommendation_engine',
            (input) => ({ assessment: input.assessment }),
            {
                transform: (output, context) => ({
                    ...context,
                    recommendations: output
                })
            }
        )
        // Step 6: Export for cracking tools
        .addStep(
            'export_for_tools',
            'internal_hash_exporter',
            (input) => ({
                categories: input.categories,
                formats: ['john', 'hashcat']
            })
        )
        // Step 7: Generate report
        .addStep(
            'generate_report',
            'internal_audit_report',
            (input) => ({ analysis: input })
        )
        .build();
}

/**
 * Hash comparison workflow (find duplicates, weak passwords)
 */
export function createHashComparisonWorkflow() {
    return new WorkflowBuilder('hash_comparison')
        // Parse hashes
        .addStep(
            'parse',
            'internal_hash_parser',
            {}
        )
        // Find duplicates
        .addStep(
            'find_duplicates',
            'internal_duplicate_finder',
            {},
            {
                transform: (output, context) => ({
                    ...context,
                    duplicates: output
                })
            }
        )
        // Check against known weak hash database
        .addStep(
            'check_weak_hashes',
            'internal_weak_hash_checker',
            (input) => ({ hashes: input }),
            {
                transform: (output, context) => ({
                    ...context,
                    weakHashes: output
                })
            }
        )
        // Generate findings
        .addStep(
            'generate_findings',
            'internal_findings_generator',
            (input) => ({
                duplicates: input.duplicates,
                weakHashes: input.weakHashes
            })
        )
        .build();
}
```

#### CTF Flag Detection (ctf/flag.mjs)

```javascript
/**
 * CTF flag detection and extraction
 */

/**
 * Common CTF flag patterns
 */
export const FLAG_PATTERNS = [
    // Standard formats
    { regex: /flag\{[^}]+\}/gi, format: 'flag{...}' },
    { regex: /CTF\{[^}]+\}/gi, format: 'CTF{...}' },
    { regex: /FLAG\{[^}]+\}/gi, format: 'FLAG{...}' },
    { regex: /ctf\{[^}]+\}/gi, format: 'ctf{...}' },

    // Competition-specific
    { regex: /picoCTF\{[^}]+\}/gi, format: 'picoCTF{...}' },
    { regex: /HTB\{[^}]+\}/gi, format: 'HTB{...}' },
    { regex: /THM\{[^}]+\}/gi, format: 'THM{...}' },
    { regex: /CUCTF\{[^}]+\}/gi, format: 'CUCTF{...}' },

    // Alternative delimiters
    { regex: /flag\[[^\]]+\]/gi, format: 'flag[...]' },
    { regex: /flag<[^>]+>/gi, format: 'flag<...>' },
    { regex: /flag\([^)]+\)/gi, format: 'flag(...)' },

    // Base64-like flags
    { regex: /ZmxhZ3t[A-Za-z0-9+\/=]+/g, format: 'base64(flag{)' },
];

/**
 * Detect CTF flags in text
 */
export function detectFlags(text, options = {}) {
    const {
        patterns = FLAG_PATTERNS,
        decodeBase64 = true,
        customPattern = null
    } = options;

    const allPatterns = customPattern
        ? [...patterns, { regex: customPattern, format: 'custom' }]
        : patterns;

    const flags = [];

    for (const pattern of allPatterns) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
            let flag = match[0];
            let decoded = null;

            // Try to decode base64 flags
            if (decodeBase64 && pattern.format.includes('base64')) {
                try {
                    decoded = Buffer.from(flag, 'base64').toString('utf-8');
                } catch (e) {
                    // Not valid base64
                }
            }

            flags.push({
                flag: decoded || flag,
                format: pattern.format,
                position: match.index,
                raw: match[0],
                wasDecoded: decoded !== null
            });
        }
    }

    // Deduplicate
    const unique = flags.filter((flag, index, self) =>
        index === self.findIndex(f => f.flag === flag.flag)
    );

    return {
        found: unique.length > 0,
        count: unique.length,
        flags: unique
    };
}

/**
 * Generate flag pattern for custom CTF
 */
export function generateFlagPattern(prefix, options = {}) {
    const {
        caseSensitive = false,
        allowedChars = '[^}]+',
        delimiter = '{}'
    } = options;

    const [open, close] = delimiter.split('');
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedOpen = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const flags = caseSensitive ? 'g' : 'gi';
    return new RegExp(`${escapedPrefix}${escapedOpen}${allowedChars}${escapedClose}`, flags);
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_workflow_ctf_crypto` | CTF crypto analysis workflow |
| `cyberchef_workflow_malware_triage` | Malware analysis triage |
| `cyberchef_workflow_powershell` | PowerShell deobfuscation |
| `cyberchef_workflow_js_deobfuscate` | JavaScript deobfuscation |
| `cyberchef_workflow_hash_audit` | Hash security audit |
| `cyberchef_ctf_flag_detect` | CTF flag detection |
| `cyberchef_workflow_quick_decode` | Quick multi-encoding decode |

## Definition of Done

- [ ] Workflow engine implemented
- [ ] 6+ composite workflows created
- [ ] Timeout handling working
- [ ] Unit tests with > 80% coverage
- [ ] All MCP tools functional
- [ ] Documentation with examples

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Workflow complexity | High | Medium | Step limits, timeouts |
| Tool dependencies | Medium | Medium | Optional steps, graceful fallback |
| Performance issues | Medium | Medium | Async execution, caching |

## Dependencies

### External

- None (uses internal tools)

### Internal

- Sprint 1.1 (ToolRegistry)
- Sprint 3.1 (Auto-decode)
- Sprint 3.2 (XOR Analysis)
- Sprint 4.1 (Hash Identification)

## Notes

- Workflows chain existing tools - no new algorithms
- Focus on practical CTF and security use cases
- Extensible framework for future workflows

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
