# Sprint 1.2: Testing Framework

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 1.2 |
| Phase | 1 - Foundation |
| Duration | 2 weeks |
| Start | Week 3 |
| End | Week 4 |

## Objectives

1. Establish testing infrastructure for external tools
2. Create test utilities and helpers
3. Set up reference testing framework
4. Configure CI/CD for new test suites

## User Stories

### US-1.2.1: Test Infrastructure

**As a** developer
**I want** a dedicated test suite for external tools
**So that** I can validate tool implementations independently

**Acceptance Criteria:**
- [ ] Separate test directory structure for tools
- [ ] Test configuration for tools namespace
- [ ] Coverage reporting for tools
- [ ] Fast test execution (<30s for unit tests)

### US-1.2.2: Test Utilities

**As a** developer writing tool tests
**I want** reusable test utilities and fixtures
**So that** I can write tests efficiently

**Acceptance Criteria:**
- [ ] Mock transport for MCP testing
- [ ] Fixture loading utilities
- [ ] Test data generators
- [ ] Assertion helpers for tool results

### US-1.2.3: Reference Testing

**As a** developer porting algorithms
**I want** to test against reference implementation outputs
**So that** I can verify correctness

**Acceptance Criteria:**
- [ ] Reference vector loading system
- [ ] Comparison utilities
- [ ] Tolerance handling for floating point
- [ ] BigInt comparison support

### US-1.2.4: CI Integration

**As a** maintainer
**I want** automated testing in CI
**So that** regressions are caught early

**Acceptance Criteria:**
- [ ] GitHub Actions workflow for tools
- [ ] Coverage thresholds enforced
- [ ] Performance regression detection
- [ ] Clear failure reporting

## Tasks

### Infrastructure (Day 1-4)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-1.2.1 | Create test directory structure | 2h | - |
| T-1.2.2 | Configure Vitest for tools | 2h | - |
| T-1.2.3 | Set up coverage reporting | 2h | - |
| T-1.2.4 | Create base test classes | 4h | - |

### Test Utilities (Day 5-8)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-1.2.5 | Implement MockTransport | 4h | T-1.2.4 |
| T-1.2.6 | Create fixture loader | 4h | T-1.2.1 |
| T-1.2.7 | Build test data generators | 6h | - |
| T-1.2.8 | Create assertion helpers | 4h | - |

### Reference Testing (Day 7-9)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-1.2.9 | Reference vector format design | 2h | - |
| T-1.2.10 | Reference loader implementation | 4h | T-1.2.9 |
| T-1.2.11 | Comparison utilities | 4h | T-1.2.10 |

### CI/CD (Day 9-10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-1.2.12 | Create tools-ci.yml workflow | 4h | T-1.2.3 |
| T-1.2.13 | Configure coverage thresholds | 2h | T-1.2.12 |
| T-1.2.14 | Add performance benchmarks | 4h | - |
| T-1.2.15 | Documentation | 2h | All |

## Deliverables

### Files to Create

```
tests/
├── tools/
│   ├── setup.mjs              # Test setup/teardown
│   ├── utils/
│   │   ├── mock-transport.mjs # MCP mock
│   │   ├── fixtures.mjs       # Fixture loading
│   │   ├── generators.mjs     # Test data
│   │   └── assertions.mjs     # Custom matchers
│   ├── fixtures/
│   │   ├── README.md          # Fixture documentation
│   │   └── .gitkeep
│   └── reference/
│       └── README.md          # Reference test docs
├── vitest.tools.config.mjs    # Tools-specific config
└── benchmark/
    └── tools.bench.mjs        # Performance benchmarks

.github/workflows/
└── tools-ci.yml               # CI workflow
```

### Code Specifications

#### MockTransport (mock-transport.mjs)

```javascript
/**
 * Mock MCP transport for testing
 */
export class MockTransport {
    constructor() {
        this.requests = [];
        this.responses = new Map();
    }

    /**
     * Send a mock request and get response
     */
    async sendRequest(request) {
        this.requests.push(request);

        // Check for pre-configured response
        const key = `${request.method}:${JSON.stringify(request.params)}`;
        if (this.responses.has(key)) {
            return this.responses.get(key);
        }

        // Default: pass through to actual server
        throw new Error(`No mock configured for ${request.method}`);
    }

    /**
     * Configure a mock response
     */
    mockResponse(method, params, response) {
        const key = `${method}:${JSON.stringify(params)}`;
        this.responses.set(key, response);
    }

    /**
     * Get all captured requests
     */
    getCapturedRequests() {
        return [...this.requests];
    }

    /**
     * Clear captured requests
     */
    clearRequests() {
        this.requests = [];
    }
}

/**
 * Create a connected mock transport with server
 */
export async function createMockServer(registry) {
    const transport = new MockTransport();

    // Configure tools/list
    transport.mockResponse('tools/list', {}, {
        result: {
            tools: registry.getToolDefinitions()
        }
    });

    // Configure tools/call to route to registry
    transport.handleToolCall = async (name, args) => {
        const tool = registry.get(name);
        if (!tool) {
            return {
                error: { code: -32601, message: `Tool '${name}' not found` }
            };
        }
        try {
            const result = await tool.execute(args);
            return {
                result: {
                    content: [{ type: 'text', text: JSON.stringify(result) }]
                }
            };
        } catch (error) {
            return {
                result: {
                    isError: true,
                    content: [{ type: 'text', text: error.message }]
                }
            };
        }
    };

    return { transport };
}
```

#### Fixture Loader (fixtures.mjs)

```javascript
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/**
 * Load a JSON fixture file
 */
export function loadFixture(category, name) {
    const path = join(FIXTURES_DIR, category, `${name}.json`);
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
}

/**
 * Load a binary fixture file
 */
export function loadBinaryFixture(category, name) {
    const path = join(FIXTURES_DIR, category, name);
    return readFileSync(path);
}

/**
 * Load all fixtures in a category
 */
export function loadAllFixtures(category) {
    const categoryDir = join(FIXTURES_DIR, category);
    const files = readdirSync(categoryDir).filter(f => f.endsWith('.json'));

    return files.map(file => {
        const name = file.replace('.json', '');
        return { name, data: loadFixture(category, name) };
    });
}

/**
 * Create a test suite from fixtures
 */
export function fixtureTestSuite(category, testFn) {
    const fixtures = loadAllFixtures(category);

    return fixtures.map(({ name, data }) => ({
        name,
        test: () => testFn(data)
    }));
}
```

#### Reference Testing (reference.mjs)

```javascript
/**
 * Reference test utilities for validating against original implementations
 */

/**
 * Load reference vectors from file
 */
export function loadReferenceVectors(toolName) {
    return loadFixture('reference', toolName);
}

/**
 * Compare BigInt values
 */
export function compareBigInt(actual, expected) {
    const actualBig = BigInt(actual);
    const expectedBig = BigInt(expected);
    return actualBig === expectedBig;
}

/**
 * Compare with tolerance for floating point
 */
export function compareWithTolerance(actual, expected, tolerance = 1e-10) {
    return Math.abs(actual - expected) <= tolerance;
}

/**
 * Compare byte arrays
 */
export function compareBytes(actual, expected) {
    if (actual.length !== expected.length) {
        return {
            equal: false,
            reason: `Length mismatch: ${actual.length} vs ${expected.length}`
        };
    }

    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
            return {
                equal: false,
                reason: `Byte mismatch at index ${i}: ${actual[i]} vs ${expected[i]}`
            };
        }
    }

    return { equal: true };
}

/**
 * Run reference test suite
 */
export async function runReferenceTests(tool, vectors) {
    const results = [];

    for (const vector of vectors) {
        const startTime = performance.now();
        try {
            const result = await tool.execute(vector.input);
            const duration = performance.now() - startTime;

            const passed = compareResult(result, vector.expected);
            results.push({
                name: vector.name,
                passed,
                duration,
                actual: result,
                expected: vector.expected
            });
        } catch (error) {
            results.push({
                name: vector.name,
                passed: false,
                error: error.message
            });
        }
    }

    return results;
}
```

#### CI Workflow (tools-ci.yml)

```yaml
name: External Tools CI

on:
  push:
    paths:
      - 'src/node/tools/**'
      - 'tests/tools/**'
      - '.github/workflows/tools-ci.yml'
  pull_request:
    paths:
      - 'src/node/tools/**'
      - 'tests/tools/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint -- src/node/tools tests/tools

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npx grunt configTests

      - name: Run tool tests
        run: npm run test:tools -- --coverage

      - name: Check coverage thresholds
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage/lcov.info
          flags: external-tools

  benchmark:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/master'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npx grunt configTests

      - name: Run benchmarks
        run: npm run bench:tools

      - name: Store benchmark results
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: 'customSmallerIsBetter'
          output-file-path: benchmark-results.json
```

## Definition of Done

- [ ] Test infrastructure operational
- [ ] MockTransport working with registry
- [ ] Fixture loading tested
- [ ] Reference test framework validated
- [ ] CI workflow running
- [ ] Coverage reporting working
- [ ] Documentation complete

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Test isolation issues | High | Medium | Use fresh registry per test |
| Fixture format inconsistency | Medium | Medium | Document format, validate on load |
| CI performance | Low | Low | Parallel execution, caching |

## Dependencies

### External

- vitest (already in project)
- fast-check (for property-based testing)

### Internal

- Sprint 1.1 (ToolRegistry)

## Notes

- Reference vectors will be generated from original tools in Phase 3
- Performance benchmarks establish baselines for Phase 4 optimization
- CI workflow can be extended as more tools are added

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
