## Limit Order Fill Reverts (PostInteraction v2.2) — Contract Agent Brief

### Summary
- Filling a 1inch SimpleLimitOrderProtocol order with PostInteraction extension on Base (8453) reverts during simulate/fill with unknown error selector `0xb2d25e49`.
- Factory approvals and protocol approvals are in place; resolver wallet is funded.
- Extension data and salt correlation appears correct (salt lower 160 bits = keccak256(extension)).
- Needs Solidity-side analysis to decode the revert and confirm extension and makerTraits expectations.

### Environment
- Chain: Base mainnet (chainId 8453)
- Protocol (SimpleLimitOrderProtocol): `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`
- Factory v2.2.0 (PostInteraction): `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`
- BMN token: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`
- Resolver wallet (taker): `0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5`
- Tooling: Deno + viem 2.33.3

### Reproduction
1) Service health
```bash
curl -sS http://localhost:8002/health
```

2) Attempt fill via Bob-Resolver API (uses internal ensure approvals, then fillOrderArgs)
```bash
curl -sS -X POST http://localhost:8002/fill-order \
  -H 'Content-Type: application/json' \
  -d "$(jq '. + {takerAmount: .order.takingAmount, takerAsset: .order.takerAsset, takerTraits: 0}' \
        pending-orders/0xf759119bee651fd4aab04b3df70f80a3c3c187b4e2ea461d4bc0c449ae6694e1.json)"
```
Observed response:
```json
{"success": true, "result": false}
```

3) Logs (excerpt)
```text
Error filling order: ContractFunctionExecutionError: The contract function "fillOrderArgs" reverted with signature:
0xb2d25e49
Unable to decode signature "0xb2d25e49" on provided ABI.
```

4) Direct simulation (viem) reproduces the same unknown selector
```ts
// deno run --allow-read --allow-net --allow-env --env-file=.env simulate-fill.ts
import { createPublicClient, http } from "npm:viem";
import SimpleLimitOrderProtocolAbi from "./abis/SimpleLimitOrderProtocol.json" with { type: "json" };
const data = JSON.parse(await Deno.readTextFile("pending-orders/0xf759119bee651fd4aab04b3df70f80a3c3c187b4e2ea461d4bc0c449ae6694e1.json"));
const client = createPublicClient({ transport: http(`https://rpc.ankr.com/base/${Deno.env.get('ANKR_API_KEY')}`) });
// Build r/vs, order, and call fillOrderArgs(..., takerTraits=0, extensionData)
// Result: revert with selector 0xb2d25e49
```

### Order snapshot (core fields)
From `pending-orders/0xf759119b...6694e1.json`:
```json
{
  "chainId": 8453,
  "order": {
    "maker": "0x240E2588e35FB9D3D60B283B45108a49972FFFd8",
    "receiver": "0x240E2588e35FB9D3D60B283B45108a49972FFFd8",
    "makerAsset": "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
    "takerAsset": "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
    "makingAmount": "10000000000000000",
    "takingAmount": "10000000000000000",
    "makerTraits": "4523128485832663883733241601901871400518358776001584532791311875309106626560",
    "salt": "2765791249167713500418409931405808068666658913283612807619617538"
  },
  "extensionData": "0x0000...<offsets+postInteractionData>...",
  "signature": "0x8e72a9...",
  "hashlock": "0xf759119b...6694e1"
}
```

### Diagnostics Completed
- Approvals
  - Protocol allowance for BMN: sufficient
  - Factory approval for BMN: granted (max)
- Balances
  - Resolver BMN on Base: 2,000,000 BMN
- Extension vs salt
  - Verified: lower 160 bits of keccak256(extension) equal lower 160 bits of salt
- Endpoint inputs
  - Added `takerAmount`, `takerAsset`, and `takerTraits: 0`

### Hypotheses (needs Solidity-side confirmation)
1) Extension format expectations (1inch ExtensionLib)
   - Offsets array semantics (first 32 bytes). Our encoding sets only field 7 (PostInteractionData) length at bytes 28..31.
   - Confirm whether offsets must be cumulative or absolute lengths; and whether an empty CustomData (field 8) requires mirroring length.
2) MakerTraits bit layout
   - We set only: HAS_EXTENSION (bit 249) | POST_INTERACTION (bit 251).
   - Confirm if additional traits (e.g., private order sender constraints, partial fill flags) are required to accept `fillOrderArgs` with extension.
3) TakerTraits requirements
   - Using `takerTraits = 0`. Confirm if protocol expects specific bits for postInteraction flows.
4) postInteraction payload schema
   - `postInteractionData = factory(20 bytes) + abi.encode(escrow params)`; validate exact types and order vs protocol expectation at interaction point.
5) Factory-side gating
   - If the protocol forwards call/data to the factory, confirm if factory reverts with a custom error not present in protocol ABI, bubbling up as unknown selector `0xb2d25e49`.

### Requests for Contract Agent
1) Decode selector `0xb2d25e49` by reproducing the call in Foundry/Hardhat against:
   - Protocol: `fillOrderArgs(order, r, vs, amount, takerTraits, extensionData)` with the above order snapshot.
2) Inspect 1inch protocol/extension paths to confirm expected makerTraits/takerTraits and extension format for PostInteraction.
3) Validate `postInteractionData` ABI packing:
   - factory address + `encodeAbiParameters(address srcImpl, address dstImpl, uint256 timelocks, bytes32 hashlock, address srcMaker, address srcTaker, address srcToken, uint256 srcAmount, uint256 srcDeposit, address dstReceiver, address dstToken, uint256 dstAmount, uint256 dstDeposit, uint256 nonce)`.
4) Provide the exact failing require/assert and recommended fix (either in builder/traits or extension encoding).

### Notes
- Whitelisting and pause status have been reported as configured by ops. If additional gating exists (e.g. per-chain allowlist, epoch), please specify.
- Once resolved, `/fill-order` should complete and emit PostInteraction events; Alice service will auto-withdraw on `dst_created`.


