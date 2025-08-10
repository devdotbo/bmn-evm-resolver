# Changelog

All notable changes to the BMN EVM Resolver project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed - 2025-08-10
- SQL over HTTP works via the official client per docs ([Ponder SQL over HTTP](https://ponder.sh/docs/query/sql-over-http#sql-over-http))
  - Rewrote `src/indexer/ponder-client.ts` to use `@ponder/client` with parameterized `sql` queries
  - Replaced raw `fetch`-based POSTs and removed noisy 404 logs
  - Clarified behavior: `curl` to `/sql` may 404, but `@ponder/client` middleware endpoint functions as intended
  - Updated `test-ponder-sql.ts` to use untyped `client.db.execute(sql\`...\`)` smoke tests; verified against Railway indexer

### Fixed - 2025-08-10
- Eliminated `drizzle-orm` runtime resolution errors inside containers by switching `PonderClient` to direct SQL-over-HTTP (POST /sql) and updating Docker config
  - Replaced `@ponder/client` usage at runtime with lightweight HTTP client in `src/indexer/ponder-client.ts`
  - Set `DENO_NODE_MODULES_DIR=none` and removed `/app/node_modules` to avoid npm bin/symlink issues
  - Relaxed Docker `deno cache` to avoid strict lockfile failures
  - Result: `docker compose build` and `up` start cleanly; Bob-Resolver runs healthy

### Changed - 2025-08-10
- Unified Dockerfile with multi-stage targets `alice` and `bob`; compose now builds from a single Dockerfile
- Pruned monitoring/Redis artifacts (Prometheus, Grafana, Redis) from init and compose docs

### Changed - 2025-08-10
- **Major refactoring: Consolidated PonderClient and cleaned up deprecated files**
  - Removed 10 deprecated files including old service wrappers and duplicate implementations
  - Deleted old PonderClient implementation that used raw HTTP POST requests
  - Renamed PonderClientV2 to PonderClient as the single implementation
  - Updated all imports across the codebase to use the consolidated PonderClient
  - Added AtomicSwap type export to PonderClient for type safety
  - Cleaned up duplicate alice files (removed mainnet-alice.ts)
  - Removed unused service files: alice.ts, resolver.ts, bob-service.ts, resolver-service.ts
  - Active services now: alice-service.ts and bob-resolver-service.ts (used by Docker)
  - All services now use @ponder/client library for SQL over HTTP
- **Optimized Docker builds following Deno best practices**
  - Added production environment variables: `DENO_NO_UPDATE_CHECK=1` and `DENO_NO_PROMPT=1`
  - Simplified Dockerfiles to single-stage builds for consistency
  - Fixed npm module version conflicts by using deno.json import map
  - Added `--frozen` flag to prevent lockfile modifications during Docker builds
  - Services build successfully with proper dependency caching
  - **Known Issue**: Runtime module resolution error with drizzle-orm path mismatch
    - @ponder/client@0.12.3 looks for drizzle-orm in wrong cache location
    - This appears to be a Deno npm module resolution issue

### Fixed - 2025-08-10
- **Fixed SQL over HTTP implementation to use @ponder/client library**
  - Replaced custom SQL implementation with official @ponder/client library
  - Fixed 404 errors by using correct protocol and endpoints
  - Updated ponder.schema.ts to use npm:ponder@0.12.0 import for Deno compatibility
  - Created PonderClientV2 using @ponder/client with type-safe Drizzle queries
  - Fixed test-ponder-sql.ts to use createClient from @ponder/client
  - Updated INDEXER_URL to use deployed indexer at https://index-bmn.up.railway.app
  - Added support for live queries with automatic fallback to polling

### Fixed - 2025-08-10
- **Fixed PonderClient implementation for Direct SQL over HTTP**
  - Updated SQL query execution to use correct POST /sql endpoint format
  - Changed from incorrect /sql/db endpoint to direct /sql endpoint
  - Fixed request body format to use `{ sql: query }` instead of query parameters
  - Properly handle response with 'data' field instead of 'rows'
  - Fixed SQL parameter replacement for direct query execution
  - Added proper string escaping for SQL parameters

### Added - 2025-08-10
- **Added test-ponder-sql.ts: SQL endpoint verification script**
  - Tests Ponder Direct SQL endpoint via HTTP POST to /sql
  - Includes automatic 10-second timeout for script termination
  - Tests both PonderClient methods and raw SQL queries
  - Verifies connectivity to https://index-bmn.up.railway.app
  - Run with: `deno run --allow-net --allow-env test-ponder-sql.ts`

### Added - 2025-08-10
- **Added missing indexer integration methods**
  - Implemented `getActiveSwaps()` method in PonderClient for finding swap opportunities
  - Added `getWithdrawableEscrows()` method in EscrowWithdrawManager
  - Added generic `withdraw()` method for processing escrow withdrawals
  - Enhanced error handling for pending-orders directory creation

### Changed - 2025-08-10
- **Updated Docker networking configuration**
  - Changed INDEXER_URL from host.docker.internal:42069 to bmn-indexer:42069
  - Services now use Docker network name for inter-container communication
  - Improved network isolation and reliability

### Changed - 2025-08-10
- **Updated Docker infrastructure for two-party atomic swap architecture**
  - Removed separate Resolver service and Dockerfile.resolver
  - Updated docker-compose.yml to reflect unified Bob-Resolver service
  - Bob-Resolver service now runs on port 8002 as main coordinator and counterparty
  - Alice service depends on Bob-Resolver instead of separate Resolver
  - Updated all health check endpoints and monitoring configuration
  - Simplified service architecture from three services to two

### Changed - 2025-08-10
- **Merged Bob and Resolver services into unified Bob-Resolver service**
  - Combined taker (Bob) and coordinator (Resolver) functionalities into single service
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
- **Implemented escrow withdrawal with contract calls** - Created comprehensive withdrawal system for atomic swaps
  - New `escrow-withdraw.ts` utility module with `EscrowWithdrawManager` class
  - Proper handling of escrow immutables structure for both v2 contracts
  - `withdrawFromDestination` for Alice withdrawing from Bob's escrow with secret reveal
  - `withdrawFromSource` for Resolver withdrawing after learning the secret
  - Retry logic with exponential backoff for failed withdrawals
  - Automatic monitoring and withdrawal when secrets are revealed
  - Full integration with SecretManager for tracking withdrawal status
  - Updated all Alice implementations and Resolver to use new withdrawal manager

### Added - 2025-08-10
- **Created limit-order.ts utility module** - Centralized SimpleLimitOrderProtocol interaction logic
  - `fillLimitOrder` function for atomic order filling with PostInteraction support
  - `ensureLimitOrderApprovals` for managing token approvals for both protocol and factory
  - `calculateOrderHash` for EIP-712 order hashing
  - Integrated error handling and retry logic
  - Full PostInteraction event monitoring

### Changed - 2025-08-10
- **Refactored resolver to use SimpleLimitOrderProtocol utility** 
  - Replaced inline fillOrderArgs calls with centralized `fillLimitOrder` function
  - Simplified approval management using `ensureLimitOrderApprovals`
  - Improved code maintainability and reusability
  - Ensured proper POST_INTERACTION_CALL_FLAG is set in order flags

### Added
- **Implemented real Ponder SQL client for atomic swap queries** - Replaced stubbed PonderClient with fully functional HTTP-based SQL implementation
  - Implements the @ponder/client protocol without requiring the npm package
  - Added proper SQL query execution with POST requests to `/sql/db` endpoint
  - Implemented retry logic with configurable attempts and delays
  - Added camelCase to snake_case column name conversion
  - Proper BigInt handling for numeric fields
  - Full implementation of critical methods: `getSwaps()`, `getSwapsByHashlock()`, `getCompletedSwaps()`, `getRevealedSecrets()`
  - Graceful error handling that returns empty results instead of throwing
  - Support for table prefixes in multi-tenant deployments
  - Polling-based subscription support for real-time updates

### Fixed
- **Fixed environment variable access in indexer config** - Replaced `process.env` with `Deno.env.get()` in PRODUCTION_INDEXER_CONFIG_TEMPLATE to ensure compatibility with Deno runtime

### Changed - 2025-01-10
- **Inlined import map into deno.json** to support `deno install` command
  - Removed separate `import_map.json` file
  - Migrated all imports to `deno.json` under `"imports"` field
  - Updated all Dockerfiles to remove `--import-map` flag references
  - This fixes the error: "`deno install` is not supported when configuration file contains an 'importMap' field"

### Added - 2025-01-10
- **@ponder/client dependency** for enhanced Ponder indexer integration
- **.cursorrules file** for Cursor IDE configuration

### Changed - 2025-08-08
- **Improved type safety** in indexer client by replacing `any` types with proper TypeScript interfaces
  - Added `ChainStatistics` interface for chain metrics
  - Added `PonderSQLClient` type for Ponder SQL client
  - Fixed async/await issues in `getRevealedSecrets` method
- **Reorganized import mappings** to resolve Deno warnings
  - Created dedicated `import_map.json` file
  - Moved import definitions from `deno.json` to centralized import map
  - Added explicit mappings for viem submodules (accounts, chains, actions, utils)
- **Enhanced error handling** in service shutdown routines
  - Added descriptive comments to empty catch blocks in `resolver-service.ts`
  - Improved cleanup error handling during service shutdown

### Fixed - 2025-08-08
- **Resolved linting violations** in core modules
  - Removed unused imports (`createPublicClient`, `createWalletClient`) from `token-approvals.ts`
  - Eliminated unnecessary `any` type casts in wallet transaction calls
  - Fixed unused variable warnings in test files
- **Fixed Ponder client schema alignment** with database
  - Updated `AtomicSwap` interface to match actual DB schema
  - Added missing `hashlock` field, corrected chain ID types
  - Improved withdrawal correlation with proper JOIN operations

### Changed - 2025-08-07 (Container env and tasks)
- Docker entrypoints no longer pass `--env-file=.env`; Docker Compose now supplies env vars
- `make test` uses container-friendly task `resolver:test:docker`
- Added dedicated in-container Deno tasks: `resolver:docker`, `resolver:test:docker`, `alice:docker`
- Ignore local `.crush/` working directory

### Added - 2025-08-07
- `src/types/contracts.ts`: typed contract address mapping for factories, protocols, and tokens


### Fixed - 2025-08-07 (Complete Docker Success)
- **Alice service now runs continuously** instead of exiting after showing help
  - Created `alice-service.ts` with monitoring loop and health server
  - Alice monitors orders and auto-withdraws when destination escrows are ready
- **Health check endpoints implemented** for all services (resolver, alice, bob)
  - Created service wrappers with integrated health servers on ports 8000, 8001, 8002
  - All services now report healthy status to Docker
- **Prometheus configuration mounting fixed** for macOS Docker Desktop
  - Created custom Dockerfiles embedding configurations
  - Prometheus successfully scraping metrics from all services
- **Grafana provisioning working** with auto-configured datasources and dashboards
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
- Docker build failures due to Deno version mismatch (upgraded from 2.1.4 to 2.4.3)
- Dockerfile permission issues with deno user and cache directories
- Docker volume mounting issues on macOS by switching to named volumes
- Import map validation errors by removing unsupported nodeModulesDir field
- Container networking issues with indexer connection using host.docker.internal

### Changed - 2025-01-08
- Simplified docker-compose.yml configuration with named volumes
- Updated all Dockerfiles to use Deno 2.4.3 and proper cache permissions
- Removed deprecated version field from docker-compose.yml
- Updated INDEXER_URL environment variable to use host.docker.internal

### Added - 2025-01-08
- prometheus.yml configuration file for metrics collection
- Grafana provisioning directory structure
- Named volumes for better data persistence (bmn-data, redis-data)

### Known Issues - 2025-01-08
- Alice service exits immediately (needs to be converted to long-running service)
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
- Coordination documentation for indexer team (`INDEXER_RESOLVER_COORDINATION_V2.2.md`)

### Changed - 2025-08-07 (v2.2.0 Integration)  
- Updated factory address to v2.2.0: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`
- Refactored extension data encoding for new PostInteraction parameters
- Enhanced alice implementations with proper v2.2.0 escrow parameters
- Improved error handling with specific recovery strategies
- Added dual approval system (both protocol and factory need approvals)

### Fixed - 2025-08-07
- Resolved PrivateOrder error by setting makerTraits to 0 for public orders
- Fixed MakingAmountTooLow error with correct takerTraits configuration  
- Added automatic token approval in resolver before filling orders
- Identified root cause: SimplifiedEscrowFactory lacks IPostInteraction interface
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
- **CRITICAL ARCHITECTURE FIX IMPLEMENTED**: Completely refactored system to use correct architecture
  - **Root Cause**: System was trying to call `createSrcEscrow` which doesn't exist on deployed CrossChainEscrowFactory
  - **Solution**: Implemented proper limit order flow with postInteraction mechanism
  - **Files Updated**:
    - `limit-order-alice.ts`: Now creates proper limit orders with postInteraction extension data
    - `mainnet-alice.ts`: Updated to use same correct limit order approach
    - `resolver.ts`: Fixed to fill orders via SimpleLimitOrderProtocol, not direct factory calls
  - **Key Changes**:
    - Alice now creates EIP-712 signed limit orders with postInteraction extension
    - Extension data includes factory address and ExtraDataArgs for escrow creation
    - Resolver fills orders through protocol, which triggers factory.postInteraction
    - Factory creates escrows via postInteraction, not direct calls
  - **Removed**: SimplifiedEscrowFactory.json ABI (wrong contract, not deployed)

### Critical Architecture Discovery - 2025-08-04
- **CRITICAL ISSUE FOUND**: The entire system architecture is misaligned
  - The deployed CrossChainEscrowFactory at `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A` does NOT have `createSrcEscrow`
  - Previous "fix" was incorrect - `createSrcEscrow` only exists in SimplifiedEscrowFactory (not deployed)
  - System should use limit order protocol's `postInteraction` flow, not direct factory calls
  - Created `CRITICAL_ARCHITECTURE_FIX.md` documenting the correct approach
  - Both Alice and Bob implementations need complete refactoring to use limit orders properly

### Fixed
- **Critical ABI Update**: Fixed function name mismatch in Alice implementations
  - ~~Replaced non-existent `postSourceEscrow` with correct `createSrcEscrow` function~~ (INCORRECT - see above)
  - ~~Updated both `limit-order-alice.ts` and `mainnet-alice.ts` to use SimplifiedEscrowFactory~~ (WRONG APPROACH)
  - Copied latest ABIs from contract directories to ensure compatibility
  - ~~Changed from CrossChainEscrowFactory to SimplifiedEscrowFactory for direct escrow creation~~ (INCORRECT)

### Changed
- **Updated ABIs from latest contract builds**
  - `SimplifiedEscrowFactory.json` - Now using correct factory ABI with `createSrcEscrow`
  - `SimpleLimitOrderProtocol.json` - Updated from limit order contracts
  - `CrossChainEscrowFactory.json` - Refreshed from main contracts
  - `EscrowSrc.json` and `EscrowDst.json` - Updated escrow contract ABIs

### Known Issues
- **createSrcEscrow Transaction Reverting**: Currently facing transaction reversion when calling `createSrcEscrow`
  - Factory address: `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A`
  - Possible causes:
    - Maker address (`0x240E2588e35FB9D3D60B283B45108a49972FFFd8`) may need whitelisting
    - Resolver address (`0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5`) may need whitelisting
    - Factory contract might be paused or have additional security restrictions
    - Immutables structure format may need adjustment for the specific factory implementation
  - Next steps: Check factory contract state, whitelist requirements, and parameter formats

### Major Architectural Changes

#### 1. **Unified Resolver Architecture**
- Created single `UnifiedResolver` class combining all resolver functionality
- Removed `demo-resolver.ts`, `base-resolver.ts`, `simple-resolver.ts` in favor of unified implementation
- Full integration with SimpleLimitOrderProtocol for order filling
- Uses factory v2.1.0 at 0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A

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
- Modified default profit requirement from 0.5% (50 bps) to 0% (0 bps)
  - Updated `run-resolver.ts` line 22 and 33
  - Allows resolver to fill orders at break-even for testing

- Migrated from GraphQL to SQL over HTTP architecture
  - Resolver now uses SQL over HTTP via Ponder indexer
  - Connects to Ponder SQL endpoint at `http://localhost:42069/sql`
  - Queries atomic swap data using PonderClient

### Security
- Factory v2.1.0 with enhanced security features
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