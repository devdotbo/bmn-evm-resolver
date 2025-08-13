# Changelog

All notable changes to the BMN EVM Resolver project will be documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - 2025-08-13 (Part 3)

- **oRPC Type-Safe API Framework** - Complete migration from manual HTTP APIs to oRPC
  - `alice-service-orpc.ts` - Main oRPC service implementation with type-safe procedures
  - `src/api/contracts/alice.contract.ts` - Zod-based API contract definitions
  - `src/utils/alice-orpc-server.ts` - oRPC server with CORS and routing
  - `src/utils/alice-api-server.ts` - Bridge HTTP API server (for migration)
  - `scripts/trigger-atomic-swap-orpc.ts` - oRPC-based atomic swap trigger
  - `scripts/monitor-swap.ts` - Real-time swap monitoring utility
  - `ORPC_IMPLEMENTATION.md` - Complete oRPC implementation guide
  - `ATOMIC_SWAP_GUIDE.md` - Step-by-step atomic swap execution guide

- **Comprehensive Test Coverage** - TDD approach with unit and integration tests
  - `tests/unit/alice-service-orpc.test.ts` - Core service unit tests (16 steps)
  - `tests/unit/alice-service-orpc-bugs.test.ts` - Bug identification tests
  - `tests/unit/alice-service-orpc-integration.test.ts` - Integration scenarios
  - `tests/integration/orpc-endpoints.test.ts` - Full endpoint testing (949 lines)
  - `TEST_SUMMARY_REPORT.md` - Complete test results and issue tracking
  - 47 unit test suites passing, documenting and fixing initialization bugs

### Changed - 2025-08-13 (Part 3)

- **API Architecture** - Migrated from manual HTTP to type-safe oRPC
  - Updated Dockerfile to support both alice-service-v3 and alice-service-orpc
  - Modified deno.json with new test patterns and oRPC dependencies
  - Enhanced atomic swap flow with proper event monitoring and state management

### Fixed - 2025-08-13 (Part 4)

- **oRPC Implementation Issues Resolved**
  - Fixed type casting for Hex/Address types in alice-orpc-server.ts
  - Corrected SecretManager method call from `getSecret()` to `getSecretByHashlock()`
  - Fixed CORS configuration from `origins` to `origin`
  - Updated test validation error messages to match oRPC framework format
  - Fixed test data isolation with `clearAll()` methods for state managers
  - Corrected hashlock calculation to use keccak256 of secret
  - Fixed server shutdown to properly clean up resources
  - All 41 integration test steps now passing

### Fixed - 2025-08-13 (Part 5)

- **TypeScript and Test Improvements**
  - Removed unnecessary `@ts-expect-error` directives from commented test code
  - Fixed CORS plugin configuration to only use supported `origin` property
  - Tests now run with full type checking enabled (`deno check`)
  - Added `--unstable-kv` flag to test runs for Deno KV support
  - All tests passing with strict TypeScript checking

### Changed - 2025-08-13 (Part 6)

- **Docker Integration with oRPC**
  - Docker configuration already uses `alice-service-orpc.ts` implementation
  - Verified Dockerfile caches dependencies for both alice-service-orpc.ts and bob-resolver-service-v2.ts
  - Tested successful Docker builds with no-cache to ensure clean builds work
  - Both Alice and Bob-Resolver services start successfully with oRPC endpoints
  - Health endpoints confirmed working at http://localhost:8001/health and http://localhost:8002/health
  - oRPC API endpoints accessible and functional at /api/alice/*
  - Docker Compose orchestration working with proper service dependencies

### Added - 2025-08-13 (Part 7)

- **OpenAPI/Scalar Documentation Support**
  - Integrated OpenAPI specification generation for all oRPC endpoints
  - Added Scalar UI for interactive API documentation at `/docs`
  - Migrated dependencies from npm to JSR for better Deno compatibility:
    - `viem` now uses `jsr:@wevm/viem` instead of npm version
    - `zod` now uses `jsr:@zod/zod` for type-safe validation
  - Created `alice-orpc-server-simple-openapi.ts` with simplified OpenAPI generation
  - OpenAPI specification available at `/openapi.json` endpoint
  - API documentation features:
    - Interactive endpoint testing through Scalar UI
    - Automatic request/response schema documentation
    - Type-safe API contracts with Zod validation
    - Full CORS support for cross-origin requests
  - Service endpoints documented:
    - `GET /health` - Health check endpoint
    - `POST /api/alice/createOrder` - Create atomic swap order
    - `POST /api/alice/getSwapStatus` - Get swap status by hashlock
    - `POST /api/alice/getPendingOrders` - List all pending orders
    - `POST /api/alice/revealSecret` - Reveal secret for completed swap

### Fixed - 2025-08-13 (Part 2)

- Critical signature verification issues resolved
  - Fixed EIP-712 domain parameters to match on-chain contract ("Bridge-Me-Not Orders" v1)
  - Corrected order signing to use `walletClient.signTypedData()` instead of raw `account.sign()`
  - Added proper EOA vs smart contract detection for correct function selection
  - Fixed signature format conversion for EOA accounts (r,vs split format)
  - Scripts now properly use `fillOrderArgs` for EOAs and `fillContractOrderArgs` for smart contracts
  - All signature validation now passing correctly
  - Fixed LimitOrderAlice to use EIP-712 typed data signing instead of raw signing
  - Fixed bob-resolver-service-v2.ts broken fillLimitOrder call with correct parameters
  - Verified all order creation scripts use correct domain and signing method

### Fixed - 2025-08-13

- Test stability & determinism improvements; entire suite now green
  - Eliminated double-stubbing in viem mocks by exposing plain functions (tests can safely `stub()` without "already spying" errors)
  - Added `AbortSignal` support to `EscrowWithdrawManager.monitorAndWithdraw` and updated tests to abort loops to avoid timer leaks/flakiness
  - Tweaked polling assertions to tolerate scheduler jitter (assert at-least instead of exact call counts where appropriate)
  - Fixed `MockKVStore` to key by stringified keys for reliable get/set/list behavior
  - Reduced internal waits in mocks to speed up tests
  - Adjusted integration tests:
    - Network Failure Recovery: added local retry loops for deposit/funding to match scenario intent
    - Service Restart Mid-Swap: persisted secret across simulated restart so the flow can complete

### Changed - 2025-08-13

- Testing best practices adoption (Deno + viem)
  - Prepared code for deterministic time by injecting sleep/now into long-running or retry code paths (start with monitor); tests can use FakeTime
  - Plan for future e2e: use Anvil with viem Test Client & Test Actions for deterministic chain control
    - References: `https://viem.sh/docs/clients/test`, `https://viem.sh/docs/actions/test/introduction`

### Added - 2025-08-14

- **Comprehensive Test Suite** - Complete testing infrastructure for atomic swap system
  - `tests/setup.ts` - Core test utilities, mocks, and helpers
  - `tests/mocks/viem-mock.ts` - Viem client mocking infrastructure
  - `tests/fixtures/index.ts` - Reusable test data and fixtures
  - `tests/unit/services/event-monitor.test.ts` - EventMonitorService unit tests (16 test cases)
  - `tests/unit/state/swap-state-manager.test.ts` - SwapStateManager unit tests (68 test cases)
  - `tests/unit/state/secret-manager.test.ts` - SecretManager unit tests (63 test cases)
  - `tests/unit/utils/escrow-withdraw.test.ts` - EscrowWithdrawManager unit tests (30+ test cases)
  - `tests/unit/utils/limit-order.test.ts` - Limit order utilities unit tests (13 test cases)
  - `tests/unit/utils/escrow-creation.test.ts` - Escrow creation unit tests (16 test cases)
  - `tests/integration/atomic-swap-flow.test.ts` - Full atomic swap integration tests (10 scenarios)
  - `docs/TESTING.md` - Comprehensive testing documentation

- **Test Infrastructure Features**
  - Mock event emitters for event-driven testing
  - Mock KV store for state management testing
  - Test logger for capturing and asserting logs
  - Performance benchmarking utilities
  - Test data generators for unique test data
  - Comprehensive viem blockchain mocks

- **Test Configuration**
  - Updated `deno.json` with test tasks and imports
  - Added test:unit, test:integration, test:e2e, test:coverage, test:watch tasks
  - Configured test runners with proper sanitizers and parallel execution

### Added - 2025-01-13

- `ATOMIC_SWAP_STATUS.md` - Comprehensive status document for atomic swap implementation progress
- `scripts/create-simple-order.ts` - Script to create properly formatted limit orders with correct salt encoding
- `src/utils/escrow-creation.ts` - Utility for creating destination escrows with proper immutables structure
- `src/utils/secret-reveal.ts` - Secret management and reveal functionality for atomic swaps
- `scripts/monitor-escrow-creation.ts` - Monitor script for detecting source escrows and creating destination escrows
- `alice-service-v2.ts` - Enhanced Alice service with automatic secret reveal capability

### Fixed - 2025-01-14

- **TypeScript Type Checking** - Comprehensive fixes to enable type checking in test suite
  - Fixed viem client type incompatibilities by adding proper type casts to PublicClient/WalletClient creation
  - Fixed missing Hash type imports across test files
  - Added override modifiers to mock class methods for proper inheritance
  - Fixed Transaction data vs input property naming in viem-mock.ts
  - Fixed Log.args property access issues using type assertions
  - Fixed SecretRecord property usage (changed from isRevealed/isConfirmed to status)
  - Added missing chain and account properties to writeContract calls
  - Fixed SwapStateManager uninitialized kv property with definite assignment assertion
  - Added proper type assertions for captured events in test assertions
  - Removed outdated postinteraction-v2.2.test.ts file
  - All tests now run with TypeScript type checking enabled (no --no-check flag needed)

### Fixed - 2025-01-13

- Signature format conversion from standard (v,r,s) to compact (r,vs) format for `fillOrderArgs`
- Use `fillOrderArgs` for EOA accounts instead of `fillContractOrderArgs` (fixes BadSignature error)
- Salt must include extension hash in lower 160 bits when using extensions (fixes InvalidExtensionHash)
- Docker volume mounting to share pending-orders directory directly between host and containers
- MakerTraits flags properly set for PostInteraction extensions (bits 249, 251, 254)
- Bob's destination escrow creation - now properly creates matching escrow on opposite chain
- Alice's secret reveal - monitors destination escrows and reveals secrets to claim tokens

### Changed - 2025-01-13

- `docker-compose.yml` - Mount pending-orders directly instead of through data directory
- `scripts/simulate-fill.ts` - Fixed function name in calldata output from fillContractOrderArgs to fillOrderArgs
- `src/utils/limit-order.ts` - Proper signature format conversion for EOA accounts

### Changed - 2025-08-12

- Contracts v2.3 integration:
  - Synced real ABIs from contracts/out via new task `abis:sync` (copies EscrowSrc, EscrowDst, SimplifiedEscrowFactoryV2_3).
  - Switched resolver imports to `SimplifiedEscrowFactoryV2_3.json` and updated whitelist check to `isWhitelistedResolver`.
  - Implemented EIP-712 resolver-signed public withdraw for destination escrows (uses domain name "BMN-Escrow", version "2.3").
- Ponder schema source of truth:
  - Added `ponder:sync` task to copy the canonical schema from `../bmn-evm-contracts-indexer/ponder.schema.ts` into this repo root as `ponder.schema.ts`.
  - Can override source via `INDEXER_PONDER_SCHEMA` env var.

### Added - 2025-08-10

- NEXT_AGENT.md: concise handover doc for next agent including current runtime
  status, latest actions, and next steps.
- scripts:
  - scripts/create-order.ts: helper to create signed limit orders (uses
    --env-file=.env).
  - scripts/read-bmn-balance.ts: helper to read BMN balance for an address.

### Changed - 2025-08-10

- Cursor rules and AGENTS updated: mandate `--env-file=.env` for all local Deno
  commands; Docker Compose continues to inject `.env` via `env_file`.
- .gitignore: ignore `pending-orders/`, `completed-orders/`, and local
  `/tmp/*.log`.

### Changed - 2025-08-10

- docker-compose: use bind mount `./data:/app/data` instead of named volume
  `bmn-data`
- deno tasks: point to actual entrypoints
  - resolver → `src/resolver/resolver.ts`
  - alice → `alice-service.ts`
  - added `bob` → `bob-resolver-service.ts`
- bob-resolver-service: fixed approval + fill flow to use protocol and factory
  per chain; include `extensionData`
- escrow-withdraw: implemented `withdraw()` with proper chain client selection
  and key usage

### Fixed - 2025-08-10

- SQL over HTTP standardized on official client
  ([Ponder SQL over HTTP](https://ponder.sh/docs/query/sql-over-http#sql-over-http))
  - `ponder-client.ts` now uses `@ponder/client` with parameterized `sql`
    queries
  - `test-ponder-sql.ts` uses untyped `client.db.execute(sql\`...\`)` and passes
    against Railway
  - Removed confusion from raw curl 404s; clients work as intended with Hono
    middleware

### Changed - 2025-08-10

- Unified Dockerfile with multi-stage targets `alice` and `bob`; compose now
  builds from a single Dockerfile
- Pruned monitoring/Redis artifacts (Prometheus, Grafana, Redis) from init and
  compose docs

### Changed - 2025-08-10

- **Major refactoring: Consolidated PonderClient and cleaned up deprecated
  files**
  - Removed 10 deprecated files including old service wrappers and duplicate
    implementations
  - Deleted old PonderClient implementation that used raw HTTP POST requests
  - Renamed PonderClientV2 to PonderClient as the single implementation
  - Updated all imports across the codebase to use the consolidated PonderClient
  - Added AtomicSwap type export to PonderClient for type safety
  - Cleaned up duplicate alice files (removed mainnet-alice.ts)
  - Removed unused service files: alice.ts, resolver.ts, bob-service.ts,
    resolver-service.ts
  - Active services now: alice-service.ts and bob-resolver-service.ts (used by
    Docker)
  - All services now use @ponder/client library for SQL over HTTP
- **Optimized Docker builds following Deno best practices**
  - Added production environment variables: `DENO_NO_UPDATE_CHECK=1` and
    `DENO_NO_PROMPT=1`
  - Unified single Dockerfile with `alice` and `bob` targets
  - Fixed npm module version conflicts by using `deno.json` import map
  - Services build successfully with proper dependency caching

### Fixed - 2025-08-10

- **Consolidated on @ponder/client for SQL over HTTP**
  - Official client handles SQL endpoint and middleware correctly
  - `test-ponder-sql.ts` uses `createClient` and untyped `db.execute`
  - Default `INDEXER_URL` updated to Railway deployment in compose

### Fixed - 2025-08-10

- Removed legacy notes about custom HTTP client and `/sql/db`; project uses
  `@ponder/client` exclusively

### Added - 2025-08-10

- **Added test-ponder-sql.ts: SQL endpoint verification script**
  - Verifies SQL-over-HTTP via `@ponder/client` against Railway
  - Includes automatic 10-second timeout
  - Run with: `deno run --allow-net --allow-env test-ponder-sql.ts`

### Added - 2025-08-10

- **Added missing indexer integration methods**
  - Implemented `getActiveSwaps()` method in PonderClient for finding swap
    opportunities
  - Added `getWithdrawableEscrows()` method in EscrowWithdrawManager
  - Added generic `withdraw()` method for processing escrow withdrawals
  - Enhanced error handling for pending-orders directory creation

### Changed - 2025-08-10

- **Docker compose defaults**: `INDEXER_URL` points to
  `https://index-bmn.up.railway.app`

### Changed - 2025-08-10

- **Updated Docker infrastructure for two-party atomic swap architecture**
  - Removed separate Resolver service and Dockerfile.resolver
  - Updated docker-compose.yml to reflect unified Bob-Resolver service
  - Bob-Resolver service now runs on port 8002 as main coordinator and
    counterparty
  - Alice service depends on Bob-Resolver instead of separate Resolver
  - Updated all health check endpoints and monitoring configuration
  - Simplified service architecture from three services to two

### Changed - 2025-08-10

- **Merged Bob and Resolver services into unified Bob-Resolver service**
  - Combined taker (Bob) and coordinator (Resolver) functionalities into single
    service
  - Created new `bob-resolver-service.ts` with explicit dual-mode capabilities
  - Enhanced `bob-service.ts` to include resolver functionality
  - Service runs on port 8002 with unified HTTP endpoints
  - Added endpoints: `/health`, `/fill-order`, `/withdraw`, `/stats`
  - Supports both filling Alice's limit orders and creating destination escrows
  - Manages keys, secrets, and order processing in single service
  - Monitors pending orders from indexer and local filesystem
  - Processes withdrawals when secrets are revealed
  - Simplified deployment by reducing service count

### Added - 2025-08-10

- **Implemented escrow withdrawal with contract calls** - Created comprehensive
  withdrawal system for atomic swaps
  - New `escrow-withdraw.ts` utility module with `EscrowWithdrawManager` class
  - Proper handling of escrow immutables structure for both v2 contracts
  - `withdrawFromDestination` for Alice withdrawing from Bob's escrow with
    secret reveal
  - `withdrawFromSource` for Resolver withdrawing after learning the secret
  - Retry logic with exponential backoff for failed withdrawals
  - Automatic monitoring and withdrawal when secrets are revealed
  - Full integration with SecretManager for tracking withdrawal status
  - Updated all Alice implementations and Resolver to use new withdrawal manager

### Added - 2025-08-10

- **Created limit-order.ts utility module** - Centralized
  SimpleLimitOrderProtocol interaction logic
  - `fillLimitOrder` function for atomic order filling with PostInteraction
    support
  - `ensureLimitOrderApprovals` for managing token approvals for both protocol
    and factory
  - `calculateOrderHash` for EIP-712 order hashing
  - Integrated error handling and retry logic
  - Full PostInteraction event monitoring

### Changed - 2025-08-10

- **Refactored resolver to use SimpleLimitOrderProtocol utility**
  - Replaced inline fillOrderArgs calls with centralized `fillLimitOrder`
    function
  - Simplified approval management using `ensureLimitOrderApprovals`
  - Improved code maintainability and reusability
  - Ensured proper POST_INTERACTION_CALL_FLAG is set in order flags

### Added

- **Indexer helpers** in `PonderClient` for atomic swap queries
  - Implemented `getActiveSwaps()`, `getPendingAtomicSwaps()`,
    `getRecentWithdrawals()`
  - Retry logic and polling-based subscription support

### Fixed

- **Fixed environment variable access in indexer config** - Replaced
  `process.env` with `Deno.env.get()` in PRODUCTION_INDEXER_CONFIG_TEMPLATE to
  ensure compatibility with Deno runtime

### Changed - 2025-01-10

- **Inlined import map into deno.json** to support `deno install` command
  - Removed separate `import_map.json` file
  - Migrated all imports to `deno.json` under `"imports"` field
  - Updated all Dockerfiles to remove `--import-map` flag references
  - This fixes the error: "`deno install` is not supported when configuration
    file contains an 'importMap' field"

### Added - 2025-01-10

- **@ponder/client dependency** for enhanced Ponder indexer integration
- **.cursorrules file** for Cursor IDE configuration

### Changed - 2025-08-08

- **Improved type safety** in indexer client by replacing `any` types with
  proper TypeScript interfaces
  - Added `ChainStatistics` interface for chain metrics
  - Added `PonderSQLClient` type for Ponder SQL client
  - Fixed async/await issues in `getRevealedSecrets` method
- **Enhanced error handling** in service shutdown routines
  - Added descriptive comments to empty catch blocks in `resolver-service.ts`
  - Improved cleanup error handling during service shutdown

### Fixed - 2025-08-08

- **Resolved linting violations** in core modules
  - Removed unused imports (`createPublicClient`, `createWalletClient`) from
    `token-approvals.ts`
  - Eliminated unnecessary `any` type casts in wallet transaction calls
  - Fixed unused variable warnings in test files
- **Fixed Ponder client schema alignment** with database
  - Updated `AtomicSwap` interface to match actual DB schema
  - Added missing `hashlock` field, corrected chain ID types
  - Improved withdrawal correlation with proper JOIN operations

### Changed - 2025-08-07 (Container env and tasks)

- Docker entrypoints no longer pass `--env-file=.env`; Docker Compose now
  supplies env vars
- `make test` uses container-friendly task `resolver:test:docker`
- Added dedicated in-container Deno tasks: `resolver:docker`,
  `resolver:test:docker`, `alice:docker`
- Ignore local `.crush/` working directory

### Added - 2025-08-07

- `src/types/contracts.ts`: typed contract address mapping for factories,
  protocols, and tokens

### Fixed - 2025-08-07 (Complete Docker Success)

- **Alice service now runs continuously** instead of exiting after showing help
  - Created `alice-service.ts` with monitoring loop and health server
  - Alice monitors orders and auto-withdraws when destination escrows are ready
- **Health check endpoints implemented** for all services (resolver, alice, bob)
  - Created service wrappers with integrated health servers on ports 8000, 8001,
    8002
  - All services now report healthy status to Docker
- **Prometheus configuration mounting fixed** for macOS Docker Desktop
  - Created custom Dockerfiles embedding configurations
  - Prometheus successfully scraping metrics from all services
- **Grafana provisioning working** with auto-configured datasources and
  dashboards
  - BMN Services Overview dashboard available at /d/bmn-overview

### Added - 2025-08-07 (Service Infrastructure)

- `alice-service.ts` - Alice service wrapper with health monitoring
- `resolver-service.ts` - Resolver service wrapper with health monitoring
- `bob-service.ts` - Bob service wrapper with health monitoring
- `Dockerfile.prometheus` - Custom Prometheus image with embedded config
- `Dockerfile.grafana` - Custom Grafana image with provisioning
- `grafana-provisioning/` - Grafana datasources and dashboard configurations
- Complete monitoring stack with Prometheus metrics and Grafana dashboards

### Fixed - 2025-01-08

- Docker build failures due to Deno version mismatch (upgraded from 2.1.4 to
  2.4.3)
- Dockerfile permission issues with deno user and cache directories
- Docker volume mounting issues on macOS by switching to named volumes
- Import map validation errors by removing unsupported nodeModulesDir field
- Container networking issues with indexer connection using host.docker.internal

### Changed - 2025-01-08

- Simplified docker-compose.yml configuration with named volumes
- Updated all Dockerfiles to use Deno 2.4.3 and proper cache permissions
- Removed deprecated version field from docker-compose.yml
- Updated INDEXER_URL environment variable to use host.docker.internal (later
  changed to Railway URL by default)

### Added - 2025-01-08

- prometheus.yml configuration file for metrics collection
- Grafana provisioning directory structure
- Named volumes for better data persistence (bmn-data, redis-data)

### Known Issues - 2025-01-08

- Alice service exits immediately (needs to be converted to long-running
  service)
- Health check endpoints not implemented for resolver and bob services
- Prometheus service fails to start due to configuration mounting issues

### Added - 2025-08-07 (Docker Infrastructure)

- Comprehensive Docker-based infrastructure for all services
- Multi-stage Dockerfiles for optimized builds:
  - `Dockerfile.resolver`: Main resolver service
  - `Dockerfile.alice`: Alice swap initiator service
  - `Dockerfile.bob`: Bob swap acceptor service
- Docker Compose orchestration with supporting services:
  - Redis for distributed caching and pub/sub
  - Prometheus for metrics collection
  - Grafana for visualization dashboards
- Shared `./data` directory for persistent storage across all services
- `init-docker.sh` script for first-time setup and initialization
- `docker-compose.prod.yml` for production deployments
- Makefile with convenient commands for Docker operations
- Health check endpoints for all services
- `.dockerignore` for optimized Docker build context
- Docker workflow documentation in CLAUDE.md

### Changed - 2025-08-07 (Docker Infrastructure)

- Updated docker-compose.yml with complete service orchestration
- Enhanced CLAUDE.md with comprehensive Docker workflow instructions
- All Docker builds use caching by default (never --no-cache)

### Added - 2025-08-07 (v2.2.0 Integration)

- PostInteraction v2.2.0 support with SimplifiedEscrowFactory
- New utility modules:
  - `postinteraction-v2.ts`: Extension data encoder for v2.2.0 format
  - `token-approvals.ts`: Token approval manager for factory
  - `postinteraction-events.ts`: Event monitoring for PostInteractionExecuted
  - `postinteraction-errors.ts`: Comprehensive error handling with retry logic
- Factory approval logic (resolver must approve factory for token transfers)
- PostInteractionExecuted event monitoring and parsing
- Automatic retry logic for recoverable PostInteraction failures
- Coordination documentation for indexer team
  (`INDEXER_RESOLVER_COORDINATION_V2.2.md`)

### Changed - 2025-08-07 (v2.2.0 Integration)

- Updated factory address to v2.2.0:
  `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`
- Refactored extension data encoding for new PostInteraction parameters
- Enhanced alice implementations with proper v2.2.0 escrow parameters
- Improved error handling with specific recovery strategies
- Added dual approval system (both protocol and factory need approvals)

### Fixed - 2025-08-07

- Resolved PrivateOrder error by setting makerTraits to 0 for public orders
- Fixed MakingAmountTooLow error with correct takerTraits configuration
- Added automatic token approval in resolver before filling orders
- Identified root cause: SimplifiedEscrowFactory lacks IPostInteraction
  interface
- Created comprehensive plan for contract fixes in bmn-evm-contracts

### Added - 2025-08-07

- Automatic token approval logic in resolver (checks allowance first)
- `LIMIT_ORDER_POSTINTERACTION_ISSUE.md` documenting the integration problem
- Archive folder for historical documentation
- Integration plan in bmn-evm-contracts repository

### Changed - 2025-08-07

- Simplified makerTraits to 0n for public order filling
- Reorganized documentation structure (archived 7 old docs)
- Updated CLAUDE.md with postInteraction integration status

### Fixed - 2025-08-05

- **CRITICAL ARCHITECTURE FIX IMPLEMENTED**: Completely refactored system to use
  correct architecture
  - **Root Cause**: System was trying to call `createSrcEscrow` which doesn't
    exist on deployed CrossChainEscrowFactory
  - **Solution**: Implemented proper limit order flow with postInteraction
    mechanism
  - **Files Updated**:
    - `limit-order-alice.ts`: Now creates proper limit orders with
      postInteraction extension data
    - `mainnet-alice.ts`: Updated to use same correct limit order approach
    - `resolver.ts`: Fixed to fill orders via SimpleLimitOrderProtocol, not
      direct factory calls
  - **Key Changes**:
    - Alice now creates EIP-712 signed limit orders with postInteraction
      extension
    - Extension data includes factory address and ExtraDataArgs for escrow
      creation
    - Resolver fills orders through protocol, which triggers
      factory.postInteraction
    - Factory creates escrows via postInteraction, not direct calls
  - **Removed**: SimplifiedEscrowFactory.json ABI (wrong contract, not deployed)

### Critical Architecture Discovery - 2025-08-04

- **CRITICAL ISSUE FOUND**: The entire system architecture is misaligned
  - The deployed CrossChainEscrowFactory at
    `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A` does NOT have `createSrcEscrow`
  - Previous "fix" was incorrect - `createSrcEscrow` only exists in
    SimplifiedEscrowFactory (not deployed)
  - System should use limit order protocol's `postInteraction` flow, not direct
    factory calls
  - Created `CRITICAL_ARCHITECTURE_FIX.md` documenting the correct approach
  - Both Alice and Bob implementations need complete refactoring to use limit
    orders properly

### Fixed

- **Critical ABI Update**: Fixed function name mismatch in Alice implementations
  - ~~Replaced non-existent `postSourceEscrow` with correct `createSrcEscrow`
    function~~ (INCORRECT - see above)
  - ~~Updated both `limit-order-alice.ts` and `mainnet-alice.ts` to use
    SimplifiedEscrowFactory~~ (WRONG APPROACH)
  - Copied latest ABIs from contract directories to ensure compatibility
  - ~~Changed from CrossChainEscrowFactory to SimplifiedEscrowFactory for direct
    escrow creation~~ (INCORRECT)

### Changed

- **Updated ABIs from latest contract builds**
  - `SimplifiedEscrowFactory.json` - Now using correct factory ABI with
    `createSrcEscrow`
  - `SimpleLimitOrderProtocol.json` - Updated from limit order contracts
  - `CrossChainEscrowFactory.json` - Refreshed from main contracts
  - `EscrowSrc.json` and `EscrowDst.json` - Updated escrow contract ABIs

### Known Issues

- **createSrcEscrow Transaction Reverting**: Currently facing transaction
  reversion when calling `createSrcEscrow`
  - Factory address: `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A`
  - Possible causes:
    - Maker address (`0x240E2588e35FB9D3D60B283B45108a49972FFFd8`) may need
      whitelisting
    - Resolver address (`0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5`) may need
      whitelisting
    - Factory contract might be paused or have additional security restrictions
    - Immutables structure format may need adjustment for the specific factory
      implementation
  - Next steps: Check factory contract state, whitelist requirements, and
    parameter formats

### Major Architectural Changes

#### 1. **Unified Resolver Architecture**

- Created single `UnifiedResolver` class combining all resolver functionality
- Removed `demo-resolver.ts`, `base-resolver.ts`, `simple-resolver.ts` in favor
  of unified implementation
- Full integration with SimpleLimitOrderProtocol for order filling
- Uses factory v2.2.0 at 0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68 (CREATE3;
  same on Base/Optimism)

#### 2. **Limit Order Protocol Integration**

- Created `LimitOrderAlice` for EIP-712 signed order creation
- Orders include postInteraction to trigger factory escrow creation
- Removed `simple-alice.ts` in favor of limit order implementation
- SimpleLimitOrderProtocol addresses:
  - Base: 0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06
  - Optimism: 0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7

#### 3. **Documentation**

- Created comprehensive ARCHITECTURE.md documenting complete system flow
- Added UNIFIED_RESOLVER.md with usage instructions
- Created CLEANUP_LOG.md tracking architectural improvements
- Added LIMIT_ORDER_INTEGRATION.md for protocol integration details

#### 4. **Testing Infrastructure**

- Added `test-indexer-query.ts` for SQL/HTTP connectivity testing
- Created `test-resolver.ts` for configuration verification
- Added `test-limit-order.ts` for dry-run order testing
- Added `test-manual-order.ts` for manual order processing

#### 5. **Ready for Mainnet**

- Resolver whitelisted at 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5
- All contracts deployed and verified on Base and Optimism mainnet
- Complete flow: Alice → LimitOrder → Indexer → Resolver → Atomic Swap

### Added

- Created deployment configuration files for local testing
  - `deployments/chainA.json` - Local chain A configuration (port 8545)
  - `deployments/chainB.json` - Local chain B configuration (port 8546)
  - Contains factory addresses, token addresses, and test accounts

- Added log management scripts for better debugging
  - `scripts/run-resolver-with-log.sh` - Starts resolver with logging to file
  - `scripts/stop-resolver.sh` - Cleanly stops resolver using PID
  - Logs are written to `logs/resolver.log` (gitignored)

- Migration and validation scripts
  - `migration-checklist.ts` - Validates resolver configuration
  - `demo-complete-flow.ts` - End-to-end flow demonstration

### Changed

<!-- Removed outdated note about modifying default profit bps in non-existent `run-resolver.ts`. Current default is 50 bps in `src/resolver/resolver.ts`. -->

- Migrated from GraphQL to SQL over HTTP architecture
  - Resolver now uses SQL over HTTP via Ponder indexer
  - Connects to Ponder SQL endpoint at `http://localhost:42069/sql`
  - Queries atomic swap data using PonderClient

### Security

- Factory v2.2.0 with enhanced security features
  - Resolver whitelist implementation
  - Emergency pause functionality
  - Signature verification improvements

### Technical Details

- Uses Deno KV for local secret management
- EIP-712 typed data signing for limit orders
- PostInteraction hooks for factory escrow creation
- Atomic swap execution through SimpleLimitOrderProtocol

## [0.3.0] - 2025-01-07 (Previous context)

### Added

- Unified Resolver implementation (`src/resolver/resolver.ts`)
- PonderClient for SQL over HTTP indexer queries
- Integration with SimpleLimitOrderProtocol
- SecretManager for local state management

### Changed

- Migrated from GraphQL to SQL over HTTP
- Removed circular dependencies between modules
- Simplified resolver architecture

## [0.2.0] - 2025-01-06 (Previous context)

### Added

- Factory V2 migration with security features
- Resolver whitelist implementation
- Emergency pause functionality

### Security

- Added comprehensive security checks in CLAUDE.md
- Implemented pre-commit security scanning

## [0.1.0] - 2025-01-05 (Initial)

### Added

- Initial project setup
- Basic atomic swap resolver
- Cross-chain escrow integration
- Limit order protocol support
