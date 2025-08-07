# Changelog

All notable changes to the BMN EVM Resolver project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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