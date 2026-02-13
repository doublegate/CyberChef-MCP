# Changelog

All notable changes to the CyberChef MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Upstream Monitor Schedule**: Changed cron from every 6 hours to weekly (Sundays at noon UTC) to reduce unnecessary CI runs

### Fixed
- **Documentation**: Corrected `ENABLE_WORKERS` env var references to `CYBERCHEF_ENABLE_WORKERS` across README.md, CLAUDE.md, and release notes
- **Documentation**: Updated upstream monitor schedule references from "every 6 hours" to "weekly" in README.md
- **Documentation**: Updated Dockerfile base image references from `node:18-alpine`/`node:22-alpine` to Chainguard distroless in architecture docs and CLAUDE.md
- **Documentation**: Updated coverage threshold references in CLAUDE.md to match current thresholds (75% lines/stmts, 90% functions, 70% branches)
- **Documentation**: Expanded MCP tools listing and CI/CD workflow table in CLAUDE.md

## [1.9.0] - 2026-02-05

### Added
- **MCP Streaming Protocol** (closes #13): `executeWithStreamingProgress()` sends `notifications/progress` via MCP SDK progress token mechanism
- **Worker Thread Pool with Piscina** (closes #15): CPU-intensive operations offloaded to worker threads with configurable pool size
- **Streamable HTTP Transport**: Transport factory supporting stdio (default) or HTTP via `CYBERCHEF_TRANSPORT=http`
- **`cyberchef_worker_stats` tool**: Monitor worker pool utilization at runtime
- New `src/node/transports.mjs` transport factory (stdio/HTTP)
- New `src/node/worker.mjs` worker thread script for Piscina
- New `src/node/worker-pool.mjs` worker pool manager
- New test files: handler-dispatch, config-variations, worker-pool, transports
- 9 new environment variables for transport, worker pool, and worker routing configuration

### Changed
- **Upstream Sync v10.20.0** (closes #26): Merged 10 modified operations (Argon2, DeriveEVPKey, Filter, FindReplace, JSONBeautify, PHPDeserialize, RAKE, Register, RegularExpression, Subsection)
- **Test Suites**: 126 new tests (total: 689 tests, all passing) (closes #14)
- **Coverage Thresholds**: Raised to 75% lines/stmts, 90% functions, 70% branches
- **Coverage**: 75.64% lines, 71.98% branches, 91.5% functions

### Security
- `@modelcontextprotocol/sdk` ^1.22.0 -> ^1.26.0 (fixes #45, #52)
- `lodash` ^4.17.21 -> ^4.17.23 (fixes #51)
- `diff` ^5.2.0 -> ^5.2.2 (fixes #50)
- `qs >=6.14.1` override added (fixes #43)
- Trivy container scan now fails CI on vulnerabilities (closes #16)
- `grunt-chmod` replaced with native `fs.chmod` (closes #19)
- **elliptic (#46):** No fix available - documented for tracking

### Removed
- Dead `BufferPool` class code from mcp-server.mjs (closes #20)
- Commented-out `CPU_INTENSIVE_OPERATIONS` set (moved to worker-pool.mjs)

## [1.8.0] - 2025-12-17

### Added
- **Deprecation Warning System** (`src/node/deprecation.mjs`): Comprehensive runtime warning system for APIs changing in v2.0.0
  - 8 deprecation codes (DEP001-DEP008) covering tool naming, recipe schema, error format, configuration, arguments, recipe format, and meta-tool renames
  - Session-based warning tracking (warnings emitted only once per session per code)
  - Suppressible via `CYBERCHEF_SUPPRESS_DEPRECATIONS=true` environment variable
  - V2 compatibility mode that elevates warnings to errors via `V2_COMPATIBILITY_MODE=true`
  - Recipe analysis tools (`analyzeRecipeCompatibility`, `transformRecipeToV2`)
  - Utility functions (`getToolName`, `stripToolPrefix`)
- **Migration Preview Tool** (`cyberchef_migration_preview`): New MCP tool for analyzing and transforming recipes
  - `analyze` mode: Check recipes for v2.0.0 compatibility issues with detailed diagnostics
  - `transform` mode: Automatically convert recipes to v2.0.0 format
  - Reports issues with severity levels (breaking/warning), locations, and fix suggestions
- **Deprecation Stats Tool** (`cyberchef_deprecation_stats`): New MCP tool for tracking deprecated API usage
  - Shows which deprecations have been triggered in current session
  - Includes session duration, suppression status, and v2 compatibility mode status
  - Lists all available deprecation codes with details
- **v2.0.0 Breaking Changes Documentation** (`docs/v2.0.0-breaking-changes.md`): Comprehensive migration guide
  - Tool naming convention changes (removing `cyberchef_` prefix)
  - Recipe schema format changes (Zod v4 validation)
  - Error response format changes (structured error codes)
  - Configuration system changes (unified config file)
  - Legacy argument handling changes (named object args)
  - Recipe array format changes (explicit operation objects)
  - Meta-tool renames (`cyberchef_bake` -> `bake`, `cyberchef_search` -> `search`)
  - Migration examples and FAQ section
- **Test Suites**: 81 new tests for v1.8.0 features (total: 563 tests, all passing)
  - `tests/mcp/deprecation.test.mjs`: 43 tests for deprecation warning system
  - `tests/mcp/migration-preview.test.mjs`: 38 tests for migration preview tool and server integration
  - Increased from 493 tests (v1.7.2) to 563 tests across 15 test suites

### Changed
- **VERSION**: Updated from 1.7.3 to 1.8.0 in `src/node/mcp-server.mjs`
- **Server Startup Logging**: Enhanced to display v1.8.0 configuration options (V2_COMPATIBILITY_MODE, SUPPRESS_DEPRECATIONS)
- **Meta-tool Deprecation Warnings**: `cyberchef_bake` and `cyberchef_search` now emit deprecation warnings when used

### Documentation
- **Release Notes** (`docs/releases/v1.8.0.md`): Comprehensive release notes for v1.8.0
- Updated README.md with v1.8.0 features and migration tools
- Updated CLAUDE.md with v1.8.0 version references
- Updated project roadmap to reflect Phase 3 progress

## [1.7.3] - 2025-12-17

### Added
- **Reference Documentation** (`docs/reference/`): 12 comprehensive security tool documentation files (~312KB total)
  - Master index `README.md` with navigation and categorization
  - 11 security tool reference documents: `ares.md`, `ciphey.md`, `cryptii.md`, `cyberchef-recipes.md`, `cyberchef-server.md`, `cyberchef-upstream.md`, `john-the-ripper.md`, `katana.md`, `pwntools.md`, `rsactftool.md`, `xortool.md`
  - Each document includes: project overview, key features, installation, usage examples, integration notes, and relevant algorithms
  - Purpose: Support v2.0.0 external project integration planning
- **External Project Integration Planning** (`docs/planning/ext-proj-int/`): 30 comprehensive planning documents (~23,600 lines)
  - **Overview**: `README.md` and `overview.md` - Integration strategy and architecture
  - **Phase Plans** (4 files): `phase-1-foundation.md`, `phase-2-js-native.md`, `phase-3-algorithm-port.md`, `phase-4-advanced.md`
  - **Sprint Plans** (12 files): Detailed task breakdowns for sprints 1.1 through 4.3
    - Phase 1: Tool registry infrastructure, testing framework extensions
    - Phase 2: cryptii integration, recipe presets, pwntools binary utilities
    - Phase 3: Ciphey auto-decode, xortool analysis, RsaCtfTool factorization, katana patterns
    - Phase 4: John hash ID, composite workflows, documentation and release
  - **Tool Integration Plans** (8 files): Per-tool integration strategies for Ciphey, cryptii, xortool, RsaCtfTool, John, pwntools, katana, recipes
  - **Technical Guides** (4 files): `tool-registration.md`, `algorithm-porting.md`, `testing-strategy.md`, `dependencies.md`
  - **Target**: v2.0.0+ with 80-120 new MCP tools from 8 security tool projects
  - **Timeline**: 24 weeks across 4 phases

### Changed
- **README.md**: Added new documentation sections
  - "v2.0.0 Integration Planning" section linking to external project integration docs
  - "Reference Documentation" section linking to security tool reference docs
  - Enhanced Roadmap section with v2.0.0 planning summary
- **Project Roadmap**: Updated Phase 2 to v1.7.3 and Phase 3 status to "Planning Complete"

## [1.7.2] - 2025-12-17

### Changed
- **CI Workflow**: Renamed "Core CI" to "MCP Server CI" for clarity on workflow purpose
- **CI Workflow**: Removed web UI production build step from MCP Server CI workflow (not needed for MCP-focused fork)

### Fixed
- **Codecov Integration**: Updated from deprecated `codecov/test-results-action@v1` to `codecov/codecov-action@v5` with `report_type: test_results` parameter
  - Ensures continued test analytics support as test-results-action is being deprecated
  - Uses same action for both coverage and test results uploads
- **Tests**: Fixed "Scan for embedded files" test to use existing test data file (`tests/node/sampleData/pic.jpg`)
  - Replaced missing `tests/samples/hello` with actual test file
  - Test now passes consistently
- **Documentation**: Corrected operation count from 464 to 463 in README.md
- **Documentation**: Updated coverage metrics to reflect current state (74.97% lines, 90.39% functions)

### Added
- **Test Coverage**: Expanded test suite from 343 to 493 tests across 13 test files
  - Added coverage improvement tests in `coverage-improvement.test.mjs` (68 tests)
  - Added real server handler integration tests in `real-server-handlers.test.mjs`
  - Added server integration tests in `server-integration.test.mjs`
  - Total test count: 493 tests covering all MCP server components
- **Documentation**: Added cleanup analysis scripts to `scripts/cyberchef-cleanup/` directory

## [1.7.1] - 2025-12-16

### Changed
- **Repository Structure**: Cleaned up 88 unused upstream files for MCP-focused codebase
  - Removed 81 web UI files from `src/web/` (stylesheets, fonts, images, UI components)
  - Removed 4 browser test files from `tests/browser/` (Nightwatch.js browser tests)
  - Removed 2 config files (`nightwatch.json` for browser testing, `postcss.config.js` for CSS processing)
  - Removed 1 `.devcontainer/devcontainer.json` for VS Code dev containers
  - Net reduction: ~19,260 lines of code
  - All MCP functionality preserved (343 tests still passing)
- **Upstream Sync Workflows**: Complete rewrite for selective file synchronization model
  - `upstream-monitor.yml`: Enhanced to work with `ref-proj/CyberChef/` directory structure for full upstream clone
  - `upstream-sync.yml`: Complete rewrite to copy only `src/core/operations/*.mjs` files from upstream
    - Prevents restoration of deleted web UI files during sync
    - Verifies no excluded files are copied to main codebase
    - Creates pull request for review instead of direct merge to master
    - Includes comprehensive testing before PR creation
  - `rollback.yml`: Enhanced with state comparison table and ref-proj rollback guidance
  - New sync philosophy: Selective file copying instead of git merge to preserve MCP-specific modifications
- **GitHub Templates**: Updated 5 issue and pull request templates with fork-specific references
  - Bug report template: Updated upstream repository references
  - Feature request template: Added context for MCP-specific features
  - Pull request template: Updated contribution guidelines
  - Issue templates: Clarified fork relationship with GCHQ/CyberChef
- **Configuration Files**: Multiple enhancements for project consistency and compliance
  - `CODE_OF_CONDUCT.md`: Updated enforcement contact from GCHQ to `doublegate@pm.me` for fork-specific reporting
  - `LICENSE`: Added fork notice header crediting both GCHQ (original CyberChef) and DoubleGate (MCP fork maintainer)
  - `eslint.config.mjs`: Fixed flat config structure with proper exports, added comprehensive MCP server documentation
  - `.editorconfig`: Added comprehensive file type configurations (JSON, YAML, Markdown, Shell scripts, etc.)
  - `.cspell.json`: Added 96 project-specific terms for accurate spell checking (CyberChef operations, MCP terminology, technical terms)

### Added
- **Documentation**: `docs/guides/upstream-sync-guide.md` - Comprehensive guide to selective upstream synchronization workflow (540 lines)
  - Explains selective sync model vs. full git merge approach
  - Documents file exclusion rules (88 files never synced from upstream)
  - Provides troubleshooting guidance for common sync issues
  - Includes workflow diagrams for monitor → sync → merge flow
  - Details testing strategy for pre-sync, during sync, and post-sync validation
  - Covers common scenarios: routine updates, manual sync, rollback, breaking changes

## [1.7.0] - 2025-12-16

### Added
- **Batch Processing (P0)**: Execute multiple operations in a single request
  - New tool: `cyberchef_batch` with parallel and sequential execution modes
  - Partial success support - operations continue even if some fail
  - Configurable batch size limit (default: 100 operations)
  - Environment variable: `CYBERCHEF_BATCH_MAX_SIZE`, `CYBERCHEF_BATCH_ENABLED`
  - BatchProcessor class for orchestrating batch execution
- **Telemetry & Analytics (P1)**: Privacy-first usage metrics collection
  - New tool: `cyberchef_telemetry_export` for exporting metrics in JSON or summary format
  - Metrics collected: tool name, duration, data sizes, success status, cache hits (NO input/output data)
  - Statistics: total calls, success rate, average duration, cache hit rate
  - TelemetryCollector class with configurable retention (10,000 metrics max)
  - Environment variable: `CYBERCHEF_TELEMETRY_ENABLED` (default: false - privacy-first)
- **Rate Limiting (P1)**: Sliding window rate limiting for resource protection
  - Per-connection request tracking with configurable limits
  - Automatic cleanup of expired timestamps
  - 429 error responses with retry-after information when limit exceeded
  - RateLimiter class implementing sliding window algorithm
  - Environment variables: `CYBERCHEF_RATE_LIMIT_ENABLED`, `CYBERCHEF_RATE_LIMIT_REQUESTS`, `CYBERCHEF_RATE_LIMIT_WINDOW`
  - Default: disabled (no restrictions by default)
- **Cache Enhancements (P2)**: New tools for cache inspection and management
  - New tool: `cyberchef_cache_stats` for real-time cache statistics
  - New tool: `cyberchef_cache_clear` for manual cache invalidation
  - Cache-enabled flag for disabling caching if needed
  - Environment variable: `CYBERCHEF_CACHE_ENABLED` (default: true)
- **Resource Quotas (P2)**: Track and enforce resource usage limits
  - New tool: `cyberchef_quota_info` for current quota and usage information
  - Concurrent operation tracking and enforcement
  - Total data size tracking (input/output volumes)
  - ResourceQuotaTracker class for quota management
  - Environment variable: `CYBERCHEF_MAX_CONCURRENT_OPS` (default: 10)
- **Test Coverage**: Added 32 new test cases for v1.7.0 features
  - TelemetryCollector: 5 tests
  - RateLimiter: 6 tests
  - ResourceQuotaTracker: 7 tests
  - BatchProcessor: 8 tests
  - Cache Enhancements: 4 tests
  - Integration Tests: 2 tests
  - Total tests increased from 311 to 343

### Changed
- **Integrated tracking into standard operations**: All operations now include telemetry, rate limiting, and quota tracking
- **Server startup logging**: Enhanced to display all v1.7.0 configuration options
- **Exports**: Added new classes and constants for testing
  - Classes: `TelemetryCollector`, `RateLimiter`, `ResourceQuotaTracker`, `BatchProcessor`
  - Constants: `BATCH_MAX_SIZE`, `BATCH_ENABLED`, `TELEMETRY_ENABLED`, `RATE_LIMIT_ENABLED`, etc.

### Security
- **Privacy-first defaults**: Telemetry disabled by default, no sensitive data collected
- **Rate limiting**: Protects against abuse when enabled
- **Resource quotas**: Prevents DoS attacks via resource exhaustion

## [1.6.2] - 2025-12-16

### Fixed
- **ESLint Errors**: Fixed 12 ESLint errors in test files
  - Removed unused imports (beforeEach, vi)
  - Fixed duplicate key in logger test
  - Fixed camelCase violations in recipe-validator tests
  - Fixed dot notation issue in recipe-validator tests
  - Added eslint-disable-next-line for intentionally unused loop variables
- **ENABLE_WORKERS Default**: Changed default from `true` to `false`
  - Worker threads are not yet implemented, so default should be disabled
  - Updated `src/node/mcp-server.mjs` to default to `false`
  - Updated configuration documentation in README.md and user guide
- **Configuration Documentation**: Updated all references to ENABLE_WORKERS
  - README.md: Updated default value and added clarification
  - docs/guides/user_guide.md: Updated default value and description

## [1.6.1] - 2025-12-16

### Added
- **Comprehensive Codecov Integration**: Complete coverage analytics, bundle analysis, and test analytics
  - **Coverage Analytics**: Automated coverage tracking with status checks on pull requests
    - V8 coverage provider generating lcov, JSON, HTML, and Cobertura reports
    - 70% minimum coverage threshold for project (lines, functions, statements)
    - 75% minimum coverage threshold for new code (patch coverage)
    - Flags for different test types (mcp-tests, core-tests, node-api)
    - Component-level coverage tracking (MCP Server, Core Operations, Node API)
  - **Bundle Analysis**: Webpack bundle size tracking and visualization
    - Integration with @codecov/webpack-plugin for automated uploads
    - Bundle size change detection in pull requests
    - Historical bundle size trends and optimization insights
    - Dry-run mode for local development without token
  - **Test Analytics**: JUnit XML test result reporting and analysis
    - Test performance tracking over time
    - Flaky test detection and identification
    - Test execution time monitoring and regression detection
  - **Configuration Files**:
    - `codecov.yml`: Coverage thresholds, status checks, PR commenting, path exclusions
    - Updated `vitest.config.mjs`: V8 coverage, JUnit XML reporter, coverage thresholds
    - Updated `.github/workflows/core-ci.yml`: Codecov action integration with test results upload
    - Updated `Gruntfile.js`: Webpack bundle analysis plugin configuration
  - **GitHub Actions Integration**:
    - Coverage upload using codecov/codecov-action@v5
    - Test results upload using codecov/test-results-action@v1
    - Bundle analysis triggered on production builds
    - All uploads include appropriate flags and metadata
  - **Documentation**:
    - `docs/guides/codecov-integration.md`: Comprehensive 400+ line integration guide
    - `CODECOV_INTEGRATION_SUMMARY.md`: Implementation summary
    - `CODECOV_VERIFICATION.md`: Verification guide

### Changed
- Enhanced test infrastructure to generate coverage and test result reports
- Updated `.gitignore` to exclude coverage artifacts (coverage/, test-results/, .nyc_output/)
- Updated README.md with comprehensive Codecov section in CI/CD documentation
- **Comprehensive Test Suite Expansion**: Increased from 274 to 311 tests (+37 tests)
  - Added 67 mcp-server.mjs unit tests covering core functionality
  - All 9 test files in `tests/mcp/` now provide full coverage of MCP server components
  - Test files: errors, logger, streaming, retry, recipe-validator, recipe-storage, recipe-manager, mcp-server, validation
- **Coverage Improvements**: All thresholds now met
  - Lines: 78.93% (threshold: 70%)
  - Statements: 78.7% (threshold: 70%)
  - Functions: 89.33% (threshold: 70%)
  - Branches: 74.68% (threshold: 65%)
- **mcp-server.mjs Exports**: Added testable exports for unit testing
  - `LRUCache` class for cache testing
  - `MemoryMonitor` class for memory monitoring tests
  - Utility functions: `sanitizeToolName`, `mapArgsToZod`, `resolveArgValue`, `validateInputSize`
  - Configuration constants: `VERSION`, `MAX_INPUT_SIZE`, `OPERATION_TIMEOUT`, cache settings

### Fixed
- Fixed `codecov.yml` validation error by removing deprecated `ui` field from configuration
- Fixed mcp-server.mjs 0% coverage by adding exports and updating tests to import actual implementations
- Fixed recipe-storage.mjs test isolation with `createEmptyStorage()` factory function for consistent timestamp generation

## [1.6.0] - 2025-12-16

### Added
- **Recipe Management System**: Comprehensive recipe storage and management
  - Save multi-operation recipes with names, descriptions, tags, and metadata
  - Recipe CRUD operations: create, read, update, delete
  - Recipe execution with saved configurations
  - Recipe composition: nest recipes within recipes
  - Recipe validation and complexity estimation
  - Circular dependency detection
  - Recipe library with 25+ curated examples across 5 categories
- **Recipe Import/Export**: Multi-format recipe portability
  - JSON format (native)
  - YAML format (human-readable)
  - URL format (shareable base64-encoded links)
  - CyberChef format (compatibility with upstream)
- **Recipe Validation Tools**: Pre-execution validation
  - Validate recipe structure without saving
  - Test recipes with sample inputs
  - Operation name and argument validation
  - Complexity and execution time estimation
- **New MCP Tools** (10 total):
  - `cyberchef_recipe_create` - Create new recipe
  - `cyberchef_recipe_get` - Retrieve recipe by ID
  - `cyberchef_recipe_list` - List recipes with filtering
  - `cyberchef_recipe_update` - Update existing recipe
  - `cyberchef_recipe_delete` - Delete recipe
  - `cyberchef_recipe_execute` - Execute saved recipe
  - `cyberchef_recipe_export` - Export to JSON/YAML/URL/CyberChef
  - `cyberchef_recipe_import` - Import from various formats
  - `cyberchef_recipe_validate` - Validate recipe structure
  - `cyberchef_recipe_test` - Test with sample inputs
- **Recipe Storage**: JSON file-based storage with atomic writes
  - In-memory caching for performance
  - Automatic backup creation
  - Recipe versioning (semver)
  - Storage statistics and metadata
- **Environment Variables**: New configuration options
  - `CYBERCHEF_RECIPE_STORAGE` - Storage file path (default: `./recipes.json`)
  - `CYBERCHEF_RECIPE_MAX_COUNT` - Maximum recipes (default: 10000)
  - `CYBERCHEF_RECIPE_MAX_OPERATIONS` - Max operations per recipe (default: 100)
  - `CYBERCHEF_RECIPE_MAX_DEPTH` - Max nesting depth (default: 5)

### Changed
- Updated MCP server version from 1.5.1 to 1.6.0
- Enhanced server initialization to include recipe manager setup
- Improved tool registration with 10 additional recipe management tools

### Fixed
- None

## [1.5.1] - 2025-12-15

### Added
- **Dual-Registry Publishing**: Images now published to both Docker Hub and GitHub Container Registry (GHCR)
  - Docker Hub: Primary distribution with Docker Scout health score monitoring
  - GHCR: Secondary distribution for GitHub ecosystem integration
  - Enables maximum accessibility and security transparency
- **Supply Chain Attestations**: Enhanced security compliance for Docker Hub images
  - Provenance attestation with `mode=max` for SLSA Build Level 3 compliance
  - SBOM attestation in SPDX-JSON format (in-toto)
  - Achieves optimal Docker Scout health score (grade A or B)
  - Attestations account for 15 points out of 100 in health score calculation
- **Docker Scout Health Score Optimization**: Resolved 'C' grade by adding missing attestations
  - Root cause: Missing provenance and SBOM attestations
  - Solution: Enabled attestation generation in GitHub Actions workflow
  - Expected improvement: 'C' → 'B' or 'A' health score
- **New Documentation Guides**:
  - `docs/guides/DOCKER_HUB_SETUP.md`: Quick start guide for Docker Hub publishing with attestations
  - `docs/guides/docker-scout-attestations.md`: Comprehensive guide to supply chain attestations, health scores, verification, and troubleshooting

### Changed
- **GitHub Actions Workflow Updates**:
  - `.github/workflows/mcp-release.yml`: Enhanced for dual-registry publishing
    - Added Docker Hub login step with `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets
    - Added metadata extraction for both GHCR and Docker Hub
    - Updated `docker/build-push-action` to v6 for attestation support
    - Added `provenance: mode=max` parameter for maximum build provenance detail
    - Added `sbom: true` parameter for automatic SBOM generation
    - Updated permissions to include `attestations: write` and `id-token: write`
    - Both attestations automatically attached to images in both registries
  - `.github/workflows/mcp-docker-build.yml`: Updated to v6 and added comprehensive documentation
    - Added detailed comments explaining attestation limitations with `load: true`
    - Clarified that attestations only work with registry push (not local Docker daemon)
- **README.md**: Major updates for dual-registry publishing
  - Updated Quick Start to prioritize Docker Hub as primary distribution
  - Added GHCR as alternative installation option
  - Enhanced Technical Highlights with dual-registry and attestation information
  - Expanded Supply Chain Security section with detailed attestation documentation
  - Added new documentation guides to User Guides section
  - Updated Repository Information with Docker Hub as primary registry

### Security
- **Enhanced Supply Chain Transparency**: Complete build provenance and SBOM for all releases
  - Verifiable supply chain integrity via SLSA provenance attestation
  - Complete dependency tree with version information via SBOM attestation
  - Supports compliance with security standards (SLSA, SSDF, SOC 2, ISO 27001)
- **Docker Hub Health Score**: Public visibility into security posture
  - Health score badge visible on Docker Hub repository
  - Detailed policy results available for review
  - Automated vulnerability scanning by Docker Scout

### Infrastructure
- **Required GitHub Secrets**: Two new secrets for Docker Hub publishing
  - `DOCKERHUB_USERNAME`: Docker Hub username
  - `DOCKERHUB_TOKEN`: Docker Hub access token with Read, Write, Delete permissions
- **Dual SBOM Strategy**: Comprehensive software bill of materials
  - Docker attestation SBOM: Attached to image manifest for registry-based validation
  - Trivy SBOM artifact: Standalone CycloneDX file for offline audits and compliance reporting

## [1.5.0] - 2025-12-15

### Added - Enhanced Error Handling and Observability
- **CyberChefMCPError Class**: Comprehensive error handling with error codes, context, and recovery suggestions
  - Error codes: `INVALID_INPUT`, `MISSING_ARGUMENT`, `OPERATION_FAILED`, `TIMEOUT`, `OUT_OF_MEMORY`, `UNSUPPORTED_OPERATION`, `CACHE_ERROR`, `STREAMING_ERROR`
  - Rich context capture (input size, operation name, request ID, timestamp)
  - Automatic recovery suggestions based on error type
  - Retryable vs non-retryable error classification
- **Structured Logging with Pino**: Production-ready JSON logging for observability
  - Log levels: `debug`, `info`, `warn`, `error`, `fatal`
  - Request correlation with UUID-based request IDs
  - Event types: `request_start`, `request_complete`, `request_error`, `cache_operation`, `memory_check`, `streaming_operation`, `retry_attempt`
  - Performance metrics: duration, input/output sizes, cache hits
  - Configurable via `LOG_LEVEL` environment variable
- **Automatic Retry Logic**: Exponential backoff for transient failures
  - Default 3 retry attempts for timeouts, memory issues, cache errors
  - Exponential backoff: 1s → 2s → 4s with jitter
  - Non-retryable errors fail immediately (invalid input, missing arguments)
  - Configurable via `CYBERCHEF_MAX_RETRIES`, `CYBERCHEF_INITIAL_BACKOFF`, `CYBERCHEF_MAX_BACKOFF`, `CYBERCHEF_BACKOFF_MULTIPLIER`
- **MCP Streaming Infrastructure**: Foundation for progressive results on large operations
  - Streaming strategy detection based on operation type and input size
  - Chunked streaming for encoding, hashing operations (Base64, Hex, MD5, SHA)
  - Progress reporting every 10MB
  - Configurable via `CYBERCHEF_STREAM_CHUNK_SIZE`, `CYBERCHEF_STREAM_PROGRESS_INTERVAL`
- **Circuit Breaker Pattern**: Protection against cascading failures
  - Opens after 5 consecutive failures
  - Reset timeout: 60 seconds
  - States: CLOSED, OPEN, HALF_OPEN
- **Request Correlation**: End-to-end tracking with UUID request IDs
  - Request IDs in all log entries
  - Request IDs in error messages
  - Duration tracking from start to completion

### Changed
- **Version bump**: `1.4.6` → `1.5.0` in `package.json` (mcpVersion) and `mcp-server.mjs`
- **Error Handling**: All errors now use `CyberChefMCPError` with structured formatting
- **Logging**: Replaced `console.error` with structured Pino logging throughout
- **Memory Monitoring**: Now uses structured logging instead of console output
- **Operation Execution**: All operations now include retry logic and request tracking
- **Cache Logging**: Cache hits/misses logged with structured events

### Dependencies
- **Added**: `pino@^9.6.0` for structured logging

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.5.0.md` with configuration examples
- **Environment variables**: 7 new configuration options documented
- **Migration guide**: Zero breaking changes, drop-in replacement for v1.4.6

### Performance
- **50% Better Error Recovery**: Automatic retry reduces manual intervention
- **Faster Debugging**: Structured logs with request IDs speed up troubleshooting
- **Reduced Downtime**: Circuit breaker prevents cascading failures
- **Better Observability**: JSON logs integrate with monitoring tools

### New Environment Variables
- `LOG_LEVEL`: Logging level (default: `info`)
- `CYBERCHEF_MAX_RETRIES`: Maximum retry attempts (default: `3`)
- `CYBERCHEF_INITIAL_BACKOFF`: Initial backoff delay in ms (default: `1000`)
- `CYBERCHEF_MAX_BACKOFF`: Maximum backoff delay in ms (default: `10000`)
- `CYBERCHEF_BACKOFF_MULTIPLIER`: Backoff multiplier (default: `2`)
- `CYBERCHEF_STREAM_CHUNK_SIZE`: Chunk size for streaming (default: `1048576`)
- `CYBERCHEF_STREAM_PROGRESS_INTERVAL`: Progress reporting interval (default: `10485760`)

### Success Metrics
- ✅ Enhanced error messages with context and suggestions
- ✅ Structured logs in JSON format for production monitoring
- ✅ Automatic retry for transient failures
- ✅ Request correlation with UUID tracking
- ✅ Streaming infrastructure for large operations
- ✅ All 1,933 unit tests passing
- ✅ All 465 MCP tool validations passing

## [1.4.6] - 2025-12-14

### Security - Sprint 1: Security Hardening
*   **Chainguard Distroless Base Image**: Migrated from `node:22-alpine` to `cgr.dev/chainguard/node:latest`
    *   **Zero-CVE Baseline**: Daily security updates with 7-day SLA for critical CVE patches
    *   **70% Smaller Attack Surface**: Minimal OS footprint (no shell, no package manager, only runtime dependencies)
    *   **SLSA Build Level 3 Provenance**: Verifiable supply chain integrity via Chainguard attestations
    *   **Multi-stage Build**: Uses `-dev` variant for compilation, distroless for production runtime
    *   **Non-Root Execution**: Runs as UID 65532 (nonroot user) in distroless environment
    *   Reduces container size from ~270MB (Alpine) to ~90MB (distroless)
*   **Security Scan Fail Thresholds**: Trivy scanner now configured to fail builds on vulnerabilities
    *   Added `exit-code: '1'` to `.github/workflows/mcp-docker-build.yml`
    *   Prevents images with CRITICAL or HIGH vulnerabilities from reaching production
    *   Enforces zero-tolerance security policy in CI/CD pipeline
*   **Read-Only Filesystem Support**: Container now fully supports `--read-only` mode
    *   Compliance-ready for PCI-DSS, SOC 2, FedRAMP immutable deployment requirements
    *   Requires tmpfs mount: `--tmpfs /tmp:rw,noexec,nosuid,size=100m`
    *   Documented in `Dockerfile.mcp` comments and README security section

### Added - Sprint 1: Security Hardening
*   **Dual SBOM Strategy**: Comprehensive supply chain transparency
    *   **Part 1**: Docker buildx attestations in `.github/workflows/mcp-release.yml`
        *   Provenance attestation (`mode=max`) for complete build process metadata
        *   SBOM attestation for automatic dependency tree generation
        *   Enables Docker Scout automated scanning and health score improvements ('C' → 'B' or 'A')
        *   Supports SLSA Level 2+ compliance for supply chain integrity
    *   **Part 2**: Trivy CycloneDX SBOM for offline compliance auditing
        *   Generated during release workflow
        *   Attached as release asset for verification and compliance reporting
        *   Complete dependency tree with version information
*   **Enhanced Error Logging**: Improved operational observability in `src/node/mcp-server.mjs`
    *   Added diagnostic logging for OperationConfig schema generation failures
    *   Logs operation name, tool name, argument count, and error message
    *   Does not disrupt MCP protocol communication
*   **Docker Build Context Optimization**: Enhanced `.dockerignore` file
    *   Added exclusions for generated files: `OperationConfig.json`, `modules/`, `index.mjs`
    *   Prevents permission conflicts during multi-stage builds
    *   Reduces build context size for faster image builds

### Changed - Sprint 1: Security Hardening
*   **Dockerfile.mcp**: Complete rewrite for Chainguard distroless base
    *   Stage 1: Uses `cgr.dev/chainguard/node:latest-dev` for building (includes npm, build tools)
    *   Stage 2: Uses `cgr.dev/chainguard/node:latest` for runtime (distroless, minimal attack surface)
    *   Added SlowBuffer compatibility patches for Node.js 22+ during build
    *   Optimized layer caching for faster rebuilds
    *   Runs as UID 65532 (nonroot user) instead of UID 1001
*   **GitHub Actions Workflow**: Upgraded Docker build action in `.github/workflows/mcp-release.yml`
    *   Updated from `docker/build-push-action@v5` to `@v6` for attestation support
    *   Added `provenance: mode=max` parameter for maximum build provenance detail
    *   Added `sbom: true` parameter for automatic SBOM generation
    *   Both attestations attached to container image and GHCR registry
*   **README.md**: Comprehensive security documentation updates
    *   Added "Latest Security Enhancements (v1.4.5 Sprint 1)" section
    *   Updated Quick Start with read-only filesystem example
    *   Enhanced "Secure Deployment" section with Chainguard-specific guidance
    *   Updated container size from ~270MB to ~90MB in Technical Highlights

### Performance - Sprint 1: Security Hardening
*   **Container Size Reduction**: 70% smaller image size (~270MB → ~90MB compressed)
    *   Faster image pulls from GHCR
    *   Reduced storage footprint for offline deployments
    *   Lower bandwidth requirements for CI/CD pipelines

## [1.4.5] - 2025-12-14

### Added
- **Docker Scout Supply Chain Attestations**: Enhanced container image security and transparency
  - Provenance attestation (mode=max) for verifiable build integrity
  - SBOM attestation automatically generated and attached to releases
  - Enables compliance with supply chain security standards (SLSA, SSDF)
  - Improves Docker Scout health score from 'C' to expected 'B' or 'A'
- **Documentation Organization**: New structured directory layout for improved navigation
  - `docs/architecture/` - Technical design documents (3 files)
  - `docs/guides/` - User-facing guides (2 files)
  - `docs/internal/` - Internal working documents (4 files)
  - `docs/planning/phases/` - Development phase breakdowns (7 files)
  - `docs/planning/strategies/` - Strategic planning documents (5 files)
  - `docs/planning/future-releases/` - Release specifications (23 files)
  - `docs/releases/` - Release notes (11 files)
  - `docs/security/` - Security documentation (3 files)

### Changed
- **GitHub Actions Workflow**: Upgraded Docker build action for attestation support
  - Updated from `docker/build-push-action@v5` to `@v6` in `mcp-release.yml`
  - Added `provenance: mode=max` parameter for maximum build provenance detail
  - Added `sbom: true` parameter for automatic SBOM generation
- **Documentation Structure**: Major reorganization of 39 files using `git mv` (history preserved)
  - Reduced root-level markdown files from 12 to 8
  - Created logical subdirectories under `docs/` for better organization
  - All internal links updated to reflect new paths
- **README.md**: Updated documentation section to reflect new organized structure
  - User Guides section links to `docs/guides/`
  - Technical Documentation section links to `docs/architecture/`
  - Project Management section links to `docs/planning/`
  - Strategic Planning section links to `docs/planning/strategies/`

### Fixed
- **Docker Scout Health Score**: Resolved 'C' rating due to missing attestations
  - Root cause: No provenance or SBOM attestations in container images
  - Solution: Enabled attestation generation in GitHub Actions workflow
  - Expected improvement: 'C' → 'B' or 'A' health score
- **Documentation Links**: Fixed all broken internal documentation links after reorganization
  - Updated paths in README.md, CLAUDE.md, and cross-references
  - Verified all links point to correct new locations

### Security
- **Build Provenance**: Verifiable supply chain integrity via SLSA provenance attestation
  - Records complete build process metadata (builder, materials, recipe)
  - Enables verification of artifact authenticity
  - Supports SLSA Level 2+ compliance
- **Software Transparency**: Comprehensive SBOM for dependency tracking
  - CycloneDX format SBOM automatically generated
  - Complete dependency tree with version information
  - Enables vulnerability tracking and compliance auditing

## [1.4.4] - 2025-12-14

### Fixed
- **Docker Hub Build**: Resolved webpack child compilation failures preventing Docker Hub CI/CD from building v1.4.2 and v1.4.3
  - Root cause: Corrupted import path in `@natlibfi/loglevel-message-prefix@3.0.1` package
  - Automated fix via postinstall script using sed to correct the import path
  - Cross-platform support for Linux and macOS
  - Prevents webpack child compiler failures in all 5 web workers
- **Docker Hub Build**: Optimized memory usage and webpack configuration for Docker Hub's constrained resources
  - Set `NODE_OPTIONS="--max-old-space-size=4096"` in Dockerfile
  - Reduced webpack parallelism to 1 to minimize resource contention
  - Made BundleAnalyzerPlugin resilient with `logLevel: "warn"`
  - Enhanced webpack stats with `children: true` for debugging visibility

### Security
- **Fixed 12 Code Scanning Vulnerabilities**: Comprehensive security hardening for web UI (PR #10)
  - **CRITICAL**: Fixed code injection vulnerability in `src/web/waiters/OutputWaiter.mjs`
  - **HIGH**: Enhanced XSS prevention with attribute allowlist
  - **HIGH**: Added comprehensive attribute value validation
  - **HIGH**: Enhanced protocol validation to prevent malicious URIs
  - All 12 vulnerabilities are in web UI code only - MCP server remains unaffected

### Added
- **GitHub Copilot Instructions**: Added comprehensive development guidance (PR #12)
  - Created `.github/copilot-instructions.md` with quick start workflow and code conventions
  - Created `.github/agents/copilot-instructions.md` for discovery
  - Includes architecture overview, development tasks, and troubleshooting
- **Grunt Task**: New `exec:fixLoglevelMessagePrefix` task in Gruntfile.js
  - Automatically fixes corrupted package on postinstall

### Changed
- **Version bump**: `1.4.3` → `1.4.4` in `package.json` and `mcp-server.mjs`
- **Webpack Configuration**: Enhanced debugging and reliability
  - Set `stats.children: true` to expose worker compilation errors
  - Added webpack ignore patterns for warnings
  - Reduced `parallelism: 1` for resource-constrained environments
- **Dockerfile**: Memory optimization for Docker Hub builds
  - Added `NODE_OPTIONS="--max-old-space-size=4096"` environment variable

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- Local build: SUCCESS (webpack 5.103.0 compiled in 98s)
- Docker build: SUCCESS (285MB image created)
- MCP server: All 465 tools operational


## [1.4.3] - 2025-12-14

### Fixed
- **Dependencies**: Resolved critical npm install failure caused by incompatible overrides
  - Removed problematic `rimraf@>=5.0.0` override that broke `grunt-contrib-clean` (rimraf v5+ has incompatible API)
  - Removed `inflight@>=2.0.0` override (version 2.0.0 does not exist)
  - Removed `glob@>=10.0.0` override (was conflicting with transitive dependencies)
- **Dependencies**: Removed unused `@babel/polyfill` dependency (not imported anywhere in source code)
- **Dependencies**: Added `glob@^10.5.0` as direct devDependency (required by Gruntfile.js)
- **Node.js**: Package-lock regenerated with Node.js 22 for full compatibility

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- CJS and ESM consumer tests passing
- npm install succeeds without errors on Node.js 22

## [1.4.2] - 2025-12-14

### Changed
- Replaced deprecated `loglevel-message-prefix` package with `@natlibfi/loglevel-message-prefix@^3.0.1`
- Updated all 5 worker files to use new logging package:
  - `src/core/ChefWorker.js`
  - `src/web/workers/DishWorker.mjs`
  - `src/web/workers/InputWorker.mjs`
  - `src/web/workers/LoaderWorker.js`
  - `src/web/workers/ZipWorker.mjs`

### Fixed
- **CI/CD**: Added browserslist database auto-update (`npx update-browserslist-db@latest`) to prevent outdated caniuse-lite warnings
  - Applied to `core-ci.yml` and `performance-benchmarks.yml` workflows
- **CI/CD**: Added git default branch configuration (`git config --global init.defaultBranch master`) to suppress Git 3.0 deprecation hints
  - Applied to all 5 workflow files (9 jobs total): `core-ci.yml`, `mcp-docker-build.yml`, `mcp-release.yml`, `performance-benchmarks.yml`, `security-scan.yml`

### Known Issues
- npm deprecation warnings remain for transitive dependencies that cannot be updated without breaking changes:
  - `bootstrap@4.6.2`, `bootstrap-colorpicker@3.4.0`, `popper.js@1.16.1` (web UI dependencies)
  - `glob@7.x/8.x`, `rimraf@2.7.1`, `inflight@1.0.6` (from grunt-contrib-clean and other build tools)
  - `@astronautlabs/amf@0.0.6` (node ^14 engine warning - informational only, package works on Node 22)

## [1.4.1] - 2025-12-14

### Security
- **Fixed 11 of 12 Code Scanning Vulnerabilities**: Comprehensive security hardening addressing ReDoS and cryptographic weaknesses
  - **CRITICAL**: Fixed insecure cryptographic randomness in `src/core/vendor/gost/gostRandom.mjs`
    - Replaced `Math.random()` with Node.js `crypto.randomBytes()` for cryptographic operations
    - Prevents predictable cryptographic key generation
    - Throws error if no secure RNG is available
  - **HIGH**: Fixed 7 Regular Expression Denial of Service (ReDoS) vulnerabilities across 6 operations
    - `src/core/operations/RAKE.mjs` (2 instances)
    - `src/core/operations/Filter.mjs`
    - `src/core/operations/FindReplace.mjs`
    - `src/core/operations/Register.mjs`
    - `src/core/operations/Subsection.mjs`
    - `src/core/operations/RegularExpression.mjs`
  - **LOW**: Documented 3 acceptable `Math.random()` usages in non-cryptographic contexts
    - `Numberwang.mjs` (trivia facts)
    - `RandomizeColourPalette.mjs` (color seeds)
    - `LoremIpsum.mjs` (placeholder text)
  - **DOCUMENTED**: Web UI code injection vulnerability (OutputWaiter.mjs) - Web UI only, not affecting MCP server

### Added
- **SafeRegex.mjs Security Module**: New centralized regex validation utility (`src/core/lib/SafeRegex.mjs`)
  - Pattern length validation (10,000 character maximum)
  - ReDoS pattern detection (nested quantifiers, overlapping alternations)
  - Timeout-based validation (100ms) to detect catastrophic backtracking
  - XRegExp and standard RegExp support
  - Exported functions: `validateRegexPattern()`, `createSafeRegExp()`, `createSafeXRegExp()`, `escapeRegex()`
- **GitHub Copilot Agent Support**: Added `.github/agents/copilot-instructions.md` to ensure GitHub Copilot Agents can discover and use custom instructions

### Changed
- **Regex operations**: All user-controlled regex patterns now validated through SafeRegex module
- **GOST cryptography**: Enhanced random number generation with secure fallback error handling

### Fixed
- **Security**: Eliminated ReDoS attack vectors preventing denial of service through malicious regex patterns
- **Security**: Cryptographic operations now use cryptographically secure random number generation exclusively

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- ESLint validation passing
- Manual testing with known ReDoS patterns confirms proper rejection
- Cryptographic operations verified using secure RNG

## [1.4.0] - 2025-12-14

### Added
- **Performance Optimization Infrastructure**: Comprehensive performance improvements for handling large operations
  - LRU cache for operation results (100MB default, configurable)
  - Buffer pooling for memory optimization
  - Memory monitoring with periodic logging
  - Input size validation (100MB max default, configurable)
  - Operation timeout enforcement (30s default, configurable)
- **Streaming API**: Automatic streaming for large inputs (>10MB threshold)
  - Chunked processing for memory efficiency
  - Supports encoding, compression, and hashing operations
  - Transparent fallback for non-streaming operations
  - Configurable via `CYBERCHEF_STREAMING_THRESHOLD` environment variable
- **Resource Limits**: Configurable limits for stability and security
  - Max input size: `CYBERCHEF_MAX_INPUT_SIZE` (default: 100MB)
  - Operation timeout: `CYBERCHEF_OPERATION_TIMEOUT` (default: 30s)
  - Cache size: `CYBERCHEF_CACHE_MAX_SIZE` (default: 100MB)
  - Cache items: `CYBERCHEF_CACHE_MAX_ITEMS` (default: 1000)
- **Performance Benchmark Suite**: Comprehensive benchmarking infrastructure
  - Tinybench-based benchmark suite with 20+ operations across 6 categories
    - Encoding (Base64, Hex)
    - Hashing (MD5, SHA256, SHA512)
    - Compression (Gzip)
    - Cryptographic (AES Encrypt)
    - Text (Regular Expression)
    - Analysis (Entropy, Frequency Distribution)
  - Multiple input size testing (1KB, 10KB, 100KB)
  - New script: `npm run benchmark`
  - CI/CD integration via `performance-benchmarks.yml` workflow
  - Automated benchmark execution on code changes
- **Worker Thread Infrastructure**: Foundation for CPU-intensive operation offloading
  - Identification of 25+ CPU-intensive operations including:
    - Cryptographic: AES, DES, RSA, Bcrypt, Scrypt
    - Hashing: SHA family, MD5, BLAKE2, Whirlpool
    - Compression: Gzip, Bzip2
    - Key generation: RSA, PGP
  - Infrastructure for future worker pool implementation
  - Configurable via `CYBERCHEF_ENABLE_WORKERS` environment variable

### Changed
- **Version bump**: `1.3.0` → `1.4.0` in `package.json` (mcpVersion field) and `mcp-server.mjs`
- **Server startup**: Enhanced logging with performance configuration display
  - Shows max input size, timeout, streaming threshold, cache settings
  - Better visibility into server capabilities
- **Operation execution**: All operations now benefit from caching and resource limits
  - Cache hit logging for debugging
  - Streaming detection and activation logging
  - Memory usage monitoring

### Performance
- **Memory efficiency**: LRU cache reduces redundant computation for repeated operations
- **Large input handling**: 100MB+ inputs processed via streaming without OOM errors
- **Latency improvements**: Cached operations return instantly
- **Resource protection**: Timeouts prevent runaway operations

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.4.0.md` with configuration examples and migration guide
- **Performance tuning guide**: `docs/performance-tuning.md` with deployment scenarios and optimization strategies
- **Benchmark documentation**: Usage instructions and CI integration details
- **Environment variables**: Complete reference for all 7 configuration options
- **README.md**: New "Performance & Configuration" section with examples for different deployment scenarios
- **Updated version references**: All documentation updated from v1.3.0 to v1.4.0

### Dependencies
- **Added**: `tinybench@^4.1.0` for performance benchmarking

### Success Metrics
- ✅ Process 100MB inputs successfully via streaming
- ✅ Memory monitoring and cache management operational
- ✅ Operation timeout enforcement working
- ✅ Benchmark suite integrated into CI/CD
- ✅ All 465 MCP tools validated and functional

## [1.3.0] - 2025-12-14

### Added
- **Upstream Release Monitoring**: Automated GitHub Actions workflow to detect new CyberChef releases
  - Runs every 6 hours via cron schedule
  - Creates GitHub issues for new releases with actionable next steps
  - Prevents duplicate notifications
  - Workflow: `.github/workflows/upstream-monitor.yml`
- **Automated Upstream Sync**: Complete automation for merging upstream changes
  - Triggered by issue label (`upstream-sync-approved`) or manual dispatch
  - Automatic merge of upstream CyberChef changes
  - Regenerates `OperationConfig.json` with Grunt
  - Applies Node 22 compatibility patches
  - Runs comprehensive test suite validation
  - Updates baseline for regression detection
  - Creates pull request with detailed changeset
  - Handles merge conflicts with manual intervention guidance
  - Workflow: `.github/workflows/upstream-sync.yml`
- **MCP Validation Test Suite**: Comprehensive Vitest-based testing
  - 465 total tool validations (463 operations + 2 meta-tools)
  - Meta-tool functionality tests (cyberchef_bake, cyberchef_search)
  - 50+ sample operation execution tests
  - Schema validation for all operations
  - Breaking change detection via baseline comparison
  - Performance benchmarks (10 operations in <1 second)
  - Error handling validation
  - Test file: `tests/mcp/validation.test.mjs`
  - New script: `npm run test:mcp`
- **Tool Baseline Tracking**: Regression detection system
  - Complete inventory of 465 tools with metadata
  - Operation schemas and argument types
  - Version tracking for compatibility
  - Baseline file: `tests/mcp/baseline.json`
- **Emergency Rollback Mechanism**: Manual workflow for quick reversion
  - Rolls back to specified commit or parent
  - Regenerates configurations automatically
  - Runs full test suite for validation
  - Creates rollback PR with detailed summary
  - Workflow: `.github/workflows/rollback.yml`
- **Vitest Configuration**: Modern testing framework integration
  - Isolated MCP test execution
  - Node environment with ESM support
  - 10-second timeout for slow operations
  - Config file: `vitest.config.mjs`

### Changed
- **Version bump**: `1.2.6` → `1.3.0` in `package.json` (mcpVersion field) and `mcp-server.mjs`
- **Testing infrastructure**: Added Vitest alongside existing test framework
  - New devDependency: `vitest@^1.0.0`
  - Separate test suite prevents conflicts with existing tests

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.3.0.md` with usage examples
- **Workflow documentation**: Detailed usage instructions for all three workflows
- **Test documentation**: Coverage metrics and execution guidelines
- **Version references**: Updated across README.md, user_guide.md, SECURITY.md

### Success Metrics
- ✅ Zero manual intervention for patch/minor updates
- ✅ Automated PR creation within 24 hours of upstream release
- ✅ Comprehensive test validation (465 tools)
- ✅ Rollback capability tested and documented
- ✅ OperationConfig regeneration automated in CI

### Security
- All workflows follow GitHub Actions security best practices
- Environment variables used for all dynamic inputs
- No direct interpolation of user-controlled data
- Token permissions scoped to minimum required
- Input sanitization for workflow_dispatch parameters

## [1.2.6] - 2025-12-14

### Changed
- **Dockerfile** (web app): Optimized nginx base image for smaller footprint and improved security
  - Changed from `nginx:stable-alpine` to `nginx:1.29-alpine-slim`
  - `alpine-slim` variant provides reduced image size with minimal attack surface
  - Explicit nginx version pinning for reproducible builds
- **Dockerfile** (web app): Enhanced non-root permission setup for alpine-slim variant
  - Added explicit creation of nginx cache directories (`/var/cache/nginx/*`)
  - Added proper ownership for `/var/run` and `/run` directories
  - Fixed `permission denied` errors for nginx PID file and cache directories
  - Ensures proper non-root execution with nginx user in alpine-slim environment

### Fixed
- **nginx:alpine-slim compatibility**: Resolved permission denied errors for non-root nginx execution
  - Root cause: `alpine-slim` variant has stricter default permissions than standard `alpine`
  - Fixed cache directory permissions: `mkdir -p` for client_temp, proxy_temp, fastcgi_temp, uwsgi_temp, scgi_temp
  - Fixed PID file permissions: `chown -R nginx:nginx /var/run && chown -R nginx:nginx /run`

### Documentation
- Updated version references across all documentation files
- Added v1.2.6 to release notes index
- Updated download URLs and installation instructions

## [1.2.5] - 2025-12-14

### Security
- **Fixed 5 GitHub Security code scanning alerts**:
  - **DS026**: Added HEALTHCHECK to original `Dockerfile` (web app) for container orchestration
  - **DS002**: Added non-root user (nginx) execution to original `Dockerfile` (web app)
  - **CVE-2025-64756**: Updated npm in `Dockerfile.mcp` to fix glob command injection vulnerability (glob 10.4.5 → 10.5.0+)
  - **js/insufficient-password-hash** (x2): Dismissed as false positive - DeriveEVPKey intentionally implements OpenSSL EVP_BytesToKey for compatibility, NOT password storage. Users should use Argon2/bcrypt/scrypt operations for secure password hashing.
- **Argon2 operation hardened to OWASP 2024-2025 recommendations**:
  - Default type changed from Argon2i → **Argon2id** (hybrid side-channel + GPU resistance)
  - Default memory increased from 4 MiB → **19 MiB** (OWASP minimum recommendation)
  - Default iterations adjusted to **2** (OWASP recommended for 19 MiB memory)
  - Added OWASP recommendation note to operation description
  - Reference: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### Changed
- **Dockerfile** (web app): Security hardening overhaul
  - Added OCI metadata labels
  - Added non-root user execution (nginx user)
  - Added HEALTHCHECK instruction for container orchestration
  - Added EXPOSE 80 declaration
  - **Upgraded Node.js 18 → Node.js 22** for build stage (crypto global + ES module support)
  - Added SlowBuffer compatibility patches for Node.js 22
- **Dockerfile.mcp**: Added npm update to fix bundled glob CVE-2025-64756
- **.dockerignore**: Expanded exclusions to prevent unnecessary files in MCP container
  - Excludes original `Dockerfile` to prevent Trivy alerts on web app Dockerfile in MCP container
  - Added IDE, test, and temporary file exclusions for smaller container image
- **babel.config.js**: Updated from `@babel/plugin-syntax-import-assertions` to `@babel/plugin-syntax-import-attributes`
  - Fixes ES2024 import attributes syntax (`with { type: "json" }`)
  - Enables proper Webpack parsing of JSON imports
- Version bump: `1.2.0` → `1.2.5` in `package.json`, `mcp-server.mjs`, and documentation

### Fixed
- **Docker Hub build failure**: Fixed `ReferenceError: crypto is not defined` during web app Dockerfile build
  - Root cause: Node.js 18 lacks global `crypto` object (added in Node.js 19+)
  - Solution: Upgraded builder stage from `node:18-alpine` to `node:22-alpine`
- **Webpack build failure**: Fixed `Module parse failed: Unexpected token` for JSON imports
  - Root cause: Babel's `@babel/plugin-syntax-import-assertions` doesn't support ES2024 `with` syntax
  - Solution: Switched to `@babel/plugin-syntax-import-attributes` with `deprecatedAssertSyntax` option

## [1.2.0] - 2025-12-14

### Security
- **Non-root container execution**: Container now runs as dedicated `cyberchef` user (UID 1001)
  - Prevents privilege escalation attacks
  - Reduces impact of container escape vulnerabilities
- **Automated vulnerability scanning**: Integrated Trivy for container and dependency scanning
  - Scans on every push, pull request, and release
  - Weekly scheduled scans for newly discovered CVEs
  - Results uploaded to GitHub Security tab (SARIF format)
- **SBOM generation**: Software Bill of Materials (CycloneDX format) generated for each release
  - Attached to GitHub releases for supply chain transparency
  - Enables dependency tracking and compliance
- **Read-only filesystem support**: Container compatible with `--read-only` flag
  - Enables immutable deployments
  - Reduces attack surface
- **Security policy**: Added comprehensive `SECURITY.md` with vulnerability reporting guidelines

### Added
- **New CI workflow**: `.github/workflows/security-scan.yml` for automated security scanning
  - Trivy container vulnerability scanning
  - Trivy filesystem/dependency scanning
  - npm audit results collection
  - SBOM generation as artifact
- **Container health check**: Built-in Docker HEALTHCHECK for orchestration
- **OCI metadata labels**: Standard container labels for documentation and provenance
- **Security documentation**: Enhanced user guide with security best practices section

### Changed
- **Dockerfile.mcp**: Complete security hardening overhaul
  - Added non-root user creation (cyberchef:cyberchef, UID/GID 1001)
  - Added OCI image labels for metadata
  - Added security comments and documentation
  - Removed unnecessary files from production image (tests, docs, config files)
  - Added HEALTHCHECK instruction
- **mcp-docker-build.yml**: Added Trivy scanning and non-root verification
- **mcp-release.yml**: Added SBOM generation and attachment to releases
  - Added automatic GitHub Release creation for version tags
  - Fixed Docker image tag handling for tarball export (uses `latest` tag)
- **README.md**: Updated security section with v1.2.0 hardening features
- **user_guide.md**: Added comprehensive security best practices section
- **CodeQL Action v3 → v4**: Migrated all workflows from deprecated CodeQL v3 to v4
  - `codeql.yml`: `init@v4` and `analyze@v4`
  - `security-scan.yml`: `upload-sarif@v4` (2 occurrences)
  - `mcp-docker-build.yml`: `upload-sarif@v4`
  - `mcp-release.yml`: `upload-sarif@v4`
- Updated all version references from v1.1.0 to v1.2.0

### Fixed
- **mcp-release.yml**: Fixed Docker image tag mismatch preventing release asset generation
  - `docker/metadata-action` generates tags without 'v' prefix (e.g., `1.2.0` not `v1.2.0`)
  - Changed to use `latest` tag for docker pull, save, and Trivy scans
- **mcp-release.yml**: Fixed missing GitHub Release creation before asset uploads
  - Workflow now automatically creates release if it doesn't exist
  - Uses `gh release create` with `--verify-tag` for safety

### Documentation
- **Comprehensive product roadmap v1.1.0 to v3.0.0** spanning 19 releases across 6 development phases
  - `docs/ROADMAP.md`: Master roadmap with Gantt timeline, release overview, and LTS strategy
  - 19 release plans (`docs/planning/release-v1.2.0.md` through `release-v3.0.0.md`)
  - 6 phase/sprint documents covering Q1 2026 through Q3 2027
- **Strategy documents** for major architectural initiatives:
  - `UPSTREAM-SYNC-STRATEGY.md`: Automated CyberChef update monitoring via Renovate/GitHub Actions
  - `SECURITY-HARDENING-PLAN.md`: Docker Hardened Images, non-root execution, Trivy scanning, SBOM
  - `MULTI-MODAL-STRATEGY.md`: Binary data, image, and audio handling through MCP protocol
  - `PLUGIN-ARCHITECTURE-DESIGN.md`: Custom operation registration with sandboxed execution
  - `ENTERPRISE-FEATURES-PLAN.md`: OAuth 2.1, RBAC, audit logging, multi-tenancy
- **Extended task tracker** with 500+ tasks organized by release (v1.2.0 - v3.0.0)
- New "Project Roadmap" section in README with phase overview table

## [1.1.0] - 2025-12-13

### Security
- **Fixed 11 vulnerabilities** (5 code scanning + 2 dependency + 4 npm audit fixes)
  - CWE-116: Incomplete string escaping in `Utils.mjs`, `PHPDeserialize.mjs`, and `JSONBeautify.mjs`
  - CWE-79: Cross-site scripting (XSS) in `BindingsWaiter.mjs`
  - CWE-916: Insufficient password hash iterations in `DeriveEVPKey.mjs` (now 10,000 minimum)
  - CVE-2024-55565: Removed `babel-plugin-transform-builtin-extend` (prototype pollution)
  - GHSA-64g7-mvw6-v9qj: Added `shelljs@>=0.8.5` override (command injection)
  - Updated `@modelcontextprotocol/sdk` to 1.24.3 (DNS rebinding fix)
  - Updated `@babel/helpers` and `@babel/runtime` to 7.28.4 (ReDoS fixes)
  - Updated `body-parser`, `brace-expansion`, `jws` via npm audit
- **Enhanced password hashing**: Increased DeriveEVPKey minimum iterations from 1,000 → 10,000 (NIST SP 800-63B compliance)
- **XSS protection**: Replaced `innerHTML` with safe DOM API methods (`textContent`, `createElement`)
- **String escaping**: Implemented proper two-step escaping pattern (backslashes first, then quotes)
- **Vulnerability reduction**: 76% overall (16 of 21 vulnerabilities fixed)
- **Production MCP server runtime**: Low Risk (5 remaining issues in dev dependencies only)

### Added
- **Docker image tarball distribution** for offline installation (approximately 270MB compressed)
  - Automated tarball export in `mcp-release.yml` workflow
  - Pre-built images available as release assets on GitHub Releases
  - Enables installation without GHCR access via `docker load`
- Node.js version badge to README
- Docker badge to README
- Claude Desktop client configuration section in README
- Comprehensive security section in README documenting 76% vulnerability reduction
- Enhanced documentation structure with categorized links (User, Technical, Project Management, Security)
- Testing section in README with npm test commands
- CI/CD workflow links and descriptions in README
- Repository information section with GHCR and issue tracker links
- Development workflow guidelines in Contributing section
- Option to pull pre-built Docker images from GHCR in Quick Start
- **Offline installation instructions** in README with tarball download steps
- Created `CLAUDE.md` project guidance file for Claude Code AI assistant
- Created `.github/SECURITY_MAINTENANCE.md` ongoing security procedures guide
- Created `.github/copilot-instructions.md` for GitHub Copilot
- Created `scripts/fix-serialize-javascript.js` automated patch for Node.js 22+ compatibility
- Added `mcpVersion` field to `package.json` (separate from CyberChef version)

### Changed
- Enhanced README with security highlights and production-ready status
- Improved README badges with more descriptive labels
- Updated Quick Start section to prioritize GHCR image over building from source
- Expanded Technical Highlights section with security and CI/CD information
- Reorganized Documentation section with clear categorization
- Enhanced Contributing section with detailed workflow and expectations
- Documentation reorganization:
  - Created `docs/planning/` directory (moved `to-dos/roadmap.md` and `to-dos/tasks.md`)
  - Created `docs/releases/` directory (moved `RELEASE_NOTES.md` → `docs/releases/v1.0.0.md`)
  - Created `docs/security/` directory (moved `SECURITY_AUDIT.md` → `docs/security/audit.md`)
- Updated all documentation references to reflect new paths
- Improved CHANGELOG.md formatting and organization
- Updated `.gitignore` to exclude Docker tarballs and CLAUDE.local.md

### Fixed
- README documentation links to reflect new directory structure (`docs/planning/`, `docs/security/`, `docs/releases/`)
- **Node.js 22 compatibility**: Fixed `serialize-javascript` compatibility with automated patch
- **Build process**: Corrected test expectations for DeriveEVPKey (10,000 iterations)
- **CI workflows**: All 5 GitHub Actions workflows verified passing
- JWT and JPath test failures (updated RSA keys to 2048 bits, fixed ES384/ES512 curves)

### Removed
- `babel-plugin-transform-builtin-extend` from dependencies (deprecated, security risk)
- `GEMINI.md` file (consolidated guidance into CLAUDE.md and copilot-instructions.md)

### Breaking Changes
- **DeriveEVPKey minimum iterations increased to 10,000** (NIST SP 800-63B compliance)
  - Users specifying `<10,000` iterations will receive secure minimum with warning
  - Update recipes using DeriveEVPKey with low iteration counts

## [1.0.0-post-security] - 2025-12-13

### Security
- **Fixed 7 vulnerabilities** (5 code scanning + 2 dependency)
  - CWE-116: Incomplete string escaping in `Utils.mjs`, `PHPDeserialize.mjs`, and `JSONBeautify.mjs`
  - CWE-79: Cross-site scripting (XSS) in `BindingsWaiter.mjs`
  - CWE-916: Insufficient password hash iterations in `DeriveEVPKey.mjs`
  - Prototype pollution in `babel-plugin-transform-builtin-extend`
  - Command injection in `shelljs` (via transitive dependency)
- **Enhanced password hashing**: Increased DeriveEVPKey default iterations from 1 → 10,000 (NIST SP 800-132 compliance)
- **Runtime enforcement**: Added minimum iteration count of 1,000 with validation and user warnings
- **XSS protection**: Replaced `innerHTML` with safe DOM API methods (`textContent`, `createElement`)
- **String escaping**: Implemented proper two-step escaping pattern (backslashes first, then quotes)
- **Dependency hardening**: Added npm overrides for `shelljs@>=0.8.5`

### Changed
- Documentation reorganization:
  - Created `docs/planning/` directory (moved `to-dos/roadmap.md` and `to-dos/tasks.md`)
  - Created `docs/releases/` directory (moved `RELEASE_NOTES.md` → `docs/releases/v1.0.0.md`)
  - Created `docs/security/` directory (moved `SECURITY_AUDIT.md` → `docs/security/audit.md`)
  - Removed `GEMINI.md` (consolidated into existing AI assistant instructions)
- Updated `CLAUDE.md` with new directory structure and documentation sections
- Updated all documentation references to reflect new paths

### Fixed
- **Node.js 22 compatibility**: Fixed `serialize-javascript` compatibility and updated test expectations
- **Build process**: Corrected test expectations for serialization output format
- **Dependency conflicts**: Resolved version mismatches and deprecated package usage

### Removed
- `babel-plugin-transform-builtin-extend` from dependencies (deprecated, security risk)
- `GEMINI.md` file (consolidated guidance)

## [1.0.0] - 2025-11-20

### Added - Major MCP Server Transformation
This release marks the transformation of the CyberChef repository into a fully functional Model Context Protocol (MCP) Server.

#### MCP Server Implementation
- New entry point `src/node/mcp-server.mjs` using `@modelcontextprotocol/sdk`
- Stdio transport support for CLI and IDE integration
- `cyberchef_bake` meta-tool for executing complex multi-stage recipes
- 300+ dynamically generated atomic operation tools (e.g., `cyberchef_aes_decrypt`, `cyberchef_to_base64`)
- `cyberchef_search` utility for operation discovery
- Zod-based schema validation for all tool inputs

#### Containerization
- `Dockerfile.mcp` based on `node:22-alpine`
- Automated CyberChef configuration generation in container build
- Optimized multi-stage build process
- SlowBuffer compatibility patches for Node.js 22+

#### CI/CD Pipelines
- `mcp-docker-build.yml`: Automated Docker container builds on every push
- `mcp-release.yml`: Automated GHCR publishing on version tags
- `core-ci.yml`: Maintains stability of underlying CyberChef logic
- `codeql.yml`: Automated security scanning
- `pull_requests.yml`: PR validation workflow

#### Documentation
- Complete README rewrite focused on MCP usage
- `docs/architecture.md`: Technical design documentation
- `docs/user_guide.md`: Installation and client configuration guide
- `docs/commands.md`: Comprehensive tool reference
- `docs/technical_implementation.md`: Implementation details
- `docs/project_summary.md`: Project overview
- `docs/releases/v1.0.0.md`: Release notes

### Changed
- Refactored all JSON imports to use modern `import ... with { type: "json" }` syntax (Node.js 22+)
- Patched `avsc` and `buffer-equal-constant-time` for SlowBuffer deprecation
- Updated core CI workflows to support Node.js v22
- Migrated from legacy CyberChef web app focus to MCP server focus

### Fixed
- Node.js v22 compatibility issues with deprecated APIs
- ES Module import syntax for JSON files
- SlowBuffer usage in legacy dependencies

---

## Original CyberChef History

<details>
    <summary>Click to expand version history of the original CyberChef Web App (up to v10.19.4)</summary>

### [10.19.0] - 2024-06-21
- Add support for ECDSA and DSA in 'Parse CSR' [@robinsandhu] | [#1828]
- Fix typos in SIGABA.mjs [@eltociear] | [#1834]

*(Previous history truncated for brevity - refer to the original repository for full history)*
</details>
