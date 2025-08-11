# Analysis and Fix for Missing PostInteraction Events

## 1. Summary of the Problem

The `bmn-evm-resolver` service successfully fills 1inch limit orders on-chain, but the expected `PostInteraction` events are not being emitted. This indicates that the post-fill logic, which is critical for creating escrows, is not being triggered.

The investigation confirms this is not a bug in the on-chain smart contracts. The contracts are functioning correctly. The issue stems from the **`bmn-evm-resolver` providing incorrectly formatted data** to the 1inch protocol's `fillOrder` function.

## 2. Root Cause Analysis

The root cause is a bug in the `encode1inchExtension` function located in `bmn-evm-resolver/src/utils/postinteraction-v2.ts`.

The 1inch `OffsetsLib.sol` contract expects a 32-byte `offsets` word where each 4-byte slot marks the **end position** of a corresponding data field in a concatenated byte string. The data for field `N` is read from the slice `[end_of_field_N-1 : end_of_field_N]`.

The current `encode1inchExtension` implementation is flawed:
- It incorrectly writes the **length** of the `postInteractionData` into its offset slot.
- It fails to provide a proper `(begin, end)` offset structure for the data, resulting in a malformed `offsets` word.

When the `ExtensionLib.sol` contract receives these malformed offsets, it correctly interprets them as "no data provided for `PostInteractionData`" and therefore does not execute the post-interaction call.

## 3. How to Fix the Bug

The fix requires correcting the logic in the `encode1inchExtension` function to properly pack the offsets according to the `OffsetsLib.sol` specification.

**File to Edit:** `bmn-evm-resolver/src/utils/postinteraction-v2.ts`

**Conceptual Fix:**

The function should be rewritten to build the `offsets` array correctly. Since only `PostInteractionData` (field index 7) contains data, the offsets should be set as follows:

1.  **Fields 0-6 (empty):** The end offsets for these fields are all `0`.
2.  **Field 7 (PostInteractionData):** The data for this field starts at byte 0 (immediately after the 32-byte offsets word). Its end offset is therefore its length.
3.  **Field 8 (CustomData):** This field is empty and comes after `PostInteractionData`. Its data starts where `PostInteractionData` ends, so its end offset is the same as the end offset for `PostInteractionData`.

### Proposed Implementation

Replace the current `encode1inchExtension` function with the following corrected version:

```typescript
export function encode1inchExtension(postInteractionData: Hex): Hex {
  // The extension contains 9 dynamic fields. The first 32 bytes of the
  // extension store the end-offsets of each of these fields.
  const offsets = new Uint32Array(8); // 8 * 4 bytes = 32 bytes

  const postInteractionLength = (postInteractionData.length - 2) / 2; // byte length

  // Fields 0-6 are empty. Their end-offsets are 0.
  // Field 7 (PostInteractionData) ends at `postInteractionLength`.
  offsets[7] = postInteractionLength;

  // The data for all fields is concatenated after the offsets.
  // Since fields 0-6 are empty, the postInteractionData starts at byte 0.
  const data = postInteractionData;

  // Convert offsets to a single 32-byte Hex string.
  // The Uint32Array is little-endian, so we must reverse it for big-endian encoding.
  const offsetsHex = `0x${Buffer.from(offsets.buffer).reverse().toString("hex")}` as Hex;

  return concat([offsetsHex, data]);
}
```
*Note: The proposed code snippet above is a conceptual guide. The endianness handling during the `Uint32Array` to `Hex` conversion (`.reverse()`) is critical and should be tested carefully to ensure it produces the correct big-endian byte order required by the EVM.*

## 4. Verification Steps

After applying the fix, verify it by following the end-to-end testing process:

1.  **Run Services:** Start the modified `bmn-evm-resolver` (`deno task bob`).
2.  **Create & Fill Order:** Create a new limit order and fill it using the resolver's `/fill-order` endpoint.
3.  **Check Events:** Use the `deno task decode:factory --tx <hash>` script to inspect the transaction events.
4.  **Confirm Success:** The output must now include `PostInteractionExecuted`, `SrcEscrowCreated`, and `DstEscrowCreated` events. The resolver logs should also show that it detected these events and stored the escrow details.
