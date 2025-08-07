# Changelog

All notable changes to the BMN EVM Resolver project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Created deployment configuration files for local testing
  - `deployments/chainA.json` - Local chain A configuration (port 8545)
  - `deployments/chainB.json` - Local chain B configuration (port 8546)
  - Contains factory addresses, token addresses, and test accounts

- Added log management scripts for better debugging
  - `scripts/run-resolver-with-log.sh` - Starts resolver with logging to file
  - `scripts/stop-resolver.sh` - Cleanly stops resolver using PID
  - Logs are written to `logs/resolver.log` (gitignored)

### Changed
- Modified default profit requirement from 0.5% (50 bps) to 0% (0 bps)
  - Updated `run-resolver.ts` line 22 and 33
  - Allows resolver to fill orders at break-even for testing

### Technical Details
- Resolver now uses SQL over HTTP via Ponder indexer
- Connects to Ponder SQL endpoint at `http://localhost:42069/sql`
- Queries atomic swap data using PonderClient
- Uses Deno KV for local secret management

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